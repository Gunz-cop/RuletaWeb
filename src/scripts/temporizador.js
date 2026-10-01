// ==========================================================
// TEMPORIZADOR ALEATORIO — papa caliente, impulso y avisos al azar
// ==========================================================
// La apariencia vive en TimerObject.astro y temporizador.astro, y la lógica
// sin DOM (rangos, azar, nombre del juego por país) en
// temporizador-logica.js. Aquí se lee la interfaz, se anima el objeto con
// la Web Animations API, se hace sonar el aviso y se escribe el texto.
//
// Una excepción a la regla 6 de AGENTS.md, a propósito: el final de cada
// ronda lo marca un setTimeout con la duración elegida, no el `.finished`
// de una animación. Aquí la duración no adivina una animación: es el
// temporizador. Y el navegador congela las animaciones cuando la pestaña
// no se ve, mientras que un setTimeout sigue corriendo, así que el aviso
// llega aunque el visitante haya cambiado de aplicación.

import {
  MODOS, JUEGOS, TOTALES_AVISOS, juegoPorDefecto, juegoValido, modoValido,
  normalizarRango, duracionAleatoria, formatoDuracion, formatoRango,
  configDeUrl, convertirHistorialViejo, RESPIRACIONES, NOMBRES_FASE,
  normalizarRespiracion, etiquetaRespiracion, resumenEsperas, resumenSesiones,
  formatoTotal, decimal,
} from './temporizador-logica.js';

const MODO_KEY = 'decidelo_temporizador_modo';
const RANGOS_KEY = 'decidelo_temporizador_rangos';
const JUEGO_KEY = 'decidelo_temporizador_juego';
const APUESTA_KEY = 'decidelo_temporizador_apuesta';
const GANAS_DE_KEY = 'decidelo_temporizador_ganas_de';
const TOTAL_KEY = 'decidelo_temporizador_total';
const SONIDO_KEY = 'decidelo_temporizador_sonido';
const HISTORY_KEY = 'decidelo_temporizador_historial';
// Formato de la versión anterior de la herramienta: se lee una vez y se
// convierte, para que nadie pierda sus rondas con el rediseño.
const HISTORY_OLD_KEY = 'decidelo_timer_history';
const HISTORY_MAX = 10;
const RESP_KEY = 'decidelo_temporizador_respiracion';
// La evidencia personal guarda más que el historial (que se queda en 10
// filas mezcladas): sin un puñado de esperas no hay media que valga.
const ESPERAS_KEY = 'decidelo_temporizador_esperas';
const SESIONES_KEY = 'decidelo_temporizador_sesiones';
const REGISTROS_MAX = 200;

const DESCRIPCION = {
  papa: 'Pasen el móvil de mano en mano. Nadie sabe cuándo suena: a quien lo tenga, le toca.',
  impulso: 'Cuando te den ganas de algo, espera sin mirar el reloj. Respira con el círculo; cuando suene, decides.',
  avisos: 'Suena varias veces en momentos sorpresa: para volver a la respiración, el juego de la silla o las estatuas.',
};

const ETIQUETA_RANGO = {
  papa: '¿Cuánto tiempo?',
  impulso: '¿Cuánto esperas?',
  avisos: '¿Cada cuánto suena?',
};

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
    // Modo privado o almacenamiento bloqueado: la herramienta sigue funcionando
  }
}

function randomUnit() {
  if (window.crypto && window.crypto.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }
  return Math.random();
}

function zonaHoraria() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    return '';
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function vibrar(patron) {
  try {
    if ('vibrate' in navigator) navigator.vibrate(patron);
  } catch (e) {
    // Algunos navegadores lo bloquean sin gesto reciente: no pasa nada
  }
}

// --- Sonido ---------------------------------------------------------------
// Sintetizado en el momento, sin archivos que descargar. Un cuenco (varios
// parciales que se apagan a distinto ritmo) para los avisos y un tic muy
// suave para la papa. Nada de explosiones ni fanfarrias: avisa, no celebra.
function crearAudio() {
  let ctx = null;

  const contexto = () => {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  };

  return {
    enabled: true,

    // iOS solo deja sonar audio creado o reanudado dentro de un toque: se
    // llama al pulsar «Empezar», y así el aviso de minutos después suena.
    unlock() {
      if (this.enabled) contexto();
    },

    campana(fuerza = 1, retraso = 0) {
      if (!this.enabled) return;
      const c = contexto();
      if (!c) return;
      const t = c.currentTime + retraso;
      const master = c.createGain();
      master.gain.value = 0.2 * fuerza;
      master.connect(c.destination);
      for (const [f, g, d] of [[440, 1, 4], [1056, 0.45, 2.6], [2160, 0.2, 1.5], [3520, 0.08, 0.8]]) {
        const o = c.createOscillator();
        const e = c.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(g, t + 0.012);
        e.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(e);
        e.connect(master);
        o.start(t);
        o.stop(t + d + 0.05);
      }
    },

    tic(agudo) {
      if (!this.enabled) return;
      const c = contexto();
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const e = c.createGain();
      o.type = 'sine';
      o.frequency.value = agudo ? 1400 : 1100;
      e.gain.setValueAtTime(0.035, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(e);
      e.connect(c.destination);
      o.start(t);
      o.stop(t + 0.05);
    },
  };
}

// --- Pantalla encendida -----------------------------------------------------
// Con la pantalla apagada el móvil congela los temporizadores y el aviso
// llega tarde. Donde el navegador lo permite, se pide que no se apague
// mientras corre el tiempo; se pierde al ocultar la pestaña y se vuelve a
// pedir al volver.
let wakeLock = null;

async function pedirPantalla() {
  try {
    if ('wakeLock' in navigator && !document.hidden && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {
    wakeLock = null;
  }
}

function soltarPantalla() {
  try {
    if (wakeLock) wakeLock.release();
  } catch (e) {
    // Ya estaba suelto
  }
  wakeLock = null;
}

function initTemporizador() {
  const root = document.getElementById('temporizador');
  if (!root || root.dataset.ready === 'true') return;
  root.dataset.ready = 'true';

  const $ = (id) => document.getElementById(id);
  const objeto = $('timer-object');
  const rig = $('timer-rig');
  const body = $('timer-body');
  const floor = $('timer-floor');
  const heat = $('timer-heat');
  const steam = $('timer-steam');
  const breathCore = $('timer-breath-core');
  const breathText = $('timer-breath-text');
  const breathCount = $('timer-breath-count');
  const ondas = [...objeto.querySelectorAll('.tobj-onda')];

  const modeButtons = [...document.querySelectorAll('#timer-modes button')];
  const modePapaLabel = $('timer-mode-papa');
  const statusEl = $('timer-status');
  const resultEl = $('timer-result');
  const resultMain = $('timer-result-main');
  const resultStake = $('timer-result-stake');
  const resultSide = $('timer-result-side');
  const btnStart = $('timer-start');
  const btnSound = $('timer-sound');

  const descEl = $('timer-mode-desc');
  const fieldset = $('timer-fieldset');
  const rangeLabel = $('timer-range-label');
  const presetButtons = [...document.querySelectorAll('#timer-presets [data-preset]')];
  const btnCustom = $('timer-custom-btn');
  const customBox = $('timer-custom');
  const inputMin = $('timer-min');
  const inputMax = $('timer-max');
  const unitEl = $('timer-unit');
  const soloBlocks = [...document.querySelectorAll('[data-solo]')];
  const selectJuego = $('timer-juego');
  const stakeLabel = $('timer-stake-label');
  const stakeInput = $('timer-stake');
  const urgeInput = $('timer-urge');
  const ganasButtons = [...document.querySelectorAll('#timer-ganas [data-ganas]')];
  const totalButtons = [...document.querySelectorAll('#timer-totales [data-total]')];
  const respButtons = [...document.querySelectorAll('#timer-resps [data-resp]')];
  const respPropia = $('timer-resp-propia');
  const faseInputs = [...respPropia.querySelectorAll('[data-fase]')];
  const evidBox = $('timer-evidencia');
  const evidEmpty = $('timer-evid-empty');
  const evidMain = $('timer-evid-main');
  const evidSide = $('timer-evid-side');
  const evidTipos = $('timer-evid-tipos');
  const evidClear = $('timer-evid-clear');
  const sesBox = $('timer-sesiones');
  const sesMain = $('timer-ses-main');
  const sesSide = $('timer-ses-side');
  const sesClear = $('timer-ses-clear');
  const btnShare = $('timer-share');
  const shareMsg = $('timer-share-msg');

  const historyList = $('history-list');
  const historyCount = $('history-count');
  const btnClear = $('btn-clear');

  const alertEl = $('timer-alert');
  const alertKicker = $('timer-alert-kicker');
  const alertTitle = $('timer-alert-title');
  const alertText = $('timer-alert-text');
  const alertGanas = $('timer-alert-ganas');
  const alertGanasButtons = [...alertEl.querySelectorAll('[data-ganas-despues]')];
  const alertAtencion = $('timer-alert-atencion');
  const alertAtencionButtons = [...alertAtencion.querySelectorAll('[data-atencion]')];
  const alertExtra = $('timer-alert-extra');
  const alertMain = $('timer-alert-again');
  const alertClose = $('timer-alert-close');
  const flash = $('timer-flash');
  const flashText = $('timer-flash-text');

  const audio = crearAudio();

  // --- Estado ---------------------------------------------------------------
  const url = configDeUrl(window.location.search);
  const state = {
    modo: url.modo || modoValido(readStore(MODO_KEY, null)) || 'papa',
    // Por modo: { preset: i } o { custom: [min, max] } en segundos
    rangos: readStore(RANGOS_KEY, {}) || {},
    // Un enlace compartido que trae el juego manda; luego lo elegido; luego
    // el país (DESIGN.md, "Variantes regionales sin pedir ubicación")
    juego: url.juego || juegoValido(readStore(JUEGO_KEY, null))
      || juegoPorDefecto({ zona: zonaHoraria(), idioma: navigator.language }),
    total: TOTALES_AVISOS.includes(readStore(TOTAL_KEY, 0)) ? readStore(TOTAL_KEY, 0) : 0,
    ganasAntes: null,
    history: [],
    // { clave: 'suave' | 'cuadrada' | '478' } o { propia: [4 fases] }
    resp: readStore(RESP_KEY, null),
  };
  if (!state.resp || typeof state.resp !== 'object'
    || !(Object.hasOwn(RESPIRACIONES, state.resp.clave || '') || normalizarRespiracion(state.resp.propia))) {
    state.resp = { clave: 'suave' };
  }
  if (typeof state.rangos !== 'object' || Array.isArray(state.rangos)) state.rangos = {};
  if (url.rango) state.rangos[state.modo] = { custom: url.rango };
  audio.enabled = readStore(SONIDO_KEY, true) !== false;

  // Ronda en curso (null en reposo). Guarda lo necesario para pararla.
  let ronda = null;
  let reposo = [];
  let tituloOriginal = document.title;

  function rangoDe(modo) {
    const r = state.rangos[modo];
    if (r && Array.isArray(r.custom)) {
      const n = normalizarRango(r.custom[0], r.custom[1]);
      if (n) return n;
    }
    const presets = MODOS[modo].presets;
    const i = r && Number.isInteger(r.preset) && r.preset >= 0 && r.preset < presets.length
      ? r.preset : MODOS[modo].porDefecto;
    return presets[i];
  }

  function fasesActuales() {
    if (state.resp.propia) return normalizarRespiracion(state.resp.propia);
    return RESPIRACIONES[state.resp.clave].fases;
  }

  const registros = (key) => {
    const l = readStore(key, []);
    return Array.isArray(l) ? l : [];
  };

  function guardarRegistro(key, entrada) {
    writeStore(key, [entrada, ...registros(key)].slice(0, REGISTROS_MAX));
  }

  const esCustom = (modo) => !!(state.rangos[modo] && Array.isArray(state.rangos[modo].custom));
  const juego = () => JUEGOS[state.juego];

  // --- Historial ------------------------------------------------------------
  function cargarHistorial() {
    const actual = readStore(HISTORY_KEY, []);
    let lista = Array.isArray(actual) ? actual.filter((e) => e && typeof e.texto === 'string') : [];
    const viejo = readStore(HISTORY_OLD_KEY, null);
    if (viejo) {
      lista = lista.concat(convertirHistorialViejo(viejo)).slice(0, HISTORY_MAX);
      writeStore(HISTORY_KEY, lista);
      writeStore(HISTORY_OLD_KEY, null);
    }
    state.history = lista;
  }

  function renderHistory(conNueva = false) {
    historyList.replaceChildren();
    const n = state.history.length;
    historyCount.textContent = n ? `${n} ${n === 1 ? 'ronda' : 'rondas'}` : '';
    if (!n) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'Sin rondas aún';
      historyList.append(li);
      return;
    }
    state.history.forEach((e, i) => {
      const li = document.createElement('li');
      li.className = 'history-row' + (conNueva && i === 0 ? ' is-new' : '');
      const num = document.createElement('span');
      num.className = 'history-num';
      num.textContent = String(n - i).padStart(2, '0');
      const label = document.createElement('span');
      label.className = 'history-label';
      label.textContent = e.texto;
      const side = document.createElement('span');
      side.className = 'history-side';
      side.textContent = [e.lado, e.hora].filter(Boolean).join(' · ');
      li.append(num, label, side);
      historyList.append(li);
    });
  }

  function guardarEnHistorial(texto, lado) {
    const hora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    state.history.unshift({ modo: state.modo, texto, lado, hora });
    state.history = state.history.slice(0, HISTORY_MAX);
    writeStore(HISTORY_KEY, state.history);
    renderHistory(true);
  }

  // --- Interfaz de ajustes --------------------------------------------------
  // Unidad de los campos de «Personalizar»: la del modo, salvo que el rango
  // no se pueda escribir en medios minutos (llega por un enlace, p. ej. 1–2 s)
  let unidadCustom = 's';
  const unidadPara = (def, [min, max]) => (
    def.unidad === 'min' && min >= 30 && min % 30 === 0 && max % 30 === 0 ? 'min' : 's'
  );
  const enUnidad = (seg, unidad) => (unidad === 'min' ? seg / 60 : seg);

  function renderRango() {
    const def = MODOS[state.modo];
    const custom = esCustom(state.modo);
    const r = state.rangos[state.modo];
    const actual = custom ? -1 : (r && Number.isInteger(r.preset) ? r.preset : def.porDefecto);
    presetButtons.forEach((b, i) => {
      b.textContent = formatoRango(def.presets[i]);
      b.setAttribute('aria-pressed', String(i === actual));
    });
    btnCustom.setAttribute('aria-pressed', String(custom));
    customBox.hidden = !custom;
    const [min, max] = rangoDe(state.modo);
    unidadCustom = unidadPara(def, [min, max]);
    inputMin.step = inputMax.step = unidadCustom === 'min' ? '0.5' : '1';
    inputMin.min = inputMax.min = unidadCustom === 'min' ? '0.5' : '1';
    inputMin.value = enUnidad(min, unidadCustom);
    inputMax.value = enUnidad(max, unidadCustom);
    unitEl.textContent = unidadCustom === 'min' ? 'minutos' : 'segundos';
  }

  function renderJuego() {
    const j = juego();
    modePapaLabel.textContent = j.corto;
    selectJuego.value = state.juego;
    stakeLabel.textContent = j.perder;
    stakeInput.placeholder = j.ejemplo;
  }

  function renderResp() {
    const propia = !!state.resp.propia;
    respButtons.forEach((b) => b.setAttribute('aria-pressed', String(
      propia ? b.dataset.resp === 'propia' : b.dataset.resp === state.resp.clave,
    )));
    respPropia.hidden = !propia;
    const fases = fasesActuales();
    faseInputs.forEach((inp, i) => { inp.value = fases[i]; });
    const btnPropia = respButtons.find((b) => b.dataset.resp === 'propia');
    btnPropia.textContent = propia ? `Personalizada ${etiquetaRespiracion(fases)}` : 'Personalizada';
  }

  // Tu evidencia: frases tal cual salen, también si las ganas suben
  function renderEvidencia() {
    const r = resumenEsperas(registros(ESPERAS_KEY));
    evidBox.hidden = !r;
    evidEmpty.hidden = !!r;
    if (!r) return;
    const a = decimal(r.antes);
    const d = decimal(r.despues);
    const ultimas = `En tus últimas ${r.n} esperas`;
    evidMain.textContent = r.tendencia === 'bajan'
      ? `${ultimas}, las ganas bajaron de ${a} a ${d} de media.`
      : r.tendencia === 'suben'
        ? `${ultimas}, las ganas subieron de ${a} a ${d} de media.`
        : `${ultimas}, las ganas se quedaron en ${a} de media.`;
    evidSide.textContent = [
      r.segMedia ? `Esperaste ${formatoDuracion(r.segMedia)} de media` : '',
      r.paradas ? `${r.paradas} de ${r.total} las paraste antes` : '',
    ].filter(Boolean).join(' · ');
    evidTipos.replaceChildren(...r.porTipo.map((t) => {
      const li = document.createElement('li');
      const de = document.createElement('span');
      de.className = 'evid-de';
      de.textContent = t.de;
      const val = document.createElement('span');
      val.className = 'evid-val';
      val.textContent = `${decimal(t.antes)} → ${decimal(t.despues)} · ${t.n} ${t.n === 1 ? 'vez' : 'veces'}`;
      li.append(de, val);
      return li;
    }));
  }

  function renderSesiones() {
    const r = resumenSesiones(registros(SESIONES_KEY));
    sesBox.hidden = !r;
    if (!r) return;
    sesMain.textContent = `${r.n} ${r.n === 1 ? 'sesión' : 'sesiones'} · ${formatoTotal(r.seg)} en total · esta semana: ${r.semana}`;
    sesSide.textContent = r.conAtencion
      ? `En ${r.enRespiracion} de ${r.conAtencion} estabas en la respiración casi siempre.`
      : '';
  }

  function renderModo() {
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.modo)));
    soloBlocks.forEach((el) => { el.hidden = el.dataset.solo !== state.modo; });
    descEl.textContent = DESCRIPCION[state.modo];
    rangeLabel.textContent = ETIQUETA_RANGO[state.modo];
    objeto.dataset.mode = state.modo;
    totalButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.total) === state.total)));
    ganasButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.ganas) === state.ganasAntes)));
    renderRango();
    renderJuego();
    renderResp();
    renderEvidencia();
    renderSesiones();
  }

  function renderSonido() {
    btnSound.setAttribute('aria-pressed', String(audio.enabled));
    btnSound.textContent = audio.enabled ? 'Sonido activado' : 'Sonido apagado';
  }

  function mostrarResultado(main, stake, side) {
    resultMain.textContent = main;
    resultStake.textContent = stake || '';
    resultSide.textContent = side || '';
    resultEl.classList.add('is-shown');
  }

  function ocultarResultado() {
    resultEl.classList.remove('is-shown');
  }

  // --- Movimiento del objeto ------------------------------------------------
  // Ciclo de DESIGN.md: entrada al cargar, reposo mientras espera,
  // anticipación al pulsar, acción mientras corre el tiempo y aterrizaje
  // al terminar. Solo transform y opacity.
  function pararReposo() {
    reposo.forEach((a) => a.cancel());
    reposo = [];
  }

  function empezarReposo() {
    pararReposo();
    if (ronda || reducedMotion()) return;
    if (state.modo === 'impulso') {
      reposo = [breathCore.animate(
        [{ transform: 'scale(0.62)' }, { transform: 'scale(0.68)' }],
        { duration: 1500, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
      )];
      return;
    }
    reposo = [
      rig.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }],
        { duration: 1300, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
      ),
      floor.animate(
        [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0.9)', opacity: 0.75 }],
        { duration: 1300, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
      ),
    ];
  }

  function entrada() {
    if (reducedMotion()) return;
    const a = rig.animate(
      [
        { transform: 'translateY(-32px) scale(0.9)', opacity: 0 },
        { transform: 'translateY(4px) scale(1.02)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 950, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
    floor.animate([{ opacity: 0, transform: 'scaleX(0.4)' }, { opacity: 1, transform: 'none' }], { duration: 950, easing: 'ease-out' });
    reposo = [a];
    // Si «Empezar» interrumpe la entrada, el reposo no arranca encima
    a.finished.then(() => { if (!ronda) empezarReposo(); }, () => {});
  }

  function cambioDeObjeto() {
    pararReposo();
    if (reducedMotion()) return;
    const a = rig.animate(
      [{ opacity: 0, transform: 'translateY(8px) scale(0.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
    reposo = [a];
    a.finished.then(() => { if (!ronda) empezarReposo(); }, () => {});
  }

  function anticipacion() {
    if (reducedMotion()) return Promise.resolve();
    return body.animate(
      [{ transform: 'none' }, { transform: 'scale(1.06, 0.9) translateY(4px)' }, { transform: 'none' }],
      { duration: 240, easing: 'ease-in-out' },
    ).finished.catch(() => {});
  }

  function aterrizaje() {
    if (reducedMotion()) return Promise.resolve();
    return body.animate(
      [
        { transform: 'translateY(-10px)' },
        { transform: 'translateY(0) scale(1.08, 0.9)', offset: 0.55 },
        { transform: 'none' },
      ],
      { duration: 360, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
    ).finished.catch(() => {});
  }

  // --- Aviso en pantalla ----------------------------------------------------
  // Sale siempre, suene o no. Con la pestaña oculta también cambia el
  // título, que es lo que se ve en la lista de pestañas.
  function marcarTitulo(texto) {
    if (!document.hidden) return;
    tituloOriginal = tituloOriginal || document.title;
    document.title = `${texto} · Temporizador`;
  }

  let alAceptar = null;

  function abrirAviso({ kicker, title, text, ganas = false, atencion = false, extra = '', principal, cerrar = false, onClose }) {
    alertKicker.textContent = kicker;
    alertTitle.textContent = title;
    alertText.textContent = text || '';
    alertGanas.hidden = !ganas;
    alertGanasButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    alertAtencion.hidden = !atencion;
    alertAtencionButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    alertExtra.textContent = extra;
    alertMain.textContent = principal;
    alertClose.hidden = !cerrar;
    alAceptar = onClose;
    alertEl.hidden = false;
    alertEl.classList.add('is-shown');
    marcarTitulo(title);
    alertMain.focus({ preventScroll: true });
    if (reducedMotion()) {
      alertEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    } else {
      // Tres parpadeos y se queda fijo hasta que alguien lo cierre
      alertEl.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 480, iterations: 3 });
    }
  }

  function cerrarAviso(accion) {
    if (alertEl.hidden) return;
    alertEl.hidden = true;
    alertEl.classList.remove('is-shown');
    const cb = alAceptar;
    alAceptar = null;
    btnStart.focus({ preventScroll: true });
    if (cb) cb(accion);
  }

  function destello(texto) {
    flashText.textContent = texto;
    flash.classList.add('is-shown');
    marcarTitulo(texto);
    const a = flash.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
      { duration: reducedMotion() ? 1200 : 1600, easing: 'ease-out' },
    );
    a.finished.then(() => flash.classList.remove('is-shown'), () => {});
  }

  // --- Una ronda ------------------------------------------------------------
  function bloquearAjustes(bloquear) {
    fieldset.disabled = bloquear;
    modeButtons.forEach((b) => { b.disabled = bloquear; });
    btnStart.textContent = bloquear ? 'Parar' : 'Empezar';
    btnStart.classList.toggle('is-running', bloquear);
  }

  function limpiarRonda() {
    if (!ronda) return;
    ronda.timeouts.forEach(clearTimeout);
    ronda.anims.forEach((a) => a.cancel());
    ronda.vivo = false;
    soltarPantalla();
  }

  function programar(fn, ms) {
    const id = setTimeout(fn, ms);
    ronda.timeouts.push(id);
    return id;
  }

  async function empezar() {
    if (ronda) return;
    audio.unlock();
    pararReposo();
    ocultarResultado();
    shareMsg.textContent = '';

    const rango = rangoDe(state.modo);
    const esAvisos = state.modo === 'avisos';
    const duracion = esAvisos ? 0 : duracionAleatoria(rango, randomUnit());
    ronda = {
      modo: state.modo,
      rango,
      duracion,
      inicio: Date.now(),
      fin: esAvisos ? 0 : Date.now() + duracion * 1000,
      avisos: 0,
      timeouts: [],
      anims: [],
      vivo: true,
    };
    bloquearAjustes(true);
    pedirPantalla();

    if (state.modo === 'papa') {
      statusEl.textContent = '¡Pasa el móvil!';
      programar(() => terminar('tiempo'), duracion * 1000);
    } else if (state.modo === 'impulso') {
      const de = urgeInput.value.trim();
      statusEl.textContent = de ? `Ganas de ${de}: obsérvalas sin hacerles caso.` : 'Observa las ganas sin hacerles caso.';
      programar(() => terminar('tiempo'), duracion * 1000);
    } else {
      statusEl.textContent = 'Esperando el primer aviso…';
      if (state.total) ronda.fin = ronda.inicio + state.total * 1000;
      programarAviso();
    }

    const r = ronda;
    await anticipacion();
    if (!r.vivo) return;
    if (r.modo === 'papa') accionPapa(r);
    else if (r.modo === 'impulso') respirar(r);
  }

  // La papa se calienta en función del máximo del rango, no de la duración
  // elegida: si llegara al rojo justo al sonar, el color delataría cuánto
  // falta. El tictac se acelera con la misma regla.
  function accionPapa(r) {
    const max = r.rango[1] * 1000;
    r.anims.push(heat.animate([{ opacity: 0 }, { opacity: 0.9 }], { duration: max, easing: 'ease-in', fill: 'forwards' }));
    r.anims.push(steam.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 0.7 }], { duration: max, fill: 'forwards' }));
    let temblor = null;
    if (!reducedMotion()) {
      temblor = body.animate(
        [
          { transform: 'rotate(0) translateX(0)' },
          { transform: 'rotate(-2.5deg) translateX(-1.5px)' },
          { transform: 'rotate(2.5deg) translateX(1.5px)' },
          { transform: 'rotate(0) translateX(0)' },
        ],
        { duration: 420, iterations: Infinity },
      );
      temblor.playbackRate = 0.35;
      r.anims.push(temblor);
    }
    let agudo = true;
    const tic = () => {
      if (!r.vivo) return;
      const t = Math.min(1, (Date.now() - r.inicio) / max);
      audio.tic(agudo);
      agudo = !agudo;
      if (temblor) temblor.playbackRate = 0.35 + t * 1.9;
      programar(tic, 750 - t * 560);
    };
    tic();
  }

  // Guía de respiración por fases (inhala, mantén, exhala, mantén) con el
  // patrón elegido; las fases de 0 s se saltan. Encadenada por `.finished`:
  // mantener también es una animación (quieta) de la duración de la fase.
  // Se corta sola al cancelar las animaciones de la ronda.
  async function respirar(r) {
    const quieto = reducedMotion();
    const fases = fasesActuales();
    // Tamaño del disco al terminar cada fase: lleno tras inhalar y mantener,
    // recogido tras exhalar y mantener
    const lleno = [true, true, false, false];
    const estado = (grande) => (quieto
      ? { opacity: grande ? 1 : 0.5 }
      : { transform: grande ? 'scale(1)' : 'scale(0.62)' });
    let grande = false;
    while (r.vivo) {
      for (let i = 0; i < 4 && r.vivo; i++) {
        const seg = fases[i];
        if (!seg) continue;
        breathText.textContent = NOMBRES_FASE[i];
        for (let k = 0; k < seg; k++) {
          programar(() => { if (r.vivo) breathCount.textContent = String(seg - k); }, k * 1000);
        }
        const a = breathCore.animate([estado(grande), estado(lleno[i])], {
          duration: seg * 1000, easing: 'ease-in-out', fill: 'forwards',
        });
        r.anims.push(a);
        try { await a.finished; } catch (e) { return; }
        r.anims = r.anims.filter((x) => x !== a);
        grande = lleno[i];
      }
    }
  }

  function programarAviso() {
    const r = ronda;
    const espera = duracionAleatoria(r.rango, randomUnit()) * 1000;
    if (r.fin && Date.now() + espera >= r.fin) {
      programar(() => terminar('fin'), Math.max(0, r.fin - Date.now()));
      return;
    }
    programar(() => aviso(r), espera);
  }

  function aviso(r) {
    if (!r.vivo) return;
    r.avisos += 1;
    audio.campana(1);
    vibrar(150);
    destello(`Aviso ${r.avisos}`);
    statusEl.textContent = `${r.avisos} ${r.avisos === 1 ? 'aviso' : 'avisos'}. El siguiente, cuando menos lo esperes.`;
    if (!reducedMotion()) {
      body.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' }],
        { duration: 600, easing: 'ease-out' },
      );
      ondas.forEach((o, i) => o.animate(
        [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.35)' }],
        { duration: 1400, delay: i * 250, easing: 'ease-out' },
      ));
    }
    programarAviso();
  }

  async function terminar(motivo) {
    const r = ronda;
    if (!r || !r.vivo) return;
    limpiarRonda();
    const transcurrido = Math.round((Date.now() - r.inicio) / 1000);
    ronda = null;
    bloquearAjustes(false);
    statusEl.textContent = '';
    breathText.textContent = 'Respira';
    breathCount.textContent = '';

    if (motivo !== 'parado') {
      if (r.modo === 'papa') {
        audio.campana(1.4);
        audio.campana(1.2, 0.45);
        vibrar([300, 100, 300]);
      } else {
        audio.campana(1.2);
        vibrar([200, 100, 200]);
      }
      await aterrizaje();
    }

    if (r.modo === 'papa') terminarPapa(r, motivo);
    else if (r.modo === 'impulso') terminarImpulso(r, motivo, transcurrido);
    else terminarAvisos(r, motivo, transcurrido);
  }

  function terminarPapa(r, motivo) {
    if (motivo === 'parado') {
      statusEl.textContent = 'Ronda parada';
      empezarReposo();
      return;
    }
    const j = juego();
    const apuesta = stakeInput.value.trim();
    const frase = apuesta ? `${j.perder}: ${apuesta}` : '';
    mostrarResultado(j.final, frase, `Duró ${formatoDuracion(r.duracion)}`);
    guardarEnHistorial(frase || j.final, `${j.corto} · ${formatoDuracion(r.duracion)}`);
    abrirAviso({
      kicker: j.nombre,
      title: j.final,
      text: frase || 'A quien tenga el móvil, le toca.',
      principal: 'Otra ronda',
      cerrar: true,
      onClose: (accion) => {
        empezarReposo();
        if (accion === 'principal') empezar();
      },
    });
  }

  function terminarImpulso(r, motivo, transcurrido) {
    const de = urgeInput.value.trim();
    const antes = state.ganasAntes;
    if (motivo === 'parado') {
      mostrarResultado(`Paraste a los ${formatoDuracion(transcurrido)}`, '', 'Otra vez será');
      guardarEnHistorial(de ? `Ganas de ${de}` : 'Aguantar un impulso', `Paraste a los ${formatoDuracion(transcurrido)}`);
      guardarRegistro(ESPERAS_KEY, { t: Date.now(), de, antes, despues: null, seg: transcurrido, parada: true });
      renderEvidencia();
      empezarReposo();
      return;
    }
    // Lo que decían tus esperas anteriores, para comparar con esta
    const previo = resumenEsperas(registros(ESPERAS_KEY));
    abrirAviso({
      kicker: 'Aguantar un impulso',
      title: 'Pasó el tiempo',
      text: `Esperaste ${formatoDuracion(r.duracion)}. ${de ? `¿Siguen igual las ganas de ${de}?` : '¿Siguen igual las ganas?'}`,
      ganas: true,
      extra: previo ? `Tu media hasta hoy: de ${decimal(previo.antes)} a ${decimal(previo.despues)}` : '',
      principal: 'Listo',
      onClose: () => {
        const despues = Number(alertEl.querySelector('[data-ganas-despues][aria-pressed="true"]')?.dataset.ganasDespues) || null;
        const cambio = antes && despues ? `Ganas ${antes} → ${despues}` : despues ? `Ganas al final: ${despues}` : '';
        mostrarResultado('Pasó el tiempo', cambio, `Esperaste ${formatoDuracion(r.duracion)}`);
        guardarEnHistorial(de ? `Ganas de ${de}` : 'Aguantar un impulso', [cambio, formatoDuracion(r.duracion)].filter(Boolean).join(' · '));
        guardarRegistro(ESPERAS_KEY, { t: Date.now(), de, antes, despues, seg: r.duracion, parada: false });
        renderEvidencia();
        empezarReposo();
      },
    });
  }

  function terminarAvisos(r, motivo, transcurrido) {
    const n = r.avisos;
    const cuantos = `${n} ${n === 1 ? 'aviso' : 'avisos'}`;
    mostrarResultado(cuantos, '', `En ${formatoDuracion(transcurrido)}`);
    if (!n) {
      empezarReposo();
      return;
    }
    guardarEnHistorial(cuantos, `Cada ${formatoRango(r.rango)} · ${formatoDuracion(transcurrido)}`);
    // Al cerrar una sesión, una pregunta opcional: con el tiempo, la
    // respuesta dice más que el número de avisos
    abrirAviso({
      kicker: 'Avisos al azar',
      title: motivo === 'fin' ? 'Fin de la sesión' : 'Sesión terminada',
      text: `${cuantos} en ${formatoDuracion(transcurrido)}.`,
      atencion: true,
      principal: 'Listo',
      onClose: () => {
        const atencion = alertEl.querySelector('[data-atencion][aria-pressed="true"]')?.dataset.atencion || null;
        guardarRegistro(SESIONES_KEY, { t: Date.now(), avisos: n, seg: transcurrido, atencion });
        renderSesiones();
        empezarReposo();
      },
    });
  }

  // --- Eventos --------------------------------------------------------------
  btnStart.addEventListener('click', () => {
    if (ronda) terminar('parado');
    else empezar();
  });

  btnSound.addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    writeStore(SONIDO_KEY, audio.enabled);
    renderSonido();
    if (audio.enabled) audio.campana(0.5);
  });

  modeButtons.forEach((b) => b.addEventListener('click', () => {
    if (ronda || b.dataset.mode === state.modo) return;
    state.modo = b.dataset.mode;
    writeStore(MODO_KEY, state.modo);
    ocultarResultado();
    statusEl.textContent = '';
    renderModo();
    cambioDeObjeto();
  }));

  function guardarRangos() {
    writeStore(RANGOS_KEY, state.rangos);
  }

  presetButtons.forEach((b) => b.addEventListener('click', () => {
    state.rangos[state.modo] = { preset: Number(b.dataset.preset) };
    guardarRangos();
    renderRango();
  }));

  btnCustom.addEventListener('click', () => {
    if (esCustom(state.modo)) {
      state.rangos[state.modo] = { preset: MODOS[state.modo].porDefecto };
    } else {
      state.rangos[state.modo] = { custom: rangoDe(state.modo) };
    }
    guardarRangos();
    renderRango();
    if (!customBox.hidden) inputMin.focus();
  });

  function leerCustom() {
    const factor = unidadCustom === 'min' ? 60 : 1;
    const a = parseFloat(String(inputMin.value).replace(',', '.'));
    const b = parseFloat(String(inputMax.value).replace(',', '.'));
    const n = normalizarRango(a * factor, b * factor);
    if (!n) return;
    state.rangos[state.modo] = { custom: n };
    guardarRangos();
  }

  inputMin.addEventListener('change', () => { leerCustom(); renderRango(); });
  inputMax.addEventListener('change', () => { leerCustom(); renderRango(); });

  selectJuego.addEventListener('change', () => {
    const j = juegoValido(selectJuego.value);
    if (!j) return;
    state.juego = j;
    writeStore(JUEGO_KEY, j);
    renderJuego();
  });

  stakeInput.value = readStore(APUESTA_KEY, '') || '';
  stakeInput.addEventListener('input', () => writeStore(APUESTA_KEY, stakeInput.value.slice(0, 60)));
  urgeInput.value = readStore(GANAS_DE_KEY, '') || '';
  urgeInput.addEventListener('input', () => writeStore(GANAS_DE_KEY, urgeInput.value.slice(0, 60)));

  ganasButtons.forEach((b) => b.addEventListener('click', () => {
    const v = Number(b.dataset.ganas);
    state.ganasAntes = state.ganasAntes === v ? null : v;
    ganasButtons.forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.ganas) === state.ganasAntes)));
  }));

  totalButtons.forEach((b) => b.addEventListener('click', () => {
    state.total = Number(b.dataset.total);
    writeStore(TOTAL_KEY, state.total);
    totalButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  btnShare.addEventListener('click', async () => {
    const [min, max] = rangoDe(state.modo);
    const p = new URLSearchParams({ modo: state.modo, min: String(min), max: String(max) });
    if (state.modo === 'papa') p.set('juego', state.juego);
    const enlace = `${window.location.origin}${window.location.pathname}?${p}`;
    try {
      await navigator.clipboard.writeText(enlace);
      shareMsg.textContent = 'Enlace copiado';
    } catch (e) {
      shareMsg.textContent = enlace;
    }
  });

  respButtons.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.resp === 'propia') {
      state.resp = { propia: state.resp.propia || [...fasesActuales()] };
    } else {
      state.resp = { clave: b.dataset.resp };
    }
    writeStore(RESP_KEY, state.resp);
    renderResp();
  }));

  faseInputs.forEach((inp) => inp.addEventListener('change', () => {
    const n = normalizarRespiracion(faseInputs.map((x) => x.value));
    if (n) {
      state.resp = { propia: n };
      writeStore(RESP_KEY, state.resp);
    }
    renderResp();
  }));

  evidClear.addEventListener('click', () => {
    writeStore(ESPERAS_KEY, null);
    renderEvidencia();
  });

  sesClear.addEventListener('click', () => {
    writeStore(SESIONES_KEY, null);
    renderSesiones();
  });

  alertAtencionButtons.forEach((b) => b.addEventListener('click', () => {
    alertAtencionButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b && x.getAttribute('aria-pressed') !== 'true')));
  }));

  btnClear.addEventListener('click', () => {
    state.history = [];
    writeStore(HISTORY_KEY, null);
    renderHistory();
  });

  alertGanasButtons.forEach((b) => b.addEventListener('click', () => {
    alertGanasButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  alertMain.addEventListener('click', () => cerrarAviso('principal'));
  alertClose.addEventListener('click', () => cerrarAviso('cerrar'));
  alertEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarAviso('cerrar');
  });

  function alVolver() {
    if (document.hidden) return;
    if (tituloOriginal && document.title !== tituloOriginal) document.title = tituloOriginal;
    if (!ronda) return;
    pedirPantalla();
    // Si el móvil durmió más de la cuenta, el aviso sale al volver
    if (ronda.fin && Date.now() >= ronda.fin) terminar(ronda.modo === 'avisos' ? 'fin' : 'tiempo');
  }
  document.addEventListener('visibilitychange', alVolver);

  document.addEventListener('astro:before-swap', () => {
    limpiarRonda();
    ronda = null;
    pararReposo();
    document.removeEventListener('visibilitychange', alVolver);
  }, { once: true });

  // --- Arranque -------------------------------------------------------------
  tituloOriginal = document.title;
  cargarHistorial();
  renderModo();
  renderSonido();
  renderHistory();
  entrada();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTemporizador);
} else {
  initTemporizador();
}
document.addEventListener('astro:page-load', initTemporizador);
