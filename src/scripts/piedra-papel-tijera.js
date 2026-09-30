// ==========================================================
// PIEDRA, PAPEL O TIJERA — contra la máquina o dos jugadores
// ==========================================================
// La apariencia vive en PptHands.astro, HandShape.astro y la página. Aquí se
// decide la jugada de la máquina, se anima con la Web Animations API y se
// escribe el texto. Las manos siguen el ciclo de movimiento de DESIGN.md:
// entran desde su lado al cargar, respiran en reposo, marcan el "piedra,
// papel, tijera" en cada ronda y se asientan al enseñar la jugada.
// Con dos jugadores se elige por turnos en el mismo móvil: la jugada del
// primero no se ve en ningún sitio hasta que el segundo elige. A distancia,
// el reto va y vuelve por un enlace (lógica en ppt-reto.js).

import { ganador as ganadorDe, nuevoId, crearReto, crearResultado, leerFragmento, NAME_MAX, STAKE_MAX } from './ppt-reto.js';

// Formato heredado de la versión anterior ({ victorias, derrotas, empates }):
// se sigue usando tal cual para el marcador contra la máquina.
const SCORE_KEY = 'decidelo_ppt_score';
const SCORE_DOS_KEY = 'decidelo_ppt_score_dos';
const MODE_KEY = 'decidelo_ppt_modo';
const NAMES_KEY = 'decidelo_ppt_nombres';
const HISTORY_KEY = 'decidelo_ppt_historial';
const STAKE_KEY = 'decidelo_ppt_castigo';
// Retos de este navegador: { id: { e1 } } si lo creó, { id: { e2 } } si lo
// respondió. Así, reabrir un reto ya respondido enseña el mismo resultado en
// vez de dejar elegir otra vez.
const RETOS_KEY = 'decidelo_ppt_retos';
const RETOS_MAX = 30;
const HISTORY_MAX = 10;
const MODOS = ['maquina', 'dos', 'distancia'];

// Tres golpes de ~330ms (uno por palabra) + el asiento: unos 1,4 s, dentro
// del margen de DESIGN.md.
const ENTRY_MS = 900;
const PUMP_MS = 330;
const LAND_MS = 380;
const IDLE_MS = 1700;
const REDUCED_MS = 200;
// Al enseñar la jugada, la mano se abre fotograma a fotograma (imágenes en
// src/assets/ppt/): cinco pasos, el 5.º con rebote, unos 0,35 s en total.
const FRAME_MS = 70;
const PASOS = [2, 3, 4, 5, 6];

const FORMAS = ['piedra', 'papel', 'tijera'];
const NOMBRE = { piedra: 'Piedra', papel: 'Papel', tijera: 'Tijera' };
const VERBO = { piedra: 'aplasta', papel: 'envuelve', tijera: 'corta' };
const CANTO = ['Piedra…', 'papel…', 'tijera…'];

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Modo privado o almacenamiento bloqueado: el juego sigue funcionando
  }
}

function randomIndex(n) {
  if (window.crypto && window.crypto.getRandomValues) {
    // Rechazo del sobrante para que las tres jugadas pesen exactamente igual
    const limite = Math.floor(4294967296 / n) * n;
    const values = new Uint32Array(1);
    do window.crypto.getRandomValues(values); while (values[0] >= limite);
    return values[0] % n;
  }
  return Math.floor(Math.random() * n);
}

const entero = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function leerMarcador(modo) {
  if (modo === 'dos') {
    const s = readStore(SCORE_DOS_KEY, {}) ?? {};
    return { j1: entero(s.j1), j2: entero(s.j2), empates: entero(s.empates) };
  }
  const s = readStore(SCORE_KEY, {}) ?? {};
  return { j1: entero(s.victorias), j2: entero(s.derrotas), empates: entero(s.empates) };
}

function guardarMarcador(modo, m) {
  if (modo === 'dos') writeStore(SCORE_DOS_KEY, m);
  else writeStore(SCORE_KEY, { victorias: m.j1, derrotas: m.j2, empates: m.empates });
}

function leerHistorial() {
  const raw = readStore(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && FORMAS.includes(h.e1) && FORMAS.includes(h.e2) && typeof h.texto === 'string')
    .slice(-HISTORY_MAX);
}

function initPPT() {
  const $ = (id) => document.getElementById(id);
  const object = $('ppt-object');
  const choices = [...document.querySelectorAll('#ppt-choices .ppt-choice')];
  const modeBtns = [...document.querySelectorAll('[data-mode]')];
  const nameInputs = [$('ppt-name-input-1'), $('ppt-name-input-2')];
  const turn = $('ppt-turn');
  const choicesBox = $('ppt-choices');
  const handoff = $('ppt-handoff');
  const btnPass = $('btn-pass');
  const stakeBox = $('ppt-stake');
  const btnStake = $('btn-stake');
  const stakeInput = $('ppt-stake-input');
  const share = $('ppt-share');
  const btnShare = $('btn-share');
  const btnCopy = $('btn-copy');
  const btnNew = $('btn-new');
  const shareMsg = $('ppt-share-msg');
  const resultStake = $('ppt-result-stake');
  const result = $('ppt-result');
  const resultMain = $('ppt-result-main');
  const resultSide = $('ppt-result-side');
  const historyList = $('history-list');
  const historyCount = $('history-count');
  const btnClear = $('btn-clear');
  const lados = [1, 2].map((n) => ({
    side: $(`ppt-side-${n}`),
    rig: $(`ppt-rig-${n}`),
    hand: $(`ppt-hand-${n}`),
    floor: $(`ppt-floor-${n}`),
    frames: [...($(`ppt-hand-${n}`)?.querySelectorAll('.ppt-shape') ?? [])],
    name: $(`ppt-name-${n}`),
    score: $(`ppt-score-${n}`),
    // La mano derecha es la izquierda en espejo: gira al revés
    giro: n === 1 ? -1 : 1,
  }));

  if (!object || !result || choices.length !== 3 || object.dataset.ready) return;
  object.dataset.ready = 'true';

  // Enciende un fotograma de una mano; `forma` queda en data-forma para CSS
  // y tests
  function pintar(l, frame, forma) {
    l.frames.forEach((p) => p.classList.toggle('is-on', p.dataset.frame === frame));
    if (l.hand) l.hand.dataset.forma = forma;
  }

  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = (a) => a?.finished.catch(() => {});

  // --- Estado ------------------------------------------------------------------
  const guardado = readStore(MODE_KEY, 'maquina');
  let modo = MODOS.includes(guardado) ? guardado : 'maquina';
  if (stakeInput) stakeInput.value = String(readStore(STAKE_KEY, '') || '').slice(0, STAKE_MAX);
  const guardados = readStore(NAMES_KEY, []);
  nameInputs.forEach((input, i) => {
    if (input) input.value = String((Array.isArray(guardados) && guardados[i]) || '').slice(0, NAME_MAX);
  });
  let marcador = leerMarcador(modo);
  let history = leerHistorial();
  let busy = false;
  let pendiente = null; // jugada del jugador 1 mientras elige el 2
  let pasado = false; // el jugador 2 ya tiene el móvil

  // A distancia. `enlace` es lo que trae la URL al abrir la página
  // (#reto=… o #resultado=…); `enviado`, el reto que se acaba de crear aquí.
  let enlace = leerFragmento(location.hash);
  let enviado = null; // { id, a, b, q, e1, url }
  let respuesta = null; // { e2, url } cuando este móvil ya respondió el reto
  let visto = false; // el resultado devuelto ya se abrió
  let stakeAbierto = false; // «+ ¿Qué se decide?» ya pulsado
  const retos = () => readStore(RETOS_KEY, {}) || {};
  function recordarReto(id, datos) {
    const todos = { ...retos(), [id]: { ...retos()[id], ...datos } };
    const ids = Object.keys(todos);
    ids.slice(0, Math.max(0, ids.length - RETOS_MAX)).forEach((k) => delete todos[k]);
    writeStore(RETOS_KEY, todos);
  }
  const enReto = () => enlace && enlace.tipo !== 'roto';

  const nombres = () => {
    if (enReto()) return [enlace.a || 'Quien reta', enlace.b || (enlace.tipo === 'reto' ? 'Tú' : 'Tu rival')];
    if (modo === 'maquina') return ['Tú', 'Máquina'];
    const vacio = modo === 'distancia' ? ['Tú', 'Tu rival'] : ['Jugador 1', 'Jugador 2'];
    return nameInputs.map((input, i) => input?.value.trim() || vacio[i]);
  };

  // Lo que se decide: el del enlace, o el que se escribe en los modos de dos
  const castigo = () => {
    if (enReto()) return enlace.q;
    return modo === 'maquina' ? '' : (stakeInput?.value.trim() ?? '');
  };

  function pintarNombres() {
    const [n1, n2] = nombres();
    lados[0].name.textContent = n1;
    lados[1].name.textContent = n2;
  }

  function pintarMarcador() {
    lados[0].score.textContent = marcador.j1;
    lados[1].score.textContent = marcador.j2;
  }

  function textoTurno() {
    const [n1, n2] = nombres();
    const q = castigo();
    if (enlace?.tipo === 'roto') return 'Ese enlace de reto está incompleto. Pide que te lo reenvíen.';
    if (enlace?.tipo === 'reto') {
      if (respuesta) return `Mándale el resultado a ${n1}`;
      return `${n1} te reta${q ? `: quien pierda ${q}` : ''}. Elige tu jugada`;
    }
    if (enlace?.tipo === 'resultado') return visto ? 'Así quedó tu reto' : `${n2} respondió tu reto`;
    if (modo === 'maquina') return 'Elige tu jugada';
    if (modo === 'distancia') {
      const rival = nameInputs[1]?.value.trim();
      if (enviado) return `Tu jugada quedó sellada. Envíale el reto a ${rival || 'tu rival'}`;
      return rival ? `Elige tu jugada y envíale el reto a ${rival}` : 'Elige tu jugada y envía el reto';
    }
    if (pendiente && !pasado) return `Listo, ${n1}. Pásale el móvil a ${n2}`;
    if (pendiente) return `Tu turno, ${n2}. ${n1} ya eligió`;
    if (!nameInputs.some((i) => i?.value.trim())) return 'Pongan sus nombres bajo las manos';
    return `Elige ${n1}, sin que ${n2} mire`;
  }

  function pintarTurno() {
    const [, n2] = nombres();
    if (btnPass) btnPass.textContent = enlace?.tipo === 'resultado' ? 'Ver resultado' : `Soy ${n2}: elegir`;
    if (turn) turn.textContent = textoTurno();
    vista();
  }

  // Qué bloque ocupa el sitio de la acción: las jugadas, el botón de pasar
  // el móvil (o de ver el resultado) o el de compartir
  function vista() {
    const pasar = (modo === 'dos' && !enlace && pendiente && !pasado) || (enlace?.tipo === 'resultado' && !visto);
    const compartir = (!enlace && modo === 'distancia' && enviado) || (enlace?.tipo === 'reto' && respuesta);
    const jugadas = !pasar && !compartir && enlace?.tipo !== 'roto' && enlace?.tipo !== 'resultado';
    if (choicesBox) choicesBox.hidden = !jugadas;
    if (handoff) handoff.hidden = !pasar;
    if (share) share.hidden = !compartir;
    // «Quien pierda» va plegado tras un enlace discreto; abierto si ya
    // tiene algo escrito
    const conCastigo = !enlace && modo !== 'maquina' && !enviado && !pendiente;
    const abierto = stakeAbierto || !!stakeInput?.value.trim();
    if (stakeBox) stakeBox.hidden = !(conCastigo && abierto);
    if (btnStake) btnStake.hidden = !(conCastigo && !abierto);
    if (btnShare) btnShare.textContent = enlace ? `Mandarle el resultado a ${nombres()[0]}` : 'Enviar reto por WhatsApp';
    if (btnNew) btnNew.textContent = enlace ? 'Retar a alguien' : 'Nuevo reto';
    object.classList.toggle('is-dos', !enlace && modo !== 'maquina');
    // Con un enlace abierto no hay modo elegido: es un reto concreto
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(!enlace && b.dataset.mode === modo)));
    // Un reto a distancia es una sola partida: sin marcador bajo las manos
    object.classList.toggle('is-reto', !!enlace || modo === 'distancia');
    nameInputs.forEach((input, i) => {
      if (input) input.placeholder = modo === 'distancia' ? ['Tu nombre', '¿A quién?'][i] : `Jugador ${i + 1}`;
    });
  }

  // --- Historial ---------------------------------------------------------------
  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Sin rondas aún';
      historyList.appendChild(empty);
    } else {
      history.slice().reverse().forEach((h, i) => {
        const row = document.createElement('li');
        row.className = 'history-row';
        const n = document.createElement('span');
        n.className = 'history-num';
        n.textContent = String(history.length - i).padStart(2, '0');
        const label = document.createElement('span');
        label.className = 'history-label';
        label.textContent = `${NOMBRE[h.e1]} contra ${NOMBRE[h.e2].toLowerCase()}`;
        const side = document.createElement('span');
        side.className = 'history-side';
        side.textContent = h.texto;
        row.append(n, label, side);
        historyList.appendChild(row);
      });
    }
    if (historyCount) {
      const empates = history.filter((h) => h.g === 'empate').length;
      historyCount.textContent = history.length
        ? `${history.length} ${history.length === 1 ? 'ronda' : 'rondas'}` + (empates ? ` · ${empates} ${empates === 1 ? 'empate' : 'empates'}` : '')
        : '';
    }
  }

  function guardar(entrada) {
    history.push(entrada);
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    writeStore(HISTORY_KEY, history);
    renderHistory();
    // La fila nueva entra deslizándose (regla .is-new en la página)
    historyList?.firstElementChild?.classList.add('is-new');
  }

  btnClear?.addEventListener('click', () => {
    history = [];
    writeStore(HISTORY_KEY, null);
    marcador = { j1: 0, j2: 0, empates: 0 };
    guardarMarcador(modo, marcador);
    pintarMarcador();
    renderHistory();
  });

  // --- Movimiento ----------------------------------------------------------------
  // Todo lo que corre sobre una mano se cancela antes de otra animación: así
  // una ronda interrumpe la entrada o el reposo sin saltos ni restos.
  function parar() {
    lados.forEach((l) => {
      l.rig?.getAnimations().forEach((a) => a.cancel());
      l.floor?.getAnimations().forEach((a) => a.cancel());
    });
  }

  // Reposo: las manos respiran a destiempo, como quien espera su turno
  function reposar() {
    if (reducido()) return;
    lados.forEach((l, i) => {
      const opts = { duration: IDLE_MS, delay: i * (IDLE_MS / 2), direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' };
      l.rig?.animate([
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: `translateY(-4px) rotate(${1.5 * l.giro}deg)` },
      ], opts);
      l.floor?.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.9)', opacity: 0.75 }], opts);
    });
  }

  // Entrada: cada mano llega desde su lado, pasa un poco y vuelve. El
  // contenedor recorta en horizontal (overflow-x: clip en PptHands.astro),
  // así la de la derecha no crea scroll mientras llega.
  async function entrar() {
    if (reducido()) {
      await fin(object.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS }));
      return;
    }
    const anims = lados.map((l, i) => {
      const lado = i === 0 ? -1 : 1;
      l.floor?.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: ENTRY_MS, delay: i * 90, easing: 'ease-out' });
      return l.rig?.animate([
        { opacity: 0, transform: `translateX(${lado * 70}%) rotate(${lado * 25}deg)` },
        { opacity: 1, offset: 0.4 },
        { transform: `translateX(${-lado * 4}%) rotate(${-lado * 4}deg)`, offset: 0.78 },
        { opacity: 1, transform: 'none' },
      ], { duration: ENTRY_MS, delay: i * 90, easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)', fill: 'backwards' });
    });
    await Promise.all(anims.map(fin));
    // Si una ronda interrumpió la entrada, no se pone a respirar encima
    if (!busy && anims.every((a) => a?.playState === 'finished')) reposar();
  }

  // Un golpe del canto: la mano sube echándose hacia atrás y baja de golpe
  function golpe() {
    return Promise.all(lados.map((l) => {
      l.floor?.animate([
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.8)', opacity: 0.6, offset: 0.45 },
        { transform: 'scale(1.06)', opacity: 1 },
      ], { duration: PUMP_MS, easing: 'ease-in-out' });
      return fin(l.rig?.animate([
        { transform: 'translateY(0) rotate(0deg)', easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
        { transform: `translateY(-18%) rotate(${14 * l.giro}deg)`, offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
        { transform: 'translateY(0) rotate(0deg)' },
      ], { duration: PUMP_MS }));
    }));
  }

  // Aterrizaje: la mano se abre fotograma a fotograma mientras se aplasta
  // un poco. El reloj de cada paso es una animación vacía de FRAME_MS: así
  // el ritmo lo lleva la Web Animations API, no un setTimeout.
  async function abrir(e1, e2) {
    const jugadas = [e1, e2];
    lados.forEach((l) => l.rig?.animate([
      { transform: 'scale(1.08, 0.9)' },
      { transform: 'scale(0.97, 1.04)', offset: 0.5 },
      { transform: 'none' },
    ], { duration: FRAME_MS * PASOS.length + LAND_MS / 2, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }));
    for (const paso of PASOS) {
      lados.forEach((l, i) => {
        const e = jugadas[i];
        if (e !== 'piedra') pintar(l, `${e}-${paso}`, e);
      });
      await fin(object.animate([], { duration: FRAME_MS }));
    }
  }

  // --- Ronda ----------------------------------------------------------------------
  function limpiar() {
    result.classList.remove('is-shown');
    if (resultStake) resultStake.textContent = '';
    delete result.dataset.estado;
    delete result.dataset.ganador;
    lados.forEach((l) => {
      l.side?.classList.remove('is-winner', 'is-loser');
      pintar(l, 'piedra', 'piedra');
    });
  }

  function bloquear(activo) {
    busy = activo;
    choices.forEach((b) => { b.disabled = activo; });
    modeBtns.forEach((b) => { b.disabled = activo; });
  }

  // `contar`: suma al marcador del modo (no en los retos a distancia).
  // `registrar`: añade la fila al historial (no al reabrir un reto ya visto).
  async function jugar(e1, e2, { contar = true, registrar = true } = {}) {
    bloquear(true);
    limpiar();
    parar();

    const final = (e) => (e === 'piedra' ? e : `${e}-6`);
    if (reducido()) {
      pintar(lados[0], final(e1), e1);
      pintar(lados[1], final(e2), e2);
      await Promise.all(lados.map((l) => fin(l.rig?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS }))));
    } else {
      for (const palabra of CANTO) {
        if (turn) turn.textContent = palabra;
        await golpe();
      }
      await abrir(e1, e2);
    }

    const g = ganadorDe(e1, e2);
    const [n1, n2] = nombres();
    const q = castigo();
    let texto;
    if (g === 'empate') texto = 'Empate';
    else if (!enReto() && modo === 'maquina') texto = g === 'j1' ? 'Ganas tú' : 'Gana la máquina';
    else texto = `Gana ${g === 'j1' ? n1 : n2}`;
    // Lo que se decidía, con el nombre de quien pierde delante: así la frase
    // vale sea cual sea el nombre («Luis: lava los platos», «Tú: …»)
    if (resultStake) {
      if (q && g === 'empate') resultStake.textContent = 'Toca repetir';
      else if (q) resultStake.textContent = `${g === 'j1' ? n2 : n1}: ${q}`;
      else resultStake.textContent = '';
    }

    resultMain.textContent = texto;
    if (g === 'empate') resultSide.textContent = `Los dos sacaron ${e1}`;
    else {
      const [a, b] = g === 'j1' ? [e1, e2] : [e2, e1];
      resultSide.textContent = `${NOMBRE[a]} ${VERBO[a]} ${b}`;
    }
    result.classList.add('is-shown');
    result.dataset.estado = 'final';
    result.dataset.ganador = g;

    if (g !== 'empate') {
      lados[g === 'j1' ? 0 : 1].side?.classList.add('is-winner');
      lados[g === 'j1' ? 1 : 0].side?.classList.add('is-loser');
    }
    if (contar) {
      if (g === 'j1') marcador.j1 += 1;
      else if (g === 'j2') marcador.j2 += 1;
      else marcador.empates += 1;
      guardarMarcador(modo, marcador);
      pintarMarcador();
    }
    if (registrar) guardar({ e1, e2, g, texto: q && g !== 'empate' ? `${texto} · ${resultStake.textContent}` : texto });

    if (navigator.vibrate) navigator.vibrate(30);
    pendiente = null;
    pasado = false;
    choices.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    bloquear(false);
    pintarTurno();
    reposar();
  }

  // Entre turnos (vista()): las jugadas se ocultan y solo queda el botón
  // para que el segundo jugador empiece. Nada de la fila de jugadas sigue a
  // la vista (ni un :hover o un foco pegados del toque del primero). El
  // mismo botón abre el resultado de un reto devuelto: el momento de
  // "abrir el regalo", con las manos marcando el canto.
  btnPass?.addEventListener('click', () => {
    if (enlace?.tipo === 'resultado') {
      visto = true;
      pintarTurno();
      jugar(enlace.e1, enlace.e2, { contar: false });
      return;
    }
    pasado = true;
    pintarTurno();
  });

  choices.forEach((btn) => {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (busy) return;
      const eleccion = btn.dataset.choice;
      if (!FORMAS.includes(eleccion)) return;

      // Responder un reto recibido: la jugada de quien reta se revela ya
      if (enlace?.tipo === 'reto' && !respuesta) {
        btn.setAttribute('aria-pressed', 'true');
        responder(eleccion, true);
        return;
      }
      if (enlace) return;

      if (modo === 'maquina') {
        btn.setAttribute('aria-pressed', 'true');
        jugar(eleccion, FORMAS[randomIndex(3)]);
        return;
      }

      // A distancia: la jugada se sella en el enlace y no se enseña aquí
      if (modo === 'distancia') {
        btn.blur();
        const [a, b] = nameInputs.map((i) => i?.value.trim() ?? '');
        const reto = { id: nuevoId(), a, b, q: castigo(), e1: eleccion };
        enviado = { ...reto, url: enlaceA('reto', crearReto(reto)) };
        recordarReto(reto.id, { e1: eleccion });
        if (shareMsg) shareMsg.textContent = '';
        pintarTurno();
        return;
      }
      // Dos jugadores: la jugada del primero no se marca en ningún botón,
      // o el segundo la vería al coger el móvil
      if (!pendiente) {
        pendiente = eleccion;
        pasado = false;
        btn.blur();
        limpiar();
        pintarTurno();
        if (!reducido()) turn?.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 250, easing: 'ease-out' });
        return;
      }
      btn.setAttribute('aria-pressed', 'true');
      jugar(pendiente, eleccion);
    });
  });

  // --- Modo y nombres -------------------------------------------------------------
  function ponerModo(nuevo) {
    modo = nuevo;
    writeStore(MODE_KEY, modo === 'maquina' ? null : modo);
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === modo)));
    choicesBox?.setAttribute('aria-label', modo === 'dos' ? 'Jugada' : 'Tu jugada');
    pendiente = null;
    pasado = false;
    enviado = null;
    marcador = leerMarcador(modo === 'dos' ? 'dos' : 'maquina');
    limpiar();
    pintarNombres();
    pintarMarcador();
    pintarTurno();
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (busy || (b.dataset.mode === modo && !enlace)) return;
    salirDelEnlace();
    ponerModo(MODOS.includes(b.dataset.mode) ? b.dataset.mode : 'maquina');
  }));

  // --- A distancia: compartir, responder y reabrir ---------------------------------
  function enlaceA(clave, token) {
    return `${location.origin}${location.pathname}#${clave}=${token}`;
  }

  // Cambiar de modo o crear un reto nuevo deja atrás el enlace recibido
  function salirDelEnlace() {
    if (!enlace) return;
    enlace = null;
    respuesta = null;
    visto = false;
    // window.history: `history` es aquí el historial de rondas
    window.history.replaceState?.(null, '', location.pathname + location.search);
    // Los nombres del enlace dejan paso a los propios
    pintarNombres();
  }

  function mensaje() {
    const q = castigo();
    const [a, b] = nombres();
    if (enlace?.tipo === 'reto' && respuesta) {
      return `Ya respondí tu reto de piedra, papel o tijera${q ? ` (quien pierda ${q})` : ''}. Mira quién ganó: ${respuesta.url}`;
    }
    return `${a && a !== 'Tú' ? a : 'Alguien'} te reta a piedra, papel o tijera${q ? `: quien pierda ${q}` : ''}. Elige tu jugada aquí: ${enviado?.url}`;
  }

  const urlActual = () => (enlace ? respuesta?.url : enviado?.url);

  btnShare?.addEventListener('click', () => {
    if (!urlActual()) return;
    // wa.me abre WhatsApp en el móvil y WhatsApp Web en el ordenador
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje())}`, '_blank', 'noopener');
  });

  btnCopy?.addEventListener('click', async () => {
    if (!urlActual()) return;
    try {
      await navigator.clipboard.writeText(mensaje());
      if (shareMsg) shareMsg.textContent = 'Copiado. Pégalo donde quieras.';
    } catch (e) {
      if (shareMsg) shareMsg.textContent = urlActual();
    }
  });

  btnNew?.addEventListener('click', () => {
    salirDelEnlace();
    ponerModo('distancia');
  });

  // Respuesta a un reto: se guarda antes de revelar, así reabrir el enlace
  // en este navegador enseña el mismo resultado en vez de dejar probar otra
  async function responder(e2, nueva) {
    respuesta = { e2, url: enlaceA('resultado', crearResultado(enlace, e2)) };
    if (nueva) recordarReto(enlace.id, { e2 });
    await jugar(enlace.e1, e2, { contar: false, registrar: nueva });
    pintarTurno();
  }

  btnStake?.addEventListener('click', () => {
    stakeAbierto = true;
    vista();
    stakeInput?.focus();
  });

  stakeInput?.addEventListener('input', () => {
    writeStore(STAKE_KEY, stakeInput.value.trim().slice(0, STAKE_MAX) || null);
  });
  stakeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); stakeInput.blur(); }
  });

  nameInputs.forEach((input) => input?.addEventListener('input', () => {
    const valores = nameInputs.map((i) => i?.value.trim().slice(0, NAME_MAX) ?? '');
    writeStore(NAMES_KEY, valores.some(Boolean) ? valores : null);
    pintarNombres();
    pintarTurno();
  }));

  // Intro en el primer nombre salta al segundo; en el segundo cierra el
  // teclado para dejar a la vista las manos y las jugadas
  nameInputs.forEach((input, i) => input?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === 0) nameInputs[1]?.focus();
    else input.blur();
  }));

  ponerModo(modo);
  renderHistory();

  // Abrir un enlace: el propio reto (lo creó este navegador) vuelve a la
  // pantalla de enviarlo; uno ya respondido enseña su resultado; un resultado
  // cuya jugada no es la que se hizo aquí manda la jugada guardada.
  const propio = enlace && enlace.tipo !== 'roto' ? retos()[enlace.id] : null;
  if (enlace?.tipo === 'reto' && propio?.e1) {
    const reto = enlace;
    salirDelEnlace();
    ponerModo('distancia');
    enviado = { ...reto, url: enlaceA('reto', crearReto(reto)) };
    pintarTurno();
  } else if (enlace?.tipo === 'resultado' && propio?.e1 && propio.e1 !== enlace.e1) {
    enlace = { ...enlace, e1: propio.e1 };
  }
  pintarNombres();
  pintarTurno();

  if (enlace?.tipo === 'reto' && propio?.e2) {
    // Ya respondido en este navegador: mismo resultado, sin repetir la entrada
    responder(propio.e2, false);
  } else {
    entrar();
  }
}

// Un enlace de reto abierto en la pestaña donde ya estaba la página solo
// cambia el fragmento (#…) y no recarga: se recarga a mano para leerlo
window.addEventListener('hashchange', () => {
  const nuevo = leerFragmento(location.hash);
  if (nuevo && document.getElementById('ppt-object')) location.reload();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPPT);
} else {
  initPPT();
}
document.addEventListener('astro:page-load', initPPT);
