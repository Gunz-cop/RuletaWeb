// ==========================================================
// EL IMPOSTOR — la página (DOM + WebSocket)
// ==========================================================
// Las reglas del juego viven en el servidor (impostor-logica.js, ejecutado
// por worker/sala.js): este archivo no decide nada. Recibe una vista de la
// sala ya recortada a lo que este jugador puede ver y la escribe en pantalla.
// Por eso aquí tampoco se importa la lista de palabras: solo
// impostor-comun.js, que no las trae.
//
// Cuatro cosas que no son obvias:
//
//  - El reloj no cuenta: resta. El servidor manda `turnoFin` como marca
//    absoluta y `ahora`; aquí se guarda la diferencia con el reloj local
//    (`desfase`) y cada 250 ms se calcula lo que falta. Un móvil con la hora
//    mal puesta, o que se bloquea y vuelve, muestra el tiempo real.
//  - Reconexión: al perder el socket (túnel, bloqueo de pantalla, cambio de
//    wifi a datos) se reintenta con espera creciente y el token guardado,
//    así que el jugador recupera su rol sin hacer nada.
//  - La tarjeta de rol se tapa sola a los 10 s y al salir de la pestaña.
//  - Todo texto de otro jugador entra con textContent, nunca con innerHTML.

import { normalizarCodigo, normalizarNombre } from './impostor-comun.js';

const SESION_KEY = 'decidelo_impostor_sesion';
const NOMBRE_KEY = 'decidelo_impostor_nombre';
const PING_MS = 25000;
const TAPAR_ROL_MS = 10000;
const REINTENTO_MAX_MS = 8000;

// Códigos de cierre que manda el servidor (worker/sala.js): ninguno de ellos
// se arregla reintentando.
const CIERRE_OTRA_PESTANA = 4001;
const CIERRE_QUITADO = 4002;
const CIERRE_RECHAZADO = 4003;
const CIERRE_NO_EXISTE = 4004;

const MENSAJE_CIERRE = {
  [CIERRE_OTRA_PESTANA]: 'Abriste la sala en otra pestaña. Recarga esta página si quieres volver aquí.',
  [CIERRE_QUITADO]: 'El anfitrión te quitó de la sala.',
  [CIERRE_RECHAZADO]: 'No se pudo entrar a la sala.',
  [CIERRE_NO_EXISTE]: 'Esa sala no existe o ya terminó.',
  1008: 'Demasiados mensajes seguidos. Recarga la página.',
};

function leer(clave) {
  try {
    const bruto = localStorage.getItem(clave);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    // Modo privado: la partida sigue, pero no se podrá reconectar tras recargar
  }
}

function init() {
  const app = document.getElementById('imp-app');
  if (!app || app.dataset.ready) return;
  app.dataset.ready = '1';

  const $ = (id) => document.getElementById('imp-' + id);
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN = Number(app.dataset.min) || 3;
  const MAX = Number(app.dataset.max) || 24;

  /* ---------- estado ---------- */
  let ws = null;
  let sesion = null; // { codigo, nombre, token }
  let estado = null; // última vista recibida
  let desfase = 0; // reloj del servidor − reloj local
  let intentos = 0;
  let reintento = null;
  let ping = null;
  let cerradoAposta = false;
  let mensajeFinal = '';
  let vistaActual = 'entrada';
  let rolAbierto = false;
  let tapaRol = null;
  let turnoAvisado = null;
  let confirmaSalir = null;
  let avisoSala = null;
  let wakeLock = null;
  let chat = []; // mensajes de esta partida, en orden
  let partidaChat = null;
  let noLeidos = 0;
  let turnoEnfocado = null;
  let enfocarPista = false;
  const tituloOriginal = document.title;

  /* ---------- utilidades de pantalla ---------- */
  const ocultar = (el, si) => { el.hidden = !!si; };

  function entrada(el) {
    if (reducido || !el.animate) return;
    el.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 220, easing: 'ease-out' },
    );
  }

  function mostrarVista(nombre) {
    for (const v of ['entrada', 'lobby', 'ronda', 'votacion', 'resultado']) {
      $('v-' + v).hidden = v !== nombre;
    }
    if (nombre !== vistaActual) {
      vistaActual = nombre;
      entrada($('v-' + nombre));
      if (nombre !== 'entrada') window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function aviso(texto) {
    const p = $('aviso');
    p.textContent = texto || '';
    p.hidden = !texto;
  }

  // Mensajes de la sala (permiso, fase…): van junto a la conexión, un rato
  function avisoEnSala(texto) {
    const c = $('conexion');
    c.textContent = texto;
    c.classList.add('is-caida');
    clearTimeout(avisoSala);
    avisoSala = setTimeout(pintarConexion, 4000);
  }

  function pintarConexion() {
    const c = $('conexion');
    const abierta = ws && ws.readyState === WebSocket.OPEN;
    c.textContent = abierta ? '' : 'Reconectando…';
    c.classList.toggle('is-caida', !abierta);
  }

  function nombreDe(id) {
    const j = estado && estado.jugadores.find((x) => x.id === id);
    return j ? j.nombre : '';
  }

  function plural(n, uno, varios) { return n === 1 ? uno : varios; }

  function formatoReloj(seg) {
    const s = Math.max(0, seg);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function fila(plantilla) { return $(plantilla).content.firstElementChild.cloneNode(true); }

  /* ---------- conexión ---------- */
  function urlSocket(codigo) {
    const esquema = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${esquema}://${location.host}/api/impostor/salas/${codigo}/ws`;
  }

  function conectar(nueva) {
    sesion = nueva;
    cerradoAposta = false;
    mensajeFinal = '';
    abrirSocket();
  }

  function abrirSocket() {
    clearTimeout(reintento);
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* ya cerrado */ } }
    ws = new WebSocket(urlSocket(sesion.codigo));
    pintarConexion();

    ws.onopen = () => {
      intentos = 0;
      ws.send(JSON.stringify({ t: 'hola', nombre: sesion.nombre, token: sesion.token || undefined }));
      clearInterval(ping);
      ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, PING_MS);
      pintarConexion();
    };

    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'bienvenida') {
        sesion.token = m.token;
        guardar(SESION_KEY, { codigo: sesion.codigo, nombre: sesion.nombre, token: sesion.token });
        history.replaceState(null, '', '#sala=' + sesion.codigo);
      } else if (m.t === 'chat') {
        recibirChat(m);
      } else if (m.t === 'estado') {
        desfase = m.ahora - Date.now();
        // Una partida nueva empieza con el chat en blanco
        if (m.partida !== partidaChat) { chat = []; partidaChat = m.partida; }
        estado = m;
        pintar();
      } else if (m.t === 'error') {
        if (['sala', 'empezada', 'llena', 'nombre'].includes(m.error)) mensajeFinal = m.mensaje;
        else avisoEnSala(m.mensaje || 'No se pudo hacer eso.');
      }
    };

    ws.onclose = (e) => {
      clearInterval(ping);
      if (cerradoAposta) return;
      if (e.code in MENSAJE_CIERRE) {
        if (e.code !== CIERRE_OTRA_PESTANA) guardar(SESION_KEY, null);
        volverAEntrada(mensajeFinal || MENSAJE_CIERRE[e.code]);
        return;
      }
      // Sin token no hay a qué volver: el primer intento de entrar falló
      if (!sesion.token) {
        volverAEntrada('No se pudo conectar. Revisa tu conexión e inténtalo otra vez.');
        return;
      }
      pintarConexion();
      intentos += 1;
      reintento = setTimeout(abrirSocket, Math.min(1000 * 2 ** (intentos - 1), REINTENTO_MAX_MS));
    };
  }

  function enviar(m) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    else avisoEnSala('Sin conexión. Reintentando…');
  }

  function volverAEntrada(mensaje) {
    cerradoAposta = true;
    clearTimeout(reintento);
    clearInterval(ping);
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* ya cerrado */ } ws = null; }
    estado = null;
    chat = [];
    partidaChat = null;
    rolAbierto = false;
    sesion = null;
    liberarPantalla();
    history.replaceState(null, '', location.pathname);
    $('barra').hidden = true;
    $('zona-rol').hidden = true;
    prepararEntrada();
    mostrarVista('entrada');
    aviso(mensaje || '');
  }

  /* ---------- pantalla encendida ---------- */
  async function mantenerPantalla() {
    try {
      if (navigator.wakeLock && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* no concedido: la partida sigue */ }
  }

  function liberarPantalla() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ya liberado */ }
    wakeLock = null;
  }

  /* ---------- pintar ---------- */
  function pintar() {
    if (!estado) return;
    const e = estado;
    const yo = e.yo;

    $('barra').hidden = false;
    $('barra-codigo').textContent = e.codigo;
    const enSala = e.jugadores.length;
    $('barra-n').textContent = `${enSala} ${plural(enSala, 'jugador', 'jugadores')}`;
    pintarConexion();

    const vista = { lobby: 'lobby', ronda: 'ronda', votacion: 'votacion', resultado: 'resultado' }[e.fase];
    if (e.fase === 'lobby') { rolAbierto = false; clearTimeout(tapaRol); }
    $('zona-rol').hidden = e.fase === 'lobby';
    if (e.fase !== 'lobby') pintarRol();

    if (e.fase === 'lobby') pintarLobby();
    if (e.fase === 'ronda') pintarRonda();
    if (e.fase === 'votacion') pintarVotacion();
    if (e.fase === 'resultado') pintarResultado();
    pintarChat();
    mostrarVista(vista);
    if (enfocarPista) { enfocarPista = false; $('pista').focus({ preventScroll: true }); }
    mantenerPantalla();
  }

  function pintarRol() {
    const { rol, yo } = estado;
    if (!rol) return;
    const tarjeta = $('rol');
    const cara = tarjeta.querySelector('.role-face');
    const dorso = tarjeta.querySelector('.role-back');
    const etiqueta = $('rol-etiqueta');
    const principal = $('rol-principal');
    const secundario = $('rol-secundario');

    tarjeta.classList.toggle('is-impostor', !!rol.impostor);
    if (rol.moderador) {
      etiqueta.textContent = 'Palabra de la partida';
      principal.textContent = rol.palabra;
      const quienes = rol.impostores.map((i) => i.nombre).join(', ');
      secundario.textContent = `Impostores: ${quienes}. Categoría: ${rol.categoria}.`;
    } else if (rol.impostor) {
      etiqueta.textContent = 'Tu rol';
      principal.textContent = 'IMPOSTOR';
      secundario.textContent = rol.categoria ? `Categoría: ${rol.categoria}` : 'No sabes la categoría. Escucha y disimula.';
    } else {
      etiqueta.textContent = 'Tu palabra';
      principal.textContent = rol.palabra;
      secundario.textContent = `Categoría: ${rol.categoria}`;
    }

    ocultar(cara, !rolAbierto);
    ocultar(dorso, rolAbierto);
    tarjeta.setAttribute('aria-pressed', String(rolAbierto));
    $('rol-nota').classList.toggle('is-importante', !yo.vivo && yo.juega);
    $('rol-nota').textContent = !yo.vivo && yo.juega
      ? 'Te sacaron de la partida. Sigue mirando, sin dar pistas.'
      : rolAbierto ? 'Toca otra vez para taparlo.' : 'Tápalo antes de que alguien mire tu pantalla.';
  }

  function alternarRol() {
    rolAbierto = !rolAbierto;
    clearTimeout(tapaRol);
    if (rolAbierto) tapaRol = setTimeout(() => { rolAbierto = false; pintarRol(); }, TAPAR_ROL_MS);
    pintarRol();
    if (rolAbierto) entrada(document.querySelector('.role-face'));
  }

  /* ----- lobby ----- */
  function pintarLobby() {
    const e = estado;
    const host = e.yo.anfitrion;
    $('lobby-codigo').textContent = e.codigo;
    const enlace = `${location.origin}${location.pathname}#sala=${e.codigo}`;
    $('wa').href = 'https://wa.me/?text=' + encodeURIComponent(`Juega al impostor con nosotros: ${enlace}`);
    $('lobby-n').textContent = `${e.jugadores.length} de ${e.max}`;

    const lista = $('lista-lobby');
    lista.replaceChildren(...e.jugadores.map((j, i) => {
      const li = fila('tpl-lobby');
      li.querySelector('.imp-fila-num').textContent = String(i + 1).padStart(2, '0');
      li.querySelector('.imp-fila-nombre').textContent = j.nombre;
      const notas = [];
      if (j.anfitrion) notas.push('Anfitrión');
      if (j.id === e.yo.id) notas.push('Tú');
      if (!j.conectado) notas.push('Sin conexión');
      li.querySelector('.imp-fila-notas').textContent = notas.join(' · ');
      li.classList.toggle('is-desconectado', !j.conectado);
      const quitar = li.querySelector('.imp-fila-accion');
      quitar.hidden = !(host && !j.anfitrion);
      quitar.setAttribute('aria-label', `Quitar a ${j.nombre}`);
      quitar.addEventListener('click', () => enviar({ t: 'quitar', id: j.id }));
      return li;
    }));

    const c = e.config;
    const juegan = e.jugadores.length - (c.anfitrionJuega ? 0 : 1);
    const maximo = Math.max(1, Math.floor((juegan - 1) / 2));
    const impostores = Math.min(c.impostores > 0 ? c.impostores : c.impostoresAuto, maximo);

    ocultar($('lobby-host'), !host);
    ocultar($('resumen'), host);
    ocultar($('ceder-bloque'), !host || e.jugadores.length < 2);
    ocultar($('iniciar'), !host);
    ocultar($('espera'), host);

    if (host) {
      sincronizar($('cfg-categoria'), c.categoria);
      sincronizar($('cfg-impostores'), String(c.impostores));
      sincronizar($('cfg-segundos'), String(c.segundos));
      sincronizar($('cfg-vueltas'), String(c.vueltas));
      sincronizarCheck($('cfg-juega'), c.anfitrionJuega);
      sincronizarCheck($('cfg-categoria-visible'), c.impostorVeCategoria);
      sincronizarCheck($('cfg-distancia'), c.aDistancia);
      $('cfg-nota').textContent = `Con ${juegan} ${plural(juegan, 'jugador', 'jugadores')} habrá ${impostores} ${plural(impostores, 'impostor', 'impostores')}.`;

      const sel = $('ceder-sel');
      const previo = sel.value;
      sel.replaceChildren(...e.jugadores.filter((j) => !j.anfitrion).map((j) => {
        const o = document.createElement('option');
        o.value = String(j.id);
        o.textContent = j.nombre;
        return o;
      }));
      if (previo) sel.value = previo;

      const faltan = MIN - juegan;
      $('iniciar').disabled = faltan > 0;
      $('faltan').hidden = faltan <= 0;
      $('faltan').textContent = faltan > 0 ? `${faltan === 1 ? 'Falta' : 'Faltan'} ${faltan} ${plural(faltan, 'jugador', 'jugadores')} para empezar.` : '';
    } else {
      const cat = c.categoria === 'azar' ? 'categoría al azar' : `categoría ${$('cfg-categoria').querySelector(`option[value="${c.categoria}"]`)?.textContent.toLowerCase() || ''}`;
      $('resumen').textContent = `Partida: ${cat}, ${c.segundos} segundos por turno, ${c.vueltas} ${plural(c.vueltas, 'vuelta', 'vueltas')}, ${impostores} ${plural(impostores, 'impostor', 'impostores')}${c.aDistancia ? ', a distancia (pistas escritas y chat)' : ''}.`;
      $('faltan').hidden = true;
    }
  }

  // No se pisa un campo mientras alguien lo está tocando
  function sincronizar(el, valor) {
    if (document.activeElement !== el && el.value !== valor) el.value = valor;
  }
  function sincronizarCheck(el, valor) {
    if (document.activeElement !== el && el.checked !== valor) el.checked = valor;
  }

  /* ----- ronda ----- */
  function pintarRonda() {
    const e = estado;
    const r = e.ronda;
    const host = e.yo.anfitrion;
    const nOrden = r.orden.length;
    const vuelta = Math.min(Math.floor(r.turno / nOrden) + 1, r.vueltas);
    $('ronda-etiqueta').textContent = `Ronda ${r.n} · ${nOrden} ${plural(nOrden, 'jugador', 'jugadores')} · vuelta ${vuelta} de ${r.vueltas}`;

    const turno = $('turno');
    const mio = r.de === e.yo.id;
    turno.classList.toggle('is-mio', mio);
    ocultar($('reloj'), r.terminada);
    if (r.terminada) {
      $('turno-etiqueta').textContent = 'Ronda de pistas terminada';
      $('turno-nombre').textContent = 'Todos hablaron';
      $('turno-sigue').textContent = 'Es hora de votar.';
    } else {
      $('turno-etiqueta').textContent = `Turno ${r.turno + 1} de ${r.total}`;
      $('turno-nombre').textContent = mio ? `${nombreDe(r.de)} (tú)` : nombreDe(r.de);
      const siguiente = r.turno + 1 < r.total ? r.orden[(r.turno + 1) % nOrden] : null;
      $('turno-sigue').textContent = mio ? 'Te toca dar tu pista.' : siguiente ? `Sigue: ${nombreDe(siguiente)}` : 'Es el último turno.';
      if (mio && turnoAvisado !== r.turno + ':' + r.n) {
        turnoAvisado = r.turno + ':' + r.n;
        try { navigator.vibrate && navigator.vibrate(200); } catch (err) { /* sin vibración */ }
      }
    }
    pintarReloj();

    ocultar($('ronda-host'), !host);
    if (host) {
      const sinEmpezar = r.turno === 0 && r.turnoFin === null && r.pausaRestante === r.segundos * 1000;
      const principal = $('turno-principal');
      principal.textContent = r.terminada ? 'Pasar a votación' : sinEmpezar ? 'Empezar turno' : 'Siguiente jugador';
      principal.dataset.accion = r.terminada ? 'votacion' : sinEmpezar ? 'empezar' : 'siguiente';
      const corriendo = r.turnoFin !== null;
      $('pausa').textContent = corriendo ? 'Pausar' : 'Reanudar';
      $('pausa').disabled = r.terminada || sinEmpezar;
      $('mas').disabled = r.terminada;
      $('reiniciar').disabled = r.terminada || sinEmpezar;
      $('votar-ya').hidden = r.terminada;
    }

    const aDistancia = !!e.config.aDistancia;
    const puedeEscribir = aDistancia && mio && !r.terminada && !r.yaEnvioPista && e.yo.juega && e.yo.vivo;
    const form = $('pista-form');
    ocultar(form, !puedeEscribir);
    ocultar($('pista-enviada'), !(aDistancia && mio && r.yaEnvioPista));
    if (puedeEscribir) {
      const clave = `${r.n}:${r.turno}`;
      // El foco se pide al final de pintar(): aquí la vista aún puede estar oculta
      if (turnoEnfocado !== clave) { turnoEnfocado = clave; $('pista').value = ''; enfocarPista = true; }
    }
    $('turnos-titulo').textContent = aDistancia ? 'Pistas' : 'Orden de turnos';

    const pos = r.terminada ? nOrden : r.turno % nOrden;
    $('lista-turnos').replaceChildren(...r.orden.map((id, i) => {
      const j = e.jugadores.find((x) => x.id === id);
      const li = fila('tpl-turno');
      li.querySelector('.imp-fila-num').textContent = String(i + 1).padStart(2, '0');
      li.querySelector('.imp-fila-nombre').textContent = j ? j.nombre : '';
      const notas = [];
      if (i === pos && !r.terminada) notas.push('Ahora');
      if (id === e.yo.id) notas.push('Tú');
      if (j && !j.conectado) notas.push('Sin conexión');
      li.querySelector('.imp-fila-notas').textContent = notas.join(' · ');
      li.classList.toggle('is-ahora', i === pos && !r.terminada);
      li.classList.toggle('is-hecho', i < pos);
      li.classList.toggle('is-desconectado', !!j && !j.conectado);
      if (aDistancia) {
        const texto = (e.pistas || []).filter((p) => p.id === id).map((p) => p.texto).join(' · ');
        const hablando = i === pos && !r.terminada;
        const ya = i < pos || r.terminada;
        ponerPista(li.querySelector('.imp-fila-pista'), texto, hablando ? 'Pensando…' : ya ? 'Sin pista' : '');
      }
      return li;
    }));
  }

  // La pista de una fila: su texto, o un texto de apoyo en gris si aún no hay
  function ponerPista(el, texto, apoyo) {
    el.textContent = texto || apoyo;
    el.classList.toggle('is-vacia', !texto);
    el.hidden = !texto && !apoyo;
  }

  function pintarReloj() {
    if (!estado || estado.fase !== 'ronda') return;
    const r = estado.ronda;
    if (r.terminada) return;
    const reloj = $('reloj');
    const corriendo = r.turnoFin !== null;
    const resto = corriendo ? r.turnoFin - (Date.now() + desfase) : r.pausaRestante;
    const seg = Math.max(0, Math.ceil(resto / 1000));
    const texto = formatoReloj(seg);
    if (reloj.textContent !== texto) reloj.textContent = texto;
    reloj.classList.toggle('is-pausa', !corriendo);
    reloj.classList.toggle('is-agotado', corriendo && seg === 0);
  }

  /* ----- votación ----- */
  function pintarVotacion() {
    const e = estado;
    const v = e.votacion;
    const host = e.yo.anfitrion;
    const faltan = e.jugadores.filter((j) => j.juega && j.vivo && !j.yaVoto);
    let texto = `Han votado ${v.votaron} de ${v.total}.`;
    if (faltan.length && faltan.length <= 6) texto += ` Faltan: ${faltan.map((j) => j.nombre).join(', ')}.`;
    else if (faltan.length) texto += ` Faltan ${faltan.length}.`;
    if (!v.puedeVotar) texto = `Estás mirando. ${texto}`;
    $('votacion-progreso').textContent = texto;

    $('lista-votos').replaceChildren(...e.jugadores.filter((j) => j.juega && j.vivo && j.id !== e.yo.id).map((j) => {
      const li = fila('tpl-voto');
      const boton = li.querySelector('.imp-voto');
      li.querySelector('.imp-voto-nombre').textContent = j.nombre;
      const elegido = v.miVoto === j.id;
      boton.setAttribute('aria-pressed', String(elegido));
      li.querySelector('.imp-voto-nota').textContent = elegido ? 'Tu voto' : '';
      boton.disabled = !v.puedeVotar;
      boton.addEventListener('click', () => enviar({ t: 'votar', por: j.id }));
      return li;
    }));

    ocultar($('votacion-host'), !host);

    const aDistancia = !!e.config.aDistancia;
    ocultar($('pistas-vot'), !aDistancia);
    ocultar($('ir-chat'), !aDistancia);
    if (aDistancia && e.ronda) {
      const r = e.ronda;
      $('lista-pistas-vot').replaceChildren(...Array.from({ length: r.total }, (_, t) => {
        const li = fila('tpl-turno');
        li.querySelector('.imp-fila-num').textContent = String(t + 1).padStart(2, '0');
        li.querySelector('.imp-fila-nombre').textContent = nombreDe(r.orden[t % r.orden.length]);
        const p = (e.pistas || []).find((x) => x.turno === t);
        ponerPista(li.querySelector('.imp-fila-pista'), p ? p.texto : '', 'Sin pista');
        return li;
      }));
    }
  }

  /* ----- chat ----- */
  function recibirChat(m) {
    const nuevos = m.historial || [m.mensaje];
    const conocidos = new Set(chat.map((x) => x.id));
    for (const x of nuevos) if (x && !conocidos.has(x.id)) chat.push(x);
    chat.sort((a, b) => a.id - b.id);
    // Con la pestaña oculta se cuentan los mensajes de otros en el título
    if (m.mensaje && document.hidden && estado && m.mensaje.de !== estado.yo.id) {
      noLeidos += 1;
      document.title = `(${noLeidos}) ${tituloOriginal}`;
    }
    if (estado) pintarChat();
  }

  function pintarChat() {
    const e = estado;
    const abierto = !!(e && e.chat && e.chat.abierto);
    ocultar($('chat'), !abierto);
    if (!abierto) return;
    const yo = e.yo;
    const log = $('chat-log');
    const alFinal = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.replaceChildren(...chat.map((m) => {
      const li = fila('tpl-chat');
      li.querySelector('.imp-chat-autor').textContent = nombreDe(m.de) || '?';
      li.querySelector('.imp-chat-cuerpo').textContent = m.texto;
      li.classList.toggle('is-mio', m.de === yo.id);
      const quien = e.jugadores.find((x) => x.id === m.de);
      const boton = li.querySelector('.imp-chat-silenciar');
      boton.hidden = !(yo.anfitrion && m.de !== yo.id && quien);
      if (quien) {
        boton.textContent = quien.silenciado ? 'Quitar silencio' : 'Silenciar';
        boton.addEventListener('click', () => enviar({ t: 'silenciar', id: m.de, valor: !quien.silenciado }));
      }
      return li;
    }));
    if (alFinal) log.scrollTop = log.scrollHeight;
    $('chat-n').textContent = `${chat.length} ${plural(chat.length, 'mensaje', 'mensajes')}`;
    const puede = e.chat.puedeEscribir;
    const campo = $('chat-texto');
    campo.disabled = !puede;
    $('chat-enviar').disabled = !puede;
    const yoFila = e.jugadores.find((x) => x.id === yo.id);
    campo.placeholder = puede ? 'Escribe un mensaje'
      : yoFila && yoFila.silenciado ? 'El anfitrión te silenció' : 'Puedes leer, no escribir';
  }

  /* ----- resultado ----- */
  function pintarResultado() {
    const e = estado;
    const res = e.resultado;
    const host = e.yo.anfitrion;
    if (res.empate) {
      $('res-principal').textContent = 'Empate: nadie se va';
      $('res-lado').textContent = 'Siguen todos en la partida';
    } else {
      $('res-principal').textContent = `${nombreDe(res.expulsado)} se va`;
      $('res-lado').textContent = res.eraImpostor ? 'Era impostor' : 'No era impostor';
    }
    if (res.ganan) {
      $('res-lado').textContent += res.ganan === 'grupo' ? ' · Gana el grupo' : ' · Ganan los impostores';
    }

    ocultar($('final'), !res.ganan);
    if (res.ganan) {
      $('final-palabra').textContent = res.palabra;
      $('final-categoria').textContent = `Categoría: ${res.categoria}`;
      const nombres = res.impostores.map((i) => i.nombre);
      $('final-etiqueta').textContent = nombres.length === 1 ? 'El impostor era' : 'Los impostores eran';
      $('final-impostores').textContent = nombres.join(', ');
    }

    ocultar($('continuar'), !(host && !res.ganan));
    ocultar($('nueva'), !(host && res.ganan));
    ocultar($('resultado-espera'), host);

    const filas = Object.entries(res.conteo)
      .map(([id, n]) => ({ id: Number(id), n }))
      .sort((a, b) => b.n - a.n);
    $('lista-conteo').replaceChildren(...(filas.length ? filas : [null]).map((f, i) => {
      const li = fila('tpl-conteo');
      if (!f) {
        li.querySelector('.imp-fila-num').textContent = '';
        li.querySelector('.imp-fila-nombre').textContent = 'Nadie votó';
        li.querySelector('.imp-fila-notas').textContent = '';
        return li;
      }
      li.querySelector('.imp-fila-num').textContent = String(i + 1).padStart(2, '0');
      li.querySelector('.imp-fila-nombre').textContent = nombreDe(f.id);
      li.querySelector('.imp-fila-notas').textContent = `${f.n} ${plural(f.n, 'voto', 'votos')}`;
      return li;
    }));
  }

  /* ---------- entrada ---------- */
  function codigoDeUrl() {
    const bruto = (location.hash.match(/sala=([A-Za-z]+)/) || location.search.match(/sala=([A-Za-z]+)/) || [])[1];
    return bruto ? normalizarCodigo(bruto) : '';
  }

  function prepararEntrada() {
    const invitado = codigoDeUrl();
    $('nombre').value = $('nombre').value || leer(NOMBRE_KEY) || '';
    ocultar($('bloque-crear'), !!invitado);
    ocultar($('invitacion'), !invitado);
    ocultar($('unirse-titulo'), !!invitado);
    $('unirse').classList.toggle('is-principal', !!invitado);
    $('unirse').textContent = invitado ? 'Entrar a la sala' : 'Unirme';
    if (invitado) $('codigo').value = invitado;
    $('bloque-unirse').classList.toggle('mt-8', !invitado);
    $('bloque-unirse').classList.toggle('pt-6', !invitado);
  }

  function nombreValido() {
    const nombre = normalizarNombre($('nombre').value);
    if (!nombre) {
      aviso('Escribe tu nombre para entrar.');
      $('nombre').focus();
      return '';
    }
    guardar(NOMBRE_KEY, nombre);
    return nombre;
  }

  async function crearSala() {
    const nombre = nombreValido();
    if (!nombre) return;
    aviso('');
    const boton = $('crear');
    boton.disabled = true;
    try {
      const r = await fetch('/api/impostor/salas', { method: 'POST', body: JSON.stringify({ nombre }) });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(datos.mensaje || 'No se pudo crear la sala. Inténtalo otra vez.'); return; }
      conectar({ codigo: datos.codigo, nombre, token: datos.token });
    } catch (err) {
      aviso('No se pudo conectar. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      boton.disabled = false;
    }
  }

  function unirse() {
    const nombre = nombreValido();
    if (!nombre) return;
    const codigo = normalizarCodigo($('codigo').value);
    if (!codigo) {
      aviso('El código de la sala son 5 letras.');
      $('codigo').focus();
      return;
    }
    aviso('');
    const previa = leer(SESION_KEY);
    // Mismo código y mismo navegador: es alguien que vuelve, no uno nuevo
    conectar({ codigo, nombre, token: previa && previa.codigo === codigo ? previa.token : undefined });
  }

  /* ---------- acciones ---------- */
  function ligar() {
    $('crear').addEventListener('click', crearSala);
    $('unirse').addEventListener('click', unirse);
    $('nombre').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if ($('bloque-crear').hidden) unirse();
      else crearSala();
    });
    $('codigo').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') unirse();
    });
    $('codigo').addEventListener('input', () => {
      $('codigo').value = $('codigo').value.toUpperCase().replace(/[^A-Z]/g, '');
    });

    $('rol').addEventListener('click', alternarRol);
    // Un botón, no un enlace a #imp-chat: cambiaría el fragmento de la URL,
    // que es donde viaja el código de la sala
    $('ir-chat').addEventListener('click', () => $('chat').scrollIntoView({ behavior: reducido ? 'auto' : 'smooth' }));

    $('pista-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const texto = $('pista').value.trim();
      if (!texto) { $('pista').focus(); return; }
      enviar({ t: 'pista', texto });
    });
    $('chat-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const campo = $('chat-texto');
      const texto = campo.value.trim();
      if (!texto) return;
      enviar({ t: 'chat', texto });
      campo.value = '';
    });

    $('copiar').addEventListener('click', async () => {
      const enlace = `${location.origin}${location.pathname}#sala=${estado ? estado.codigo : ''}`;
      const boton = $('copiar');
      try {
        await navigator.clipboard.writeText(enlace);
        boton.textContent = 'Enlace copiado';
      } catch (err) {
        boton.textContent = enlace;
      }
      setTimeout(() => { boton.textContent = 'Copiar enlace'; }, 2500);
    });

    $('iniciar').addEventListener('click', () => enviar({ t: 'iniciar' }));
    const cfg = (id, campo, valor) => $(id).addEventListener('change', () => enviar({ t: 'config', cambios: { [campo]: valor($(id)) } }));
    cfg('cfg-categoria', 'categoria', (el) => el.value);
    cfg('cfg-impostores', 'impostores', (el) => Number(el.value));
    cfg('cfg-segundos', 'segundos', (el) => Number(el.value));
    cfg('cfg-vueltas', 'vueltas', (el) => Number(el.value));
    cfg('cfg-juega', 'anfitrionJuega', (el) => el.checked);
    cfg('cfg-categoria-visible', 'impostorVeCategoria', (el) => el.checked);
    cfg('cfg-distancia', 'aDistancia', (el) => el.checked);
    $('ceder').addEventListener('click', () => {
      const id = Number($('ceder-sel').value);
      if (id) enviar({ t: 'ceder', id });
    });

    $('turno-principal').addEventListener('click', () => {
      const accion = $('turno-principal').dataset.accion;
      if (accion === 'votacion') enviar({ t: 'votacion' });
      else enviar({ t: 'turno', op: accion });
    });
    $('pausa').addEventListener('click', () => enviar({ t: 'turno', op: estado && estado.ronda && estado.ronda.turnoFin !== null ? 'pausar' : 'empezar' }));
    $('mas').addEventListener('click', () => enviar({ t: 'turno', op: 'mas' }));
    $('reiniciar').addEventListener('click', () => enviar({ t: 'turno', op: 'reiniciar' }));
    $('votar-ya').addEventListener('click', () => enviar({ t: 'votacion' }));

    $('cerrar').addEventListener('click', () => enviar({ t: 'cerrar' }));
    $('continuar').addEventListener('click', () => enviar({ t: 'continuar' }));
    $('nueva').addEventListener('click', () => enviar({ t: 'nueva' }));

    // Salir en dos toques: con 22 personas, un toque sin querer no debería
    // dejar a nadie fuera de su turno
    $('salir').addEventListener('click', () => {
      const boton = $('salir');
      if (!confirmaSalir) {
        boton.textContent = '¿Seguro?';
        confirmaSalir = setTimeout(() => { boton.textContent = 'Salir'; confirmaSalir = null; }, 4000);
        return;
      }
      clearTimeout(confirmaSalir);
      confirmaSalir = null;
      boton.textContent = 'Salir';
      enviar({ t: 'salir' });
      guardar(SESION_KEY, null);
      volverAEntrada('');
    });

    // Un móvil que se bloquea pierde el socket sin avisar: al volver se
    // comprueba y se reconecta sin esperar al siguiente reintento
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && noLeidos) { noLeidos = 0; document.title = tituloOriginal; }
      if (document.hidden) {
        if (rolAbierto) { rolAbierto = false; clearTimeout(tapaRol); if (estado) pintarRol(); }
        return;
      }
      if (sesion && sesion.token && !cerradoAposta && (!ws || ws.readyState !== WebSocket.OPEN)) {
        intentos = 0;
        abrirSocket();
      }
      if (estado) mantenerPantalla();
    });
  }

  /* ---------- arranque ---------- */
  ligar();
  prepararEntrada();
  setInterval(pintarReloj, 250);

  // Si había una sesión guardada de esta sala (o ninguna sala en el enlace),
  // se vuelve a ella sin pedir nada: recargar la página no echa a nadie
  const guardada = leer(SESION_KEY);
  const enlace = codigoDeUrl();
  if (guardada && guardada.token && (!enlace || enlace === guardada.codigo)) {
    conectar({ codigo: guardada.codigo, nombre: guardada.nombre, token: guardada.token });
    mostrarVista('entrada');
    aviso('Volviendo a tu sala…');
  } else if (guardada && enlace && enlace !== guardada.codigo) {
    guardar(SESION_KEY, null);
  }
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('astro:page-load', init);
if (document.readyState !== 'loading') init();
