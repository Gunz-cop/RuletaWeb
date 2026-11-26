// ==========================================================
// EL IMPOSTOR — reglas de la sala (sin DOM, sin red)
// ==========================================================
// Toda la partida es un objeto `sala` y un puñado de funciones que lo
// modifican. Las usa el servidor (worker/sala.js, que solo guarda la sala y
// reenvía mensajes) y las prueba Node (scripts/impostor-check.mjs) con 22
// jugadores sin abrir un solo socket. Si una regla vive aquí, se prueba
// aquí; el Durable Object no decide nada del juego.
//
// Dos decisiones que condicionan todo lo demás:
//
//  - El servidor es la única fuente de verdad del rol de cada uno. `vistaPara`
//    construye lo que cada jugador puede ver y nada más: el rol ajeno, la
//    palabra del impostor y los tokens nunca salen de aquí hacia otro jugador.
//  - Los tiempos son marcas absolutas del servidor (`turnoFin`, en ms). Los
//    móviles solo las restan a su reloj corregido con `ahora`, así que un
//    móvil con la hora mal puesta no desincroniza a nadie y un móvil que se
//    bloquea y vuelve sigue mostrando el tiempo real.
//
// Las funciones que cambian la sala devuelven `{ ok: true }` o
// `{ error: 'codigo', mensaje: '…' }` y no lanzan: el servidor reenvía el
// mensaje tal cual a quien lo pidió.

import { CATEGORIAS, CLAVES_CATEGORIAS, CATEGORIA_AL_AZAR } from './impostor-palabras.js';
import {
  MAX_JUGADORES, MIN_JUGADORES, MAX_NOMBRE, LARGO_CODIGO, ALFABETO_CODIGO,
  SEGUNDOS_OPCIONES, VUELTAS_OPCIONES, MAS_SEGUNDOS, normalizarNombre, normalizarCodigo,
} from './impostor-comun.js';

export {
  MAX_JUGADORES, MIN_JUGADORES, MAX_NOMBRE, LARGO_CODIGO, ALFABETO_CODIGO,
  SEGUNDOS_OPCIONES, VUELTAS_OPCIONES, MAS_SEGUNDOS, normalizarNombre, normalizarCodigo,
};

/* ---------- límites y opciones ---------- */

export const CONFIG_INICIAL = Object.freeze({
  categoria: CATEGORIA_AL_AZAR,
  // 0 = automático según el número de jugadores
  impostores: 0,
  // 22 personas × 45 s son 16 minutos por vuelta; 30 s alcanza para una pista
  segundos: 30,
  vueltas: 1,
  anfitrionJuega: true,
  impostorVeCategoria: true,
});

/* ---------- azar ---------- */
// `rand()` devuelve un entero de 32 bits sin signo. Por defecto sale de
// crypto.getRandomValues (el mismo generador que promete la página en su
// texto); los tests pasan una función determinista.

export function u32() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0];
}

/** Entero en [0, max) sin sesgo de módulo. */
export function entero(max, rand = u32) {
  if (!(max > 0)) return 0;
  const tope = 4294967296 - (4294967296 % max);
  for (let i = 0; i < 1000; i++) {
    const x = rand();
    if (x < tope) return x % max;
  }
  return rand() % max;
}

/** Fisher-Yates sobre una copia. */
export function barajar(lista, rand = u32) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = entero(i + 1, rand);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function elegir(lista, rand = u32) {
  return lista[entero(lista.length, rand)];
}

export function codigoAleatorio(rand = u32) {
  let c = '';
  for (let i = 0; i < LARGO_CODIGO; i++) c += ALFABETO_CODIGO[entero(ALFABETO_CODIGO.length, rand)];
  return c;
}

export function tokenAleatorio() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- nombres ---------- */

function clave(nombre) {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Si ya hay un «Ana», el segundo queda como «Ana 2». */
export function nombreUnico(nombre, existentes) {
  const usados = new Set(existentes.map(clave));
  if (!usados.has(clave(nombre))) return nombre;
  for (let n = 2; n < 100; n++) {
    const sufijo = ` ${n}`;
    const candidato = Array.from(nombre).slice(0, MAX_NOMBRE - sufijo.length).join('').trimEnd() + sufijo;
    if (!usados.has(clave(candidato))) return candidato;
  }
  return nombre;
}

/* ---------- reglas del reparto ---------- */

/** Un impostor cada seis jugadores, mínimo uno: 22 personas → 3. */
export function impostoresSugeridos(n) {
  return Math.max(1, Math.floor(n / 6));
}

/** Con más impostores que la mitad menos uno, ganan sin que nadie vote. */
export function impostoresMaximos(n) {
  return Math.max(1, Math.floor((n - 1) / 2));
}

export function impostoresEfectivos(config, nJugando) {
  const pedido = config.impostores > 0 ? config.impostores : impostoresSugeridos(nJugando);
  return Math.min(pedido, impostoresMaximos(nJugando));
}

/* ---------- la sala ---------- */

export function crearSala(codigo, nombreAnfitrion, ahora) {
  const sala = {
    codigo,
    creada: ahora,
    fase: 'lobby',
    config: { ...CONFIG_INICIAL },
    jugadores: [],
    siguienteId: 1,
    palabra: null,
    categoria: null,
    ronda: null,
    votos: {},
    resultado: null,
    partidas: 0,
  };
  const anfitrion = nuevoJugador(sala, nombreAnfitrion, true);
  return { sala, anfitrion };
}

function nuevoJugador(sala, nombre, anfitrion) {
  const j = {
    id: sala.siguienteId++,
    token: tokenAleatorio(),
    nombre: nombreUnico(normalizarNombre(nombre), sala.jugadores.map((x) => x.nombre)),
    anfitrion,
    juega: true,
    vivo: true,
    impostor: false,
  };
  sala.jugadores.push(j);
  return j;
}

/** Entra alguien nuevo. Solo se puede mientras la sala espera en el lobby. */
export function unirse(sala, nombre) {
  if (sala.fase !== 'lobby') {
    return { error: 'empezada', mensaje: 'La partida ya empezó. Pídele al anfitrión que la reinicie para entrar.' };
  }
  if (sala.jugadores.length >= MAX_JUGADORES) {
    return { error: 'llena', mensaje: `La sala está llena (máximo ${MAX_JUGADORES}).` };
  }
  if (!normalizarNombre(nombre)) {
    return { error: 'nombre', mensaje: 'Escribe tu nombre.' };
  }
  return { ok: true, jugador: nuevoJugador(sala, nombre, false) };
}

export function jugadorPorToken(sala, token) {
  if (!token || typeof token !== 'string') return null;
  return sala.jugadores.find((j) => j.token === token) || null;
}

function jugadorPorId(sala, id) {
  return sala.jugadores.find((j) => j.id === id) || null;
}

export function jugando(sala) {
  return sala.jugadores.filter((j) => j.juega);
}

export function vivos(sala) {
  return sala.jugadores.filter((j) => j.juega && j.vivo);
}

const NO_AUTORIZADO = { error: 'permiso', mensaje: 'Solo el anfitrión puede hacer eso.' };
const FASE_MAL = { error: 'fase', mensaje: 'Eso no se puede hacer ahora.' };

/* ---------- configuración ---------- */

function enteroEn(valor, permitidos, porDefecto) {
  const n = Number(valor);
  return permitidos.includes(n) ? n : porDefecto;
}

export function configurar(sala, quien, cambios) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'lobby') return FASE_MAL;
  if (!cambios || typeof cambios !== 'object') return { error: 'datos', mensaje: 'Datos no válidos.' };
  const c = sala.config;
  if ('categoria' in cambios) {
    c.categoria = (cambios.categoria === CATEGORIA_AL_AZAR || CLAVES_CATEGORIAS.includes(cambios.categoria))
      ? cambios.categoria : c.categoria;
  }
  if ('impostores' in cambios) {
    const n = Math.trunc(Number(cambios.impostores));
    c.impostores = Number.isFinite(n) && n >= 0 && n <= MAX_JUGADORES ? n : c.impostores;
  }
  if ('segundos' in cambios) c.segundos = enteroEn(cambios.segundos, SEGUNDOS_OPCIONES, c.segundos);
  if ('vueltas' in cambios) c.vueltas = enteroEn(cambios.vueltas, VUELTAS_OPCIONES, c.vueltas);
  if ('anfitrionJuega' in cambios) c.anfitrionJuega = cambios.anfitrionJuega === true;
  if ('impostorVeCategoria' in cambios) c.impostorVeCategoria = cambios.impostorVeCategoria === true;
  return { ok: true };
}

/* ---------- empezar ---------- */

export function iniciar(sala, quien, rand = u32) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'lobby') return FASE_MAL;

  for (const j of sala.jugadores) {
    j.juega = j.anfitrion ? sala.config.anfitrionJuega : true;
    j.vivo = true;
    j.impostor = false;
  }
  const quienes = jugando(sala);
  if (quienes.length < MIN_JUGADORES) {
    return {
      error: 'pocos',
      mensaje: `Hacen falta al menos ${MIN_JUGADORES} jugadores${sala.config.anfitrionJuega ? '' : ' (sin contar al anfitrión)'}.`,
    };
  }

  const nImpostores = impostoresEfectivos(sala.config, quienes.length);
  for (const j of barajar(quienes, rand).slice(0, nImpostores)) j.impostor = true;

  const clave = sala.config.categoria === CATEGORIA_AL_AZAR ? elegir(CLAVES_CATEGORIAS, rand) : sala.config.categoria;
  sala.categoria = CATEGORIAS[clave].etiqueta;
  sala.palabra = elegir(CATEGORIAS[clave].palabras, rand);
  sala.votos = {};
  sala.resultado = null;
  sala.partidas += 1;
  empezarRonda(sala, 1, rand);
  return { ok: true };
}

function empezarRonda(sala, n, rand) {
  const orden = barajar(vivos(sala).map((j) => j.id), rand);
  sala.fase = 'ronda';
  sala.votos = {};
  sala.ronda = {
    n,
    orden,
    vueltas: sala.config.vueltas,
    // Posición dentro de orden × vueltas. Si llega al total, todos hablaron.
    turno: 0,
    turnoFin: null,
    pausaRestante: null,
  };
  // Hasta que el anfitrión pulse «Empezar turno» el reloj no corre: la gente
  // necesita un momento para mirar su rol.
  sala.ronda.pausaRestante = sala.config.segundos * 1000;
}

/* ---------- turnos ---------- */

export function totalTurnos(sala) {
  return sala.ronda ? sala.ronda.orden.length * sala.ronda.vueltas : 0;
}

export function turnoDe(sala) {
  const r = sala.ronda;
  if (!r || r.turno >= totalTurnos(sala)) return null;
  return r.orden[r.turno % r.orden.length];
}

export function controlarTurno(sala, quien, op, ahora) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'ronda') return FASE_MAL;
  const r = sala.ronda;
  const ms = sala.config.segundos * 1000;
  const total = totalTurnos(sala);

  switch (op) {
    case 'siguiente':
      if (r.turno >= total) return { ok: true };
      r.turno += 1;
      r.pausaRestante = null;
      // El turno nuevo arranca solo: quien lo lleva ya tiene el dedo en el
      // botón, y esperar otro toque por jugador son 22 toques de más. Solo
      // el primero espera («Empezar turno»), para dar tiempo a mirar el rol.
      r.turnoFin = r.turno < total ? ahora + ms : null;
      return { ok: true };
    case 'empezar':
      if (r.turno >= total || r.turnoFin !== null) return { ok: true };
      r.turnoFin = ahora + (r.pausaRestante ?? ms);
      r.pausaRestante = null;
      return { ok: true };
    case 'pausar':
      if (r.turnoFin === null) return { ok: true };
      r.pausaRestante = Math.max(0, r.turnoFin - ahora);
      r.turnoFin = null;
      return { ok: true };
    case 'reiniciar':
      if (r.turno >= total) return { ok: true };
      r.turnoFin = ahora + ms;
      r.pausaRestante = null;
      return { ok: true };
    case 'mas':
      if (r.turno >= total) return { ok: true };
      if (r.turnoFin !== null) r.turnoFin += MAS_SEGUNDOS * 1000;
      else r.pausaRestante = (r.pausaRestante ?? ms) + MAS_SEGUNDOS * 1000;
      return { ok: true };
    default:
      return { error: 'datos', mensaje: 'Acción no válida.' };
  }
}

/* ---------- votación ---------- */

export function abrirVotacion(sala, quien) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'ronda') return FASE_MAL;
  sala.fase = 'votacion';
  sala.votos = {};
  sala.ronda.turnoFin = null;
  sala.ronda.pausaRestante = null;
  return { ok: true };
}

export function votar(sala, quien, objetivoId, rand = u32) {
  if (sala.fase !== 'votacion') return FASE_MAL;
  if (!quien.juega || !quien.vivo) return { error: 'permiso', mensaje: 'Ya no puedes votar en esta partida.' };
  const objetivo = jugadorPorId(sala, objetivoId);
  if (!objetivo || !objetivo.juega || !objetivo.vivo) return { error: 'datos', mensaje: 'Ese jugador no está en la partida.' };
  if (objetivo.id === quien.id) return { error: 'datos', mensaje: 'No puedes votar por ti.' };
  sala.votos[quien.id] = objetivo.id;
  // Todos han votado: se cierra sola. Esperar al anfitrión con 22 personas
  // mirando la pantalla es un silencio incómodo de más.
  if (vivos(sala).every((j) => sala.votos[j.id] !== undefined)) return cerrarVotacion(sala, { anfitrion: true }, rand);
  return { ok: true };
}

export function contarVotos(sala) {
  const conteo = {};
  for (const [votante, objetivo] of Object.entries(sala.votos)) {
    const v = jugadorPorId(sala, Number(votante));
    if (!v || !v.vivo) continue;
    conteo[objetivo] = (conteo[objetivo] || 0) + 1;
  }
  return conteo;
}

/** 'grupo' si no queda ningún impostor, 'impostores' si ya son tantos como los demás. */
export function quienGana(sala) {
  const v = vivos(sala);
  const imp = v.filter((j) => j.impostor).length;
  if (imp === 0) return 'grupo';
  if (imp >= v.length - imp) return 'impostores';
  return null;
}

export function cerrarVotacion(sala, quien) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'votacion') return FASE_MAL;
  const conteo = contarVotos(sala);
  const max = Math.max(0, ...Object.values(conteo));
  const empatados = Object.keys(conteo).filter((id) => conteo[id] === max).map(Number);
  let expulsado = null;
  if (max > 0 && empatados.length === 1) {
    expulsado = jugadorPorId(sala, empatados[0]);
    expulsado.vivo = false;
  }
  sala.fase = 'resultado';
  sala.resultado = {
    expulsado: expulsado ? expulsado.id : null,
    eraImpostor: expulsado ? expulsado.impostor : null,
    empate: expulsado === null,
    conteo,
    ganan: quienGana(sala),
  };
  return { ok: true };
}

export function continuar(sala, quien, rand = u32) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'resultado' || sala.resultado.ganan) return FASE_MAL;
  empezarRonda(sala, sala.ronda.n + 1, rand);
  return { ok: true };
}

/** Vuelve al lobby con los mismos jugadores. Vale en cualquier fase. */
export function nuevaPartida(sala, quien) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase === 'lobby') return { ok: true };
  sala.fase = 'lobby';
  sala.palabra = null;
  sala.categoria = null;
  sala.ronda = null;
  sala.votos = {};
  sala.resultado = null;
  for (const j of sala.jugadores) { j.vivo = true; j.impostor = false; j.juega = true; }
  return { ok: true };
}

/* ---------- gente que entra y sale ---------- */

export function quitar(sala, quien, id) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  if (sala.fase !== 'lobby') return FASE_MAL;
  const j = jugadorPorId(sala, id);
  if (!j || j.anfitrion) return { error: 'datos', mensaje: 'No se puede quitar a ese jugador.' };
  sala.jugadores = sala.jugadores.filter((x) => x.id !== id);
  return { ok: true, quitado: j };
}

export function ceder(sala, quien, id) {
  if (!quien.anfitrion) return NO_AUTORIZADO;
  const nuevo = jugadorPorId(sala, id);
  if (!nuevo || nuevo.anfitrion) return { error: 'datos', mensaje: 'No se puede ceder a ese jugador.' };
  quien.anfitrion = false;
  nuevo.anfitrion = true;
  // Si el anfitrión nuevo era un jugador y el antiguo moderaba (o al revés),
  // `juega` de cada uno no cambia a mitad de partida: solo el rol de control.
  return { ok: true };
}

/** Sale por su cuenta. Devuelve si hay que cerrar la sala. */
export function salir(sala, quien) {
  if (sala.fase === 'lobby') {
    sala.jugadores = sala.jugadores.filter((j) => j.id !== quien.id);
    if (quien.anfitrion && sala.jugadores.length) sala.jugadores[0].anfitrion = true;
    return { ok: true, vacia: sala.jugadores.length === 0 };
  }
  // En plena partida, quien se va queda como desconectado: puede volver con su
  // token y la ronda no se rompe. El anfitrión puede cederle el mando a otro.
  return { ok: true, vacia: false };
}

/* ---------- lo que ve cada uno ---------- */

/**
 * La sala tal como la ve el jugador `yo`. `conectados` es un Set de ids con
 * un socket abierto; el servidor lo sabe y el jugador no.
 */
export function vistaPara(sala, yo, ahora, conectados) {
  const enPartida = sala.fase !== 'lobby';
  const terminada = sala.fase === 'resultado' && sala.resultado && sala.resultado.ganan;

  const vista = {
    t: 'estado',
    ahora,
    codigo: sala.codigo,
    fase: sala.fase,
    max: MAX_JUGADORES,
    min: MIN_JUGADORES,
    yo: { id: yo.id, anfitrion: yo.anfitrion, juega: yo.juega, vivo: yo.vivo },
    config: { ...sala.config, impostoresAuto: impostoresSugeridos(jugandoPrevisto(sala)) },
    jugadores: sala.jugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      anfitrion: j.anfitrion,
      conectado: conectados.has(j.id),
      juega: enPartida ? j.juega : true,
      vivo: j.vivo,
      yaVoto: sala.fase === 'votacion' ? sala.votos[j.id] !== undefined : false,
      // Solo se ve el rol de alguien cuando ya no está en la partida y la
      // ronda terminó, o cuando acaba todo. Mientras haya partida, no.
      impostor: terminada ? j.impostor : undefined,
    })),
  };

  if (enPartida) {
    if (yo.juega) {
      vista.rol = yo.impostor
        ? { impostor: true, palabra: null, categoria: sala.config.impostorVeCategoria ? sala.categoria : null }
        : { impostor: false, palabra: sala.palabra, categoria: sala.categoria };
    } else {
      // Un anfitrión que modera sabe todo: lleva la partida, no juega.
      vista.rol = {
        moderador: true,
        palabra: sala.palabra,
        categoria: sala.categoria,
        impostores: sala.jugadores.filter((j) => j.juega && j.impostor).map((j) => ({ id: j.id, nombre: j.nombre })),
      };
    }
  }

  if (sala.ronda && (sala.fase === 'ronda' || sala.fase === 'votacion')) {
    const r = sala.ronda;
    const total = totalTurnos(sala);
    vista.ronda = {
      n: r.n,
      orden: r.orden,
      vueltas: r.vueltas,
      turno: r.turno,
      total,
      de: turnoDe(sala),
      terminada: r.turno >= total,
      turnoFin: r.turnoFin,
      pausaRestante: r.pausaRestante,
      segundos: sala.config.segundos,
    };
  }

  if (sala.fase === 'votacion') {
    const quienes = vivos(sala);
    vista.votacion = {
      votaron: quienes.filter((j) => sala.votos[j.id] !== undefined).length,
      total: quienes.length,
      miVoto: sala.votos[yo.id] ?? null,
      puedeVotar: yo.juega && yo.vivo,
    };
  }

  if (sala.fase === 'resultado') {
    const res = sala.resultado;
    vista.resultado = {
      expulsado: res.expulsado,
      eraImpostor: res.eraImpostor,
      empate: res.empate,
      conteo: res.conteo,
      ganan: res.ganan,
    };
    if (res.ganan) {
      vista.resultado.palabra = sala.palabra;
      vista.resultado.categoria = sala.categoria;
      vista.resultado.impostores = sala.jugadores.filter((j) => j.juega && j.impostor).map((j) => ({ id: j.id, nombre: j.nombre }));
    }
  }

  return vista;
}

function jugandoPrevisto(sala) {
  if (sala.fase !== 'lobby') return jugando(sala).length;
  return sala.jugadores.length - (sala.config.anfitrionJuega ? 0 : 1);
}
