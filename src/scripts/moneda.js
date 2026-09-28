// ==========================================================
// LANZAR MONEDA — decide entre dos opciones
// ==========================================================
// La apariencia vive en Coin.astro y moneda.astro, y la lógica sin DOM
// (series, varias monedas, nombres regionales) en moneda-serie.js. Aquí se
// lee la interfaz, se anima el volteo con la Web Animations API y se
// escribe el texto. Arco, giro y sombra de cada moneda comparten duración,
// así que caen a la vez.

import {
  NOMBRES, nombresPorDefecto, juegoDeNombres, glifos, modoValido,
  jugarSerie, lanzarVarias, resumenVarias,
} from './moneda-serie.js';

const HISTORY_KEY = 'decidelo_moneda_history';
const OPTIONS_KEY = 'decidelo_moneda_opciones';
const NAMES_KEY = 'decidelo_moneda_nombres';
const MODE_KEY = 'decidelo_moneda_modo';
const GUT_KEY = 'decidelo_moneda_intuicion';
const HISTORY_MAX = 10;

// Duración de un volteo según el modo: la serie encadena varios, así que
// cada uno es más corto para que el total no se vuelva suspense de casino.
const FLIP_MS = { una: 1600, serie: 1000, varias: 1400 };
const PAUSA_SERIE_MS = 250;
const ESCALONADO_MS = 80;

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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Una moneda del DOM (grande o pequeña) con su ángulo acumulado en X:
// 0 mod 360 = cara arriba, 180 mod 360 = cruz arriba.
function monedaDe(stage) {
  return {
    stage,
    coin: stage.querySelector('.coin'),
    flight: stage.querySelector('.coin-flight'),
    shadow: stage.querySelector('.coin-floor-shadow'),
    angle: 0,
  };
}

// Deja fijado el estado final y suelta la animación: con `fill: forwards`
// cada lanzamiento acumularía animaciones vivas en el elemento.
async function terminar(anim, el, transform) {
  try {
    await anim.finished;
  } catch (e) {
    // Cancelada (navegación): se fija igual el estado final
  }
  if (transform !== undefined) el.style.transform = transform;
  anim.cancel();
}

async function voltear(m, side, duracion, retraso = 0) {
  const from = m.angle;
  const turns = 4 + Math.floor(randomUnit() * 2); // 4 o 5 vueltas
  const to = from - (from % 360) + turns * 360 + (side === 'tails' ? 180 : 0);
  m.angle = to;
  const final = `rotateX(${to}deg)`;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const a = m.coin.animate(
      [
        { transform: `rotateX(${from}deg)`, opacity: 1 },
        { transform: `rotateX(${from}deg)`, opacity: 0, offset: 0.5 },
        { transform: final, opacity: 0, offset: 0.5 },
        { transform: final, opacity: 1 },
      ],
      { duration: 200, fill: 'forwards' }
    );
    return terminar(a, m.coin, final);
  }

  const opts = { duration: duracion, delay: retraso, fill: 'both' };
  // Altura del arco proporcional a la moneda, para no tapar las opciones en móvil
  const peak = Math.round(m.flight.offsetHeight * 0.6);
  // Giro: rápido al salir, frena al caer
  const spin = m.coin.animate(
    [{ transform: `rotateX(${from}deg)` }, { transform: final }],
    { ...opts, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)' }
  );
  // Arco: sube frenando, baja acelerando y un rebote mínimo al tocar
  const arc = m.flight.animate(
    [
      { transform: 'translateY(0)', easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      { transform: `translateY(-${peak}px)`, offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
      { transform: 'translateY(0)', offset: 0.88, easing: 'ease-out' },
      { transform: `translateY(-${Math.max(3, Math.round(peak / 10))}px)`, offset: 0.94, easing: 'ease-in' },
      { transform: 'translateY(0)' },
    ],
    opts
  );
  const shadow = m.shadow?.animate(
    [
      { transform: 'scale(1)', opacity: 1, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      { transform: 'scale(0.45)', opacity: 0.35, offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
      { transform: 'scale(1)', opacity: 1, offset: 0.88 },
      { transform: 'scale(0.92)', opacity: 0.9, offset: 0.94 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    opts
  );
  await Promise.all([
    terminar(spin, m.coin, final),
    terminar(arc, m.flight),
    shadow ? terminar(shadow, m.shadow) : null,
  ]);
}

function initMoneda() {
  const $ = (id) => document.getElementById(id);
  const single = $('coin-single');
  const multi = $('coin-multi');
  const btnFlip = $('btn-flip');
  const result = $('coin-result');
  const resultMain = $('coin-result-main');
  const resultSide = $('coin-result-side');
  const inputHeads = $('option-heads');
  const inputTails = $('option-tails');
  const selMode = $('coin-mode');
  const selNames = $('coin-names');
  const selCount = $('coin-count');
  const countField = $('coin-count-field');
  const chapas = $('coin-chapas');
  const after = $('coin-after');
  const gut = $('coin-gut');
  const gutMsg = $('gut-msg');
  const btnRelief = $('gut-relief');
  const btnDisappoint = $('gut-disappoint');
  const btnGutOff = $('gut-off');
  const btnShare = $('btn-share');
  const historyList = $('history-list');
  const historyCount = $('history-count');
  const btnClear = $('btn-clear');

  if (!single || !btnFlip || !result || btnFlip.dataset.ready) return;
  btnFlip.dataset.ready = 'true';

  const grande = monedaDe(single.querySelector('[data-coin]'));
  const pequenas = [...(multi?.querySelectorAll('[data-coin]') ?? [])].map(monedaDe);

  // Restos de la versión anterior con monedas temáticas
  writeStore('decidelo_moneda_style', null);

  // --- Estado inicial: enlace compartido > lo guardado > idioma ----------
  // Los valores del enlace solo se escriben con .value / textContent, nunca
  // como HTML: vienen de la URL y cualquiera puede fabricar una.
  const params = new URLSearchParams(location.search);
  const saved = readStore(OPTIONS_KEY, {});
  const clip = (v) => String(v ?? '').slice(0, 40);

  if (inputHeads) inputHeads.value = clip(params.get('cara') ?? saved.heads ?? '');
  if (inputTails) inputTails.value = clip(params.get('cruz') ?? saved.tails ?? '');

  let nombres = juegoDeNombres(
    params.get('nombres') ?? readStore(NAMES_KEY, null) ?? nombresPorDefecto({ zona: zonaHoraria(), idioma: navigator.language })
  );
  let modo = modoValido(params.get('modo') ?? readStore(MODE_KEY, 'una'));
  let cuantas = Math.min(5, Math.max(2, Number(readStore('decidelo_moneda_cuantas', 2)) || 2));

  if (selNames) selNames.value = nombres;
  if (selMode) selMode.value = modo;
  if (selCount) selCount.value = String(cuantas);

  function saveOptions() {
    writeStore(OPTIONS_KEY, {
      heads: inputHeads ? inputHeads.value.trim() : '',
      tails: inputTails ? inputTails.value.trim() : '',
    });
  }
  if (params.has('cara') || params.has('cruz')) saveOptions();
  inputHeads?.addEventListener('input', saveOptions);
  inputTails?.addEventListener('input', saveOptions);

  const nombre = (side) => NOMBRES[nombres][side];
  const opcion = (side) => {
    const input = side === 'heads' ? inputHeads : inputTails;
    return (input ? input.value.trim() : '') || nombre(side);
  };

  function aplicarNombres() {
    const g = glifos(nombres);
    document.querySelectorAll('[data-face-glyph]').forEach((el) => {
      el.textContent = g[el.dataset.faceGlyph];
    });
    document.querySelectorAll('[data-face-label], [data-name-label]').forEach((el) => {
      el.textContent = nombre(el.dataset.faceLabel || el.dataset.nameLabel);
    });
    renderHistory();
  }

  function aplicarModo() {
    const varias = modo === 'varias';
    single.hidden = varias;
    if (multi) multi.hidden = !varias;
    pequenas.forEach((m, i) => { m.stage.hidden = i >= cuantas; });
    if (countField) countField.hidden = !varias;
    if (chapas) chapas.hidden = !(varias && cuantas === 2);
    btnFlip.textContent = varias ? `Lanzar ${cuantas} monedas`
      : modo === 'una' ? 'Lanzar moneda' : `Jugar al mejor de ${modo === 'mejor3' ? 3 : 5}`;
    limpiarResultado();
  }

  selNames?.addEventListener('change', () => {
    nombres = juegoDeNombres(selNames.value);
    writeStore(NAMES_KEY, nombres);
    aplicarNombres();
  });
  selMode?.addEventListener('change', () => {
    modo = modoValido(selMode.value);
    writeStore(MODE_KEY, modo);
    aplicarModo();
  });
  selCount?.addEventListener('change', () => {
    cuantas = Math.min(5, Math.max(2, Number(selCount.value) || 2));
    writeStore('decidelo_moneda_cuantas', cuantas);
    aplicarModo();
  });

  // --- Historial -----------------------------------------------------------
  // Entradas { side: 'heads'|'tails'|null, label, detalle }. Versiones
  // anteriores guardaban 'Cara'/'Cruz' (string suelto o en `side`).
  const lado = (v) => (v === 'Cara' || v === 'heads' ? 'heads' : v === 'Cruz' || v === 'tails' ? 'tails' : null);
  let history = readStore(HISTORY_KEY, [])
    .map((h) => (typeof h === 'string' ? { side: lado(h), label: h } : h))
    .filter((h) => h && typeof h.label === 'string')
    .map((h) => ({ side: lado(h.side), label: h.label, detalle: h.detalle }));

  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();

    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Sin lanzamientos aún';
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
        label.textContent = h.label;
        const side = document.createElement('span');
        side.className = 'history-side';
        side.textContent = h.detalle ?? (h.side ? nombre(h.side) : '');
        row.append(n, label, side);
        historyList.appendChild(row);
      });
    }

    if (historyCount) {
      const simples = history.filter((h) => h.side && !h.detalle);
      const heads = simples.filter((h) => h.side === 'heads').length;
      historyCount.textContent = simples.length
        ? `${nombre('heads')} ${heads} · ${nombre('tails')} ${simples.length - heads}`
        : '';
    }
  }

  function guardar(entrada) {
    history.push(entrada);
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    writeStore(HISTORY_KEY, history);
    renderHistory();
  }

  // --- Resultado, intuición y compartir -----------------------------------
  let ultimo = null; // { ganador, texto } del último resultado decidible

  function limpiarResultado() {
    result.classList.remove('is-shown');
    delete result.dataset.estado;
    if (after) after.hidden = true;
    if (gutMsg) gutMsg.textContent = '';
    [btnRelief, btnDisappoint].forEach((b) => b?.setAttribute('aria-pressed', 'false'));
  }

  function mostrar(main, side, final) {
    resultMain.textContent = main;
    resultSide.textContent = side;
    result.classList.add('is-shown');
    if (final) result.dataset.estado = 'final';
  }

  function despues(ganador) {
    if (!after) return;
    after.hidden = false;
    // La pregunta de intuición solo tiene sentido cuando hay un ganador
    const preguntar = ganador && readStore(GUT_KEY, 'on') !== 'off';
    if (gut) gut.hidden = !preguntar;
  }

  function responder(alivio) {
    if (!ultimo?.ganador || !gutMsg) return;
    btnRelief?.setAttribute('aria-pressed', String(alivio));
    btnDisappoint?.setAttribute('aria-pressed', String(!alivio));
    const otro = ultimo.ganador === 'heads' ? 'tails' : 'heads';
    const em = document.createElement('em');
    gutMsg.replaceChildren();
    if (alivio) {
      em.textContent = opcion(ultimo.ganador);
      gutMsg.append('Entonces ya lo tenías claro: ', em, '.');
    } else {
      em.textContent = opcion(otro);
      gutMsg.append('Parece que preferías ', em, '. La moneda te ayudó a descubrirlo; puedes elegirlo sin culpa.');
    }
  }

  btnRelief?.addEventListener('click', () => responder(true));
  btnDisappoint?.addEventListener('click', () => responder(false));
  btnGutOff?.addEventListener('click', () => {
    writeStore(GUT_KEY, 'off');
    if (gut) gut.hidden = true;
  });

  function enlace() {
    const u = new URL(location.pathname, location.origin);
    const h = inputHeads?.value.trim();
    const t = inputTails?.value.trim();
    if (h) u.searchParams.set('cara', h);
    if (t) u.searchParams.set('cruz', t);
    if (modo !== 'una') u.searchParams.set('modo', modo);
    u.searchParams.set('nombres', nombres);
    return u.toString();
  }

  btnShare?.addEventListener('click', async () => {
    const url = enlace();
    const texto = ultimo
      ? `Lancé una moneda: ${opcion('heads')} o ${opcion('tails')} → ${ultimo.texto}. Lánzala tú:`
      : 'Lanza esta moneda:';
    const original = 'Compartir esta decisión';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Decídelo.app — moneda', text: texto, url });
        return;
      }
      await navigator.clipboard.writeText(`${texto} ${url}`);
      btnShare.textContent = 'Enlace copiado';
    } catch (e) {
      // Compartir cancelado o portapapeles bloqueado: se muestra el enlace
      if (e?.name === 'AbortError') return;
      btnShare.textContent = url;
    }
    setTimeout(() => { btnShare.textContent = original; }, 2500);
  });

  // --- Lanzar --------------------------------------------------------------
  let busy = false;

  async function lanzarUna() {
    const side = randomUnit() < 0.5 ? 'heads' : 'tails';
    await voltear(grande, side, FLIP_MS.una);
    const label = opcion(side);
    mostrar(label, label === nombre(side) ? '' : nombre(side), true);
    ultimo = { ganador: side, texto: `salió ${label}` };
    guardar({ side, label });
    return side;
  }

  async function lanzarSerie(n) {
    const { tiros, marcador, ganador } = jugarSerie(n, randomUnit);
    const cuenta = { heads: 0, tails: 0 };
    for (let i = 0; i < tiros.length; i++) {
      if (i > 0) await esperar(PAUSA_SERIE_MS);
      await voltear(grande, tiros[i], FLIP_MS.serie);
      cuenta[tiros[i]] += 1;
      mostrar(
        `${opcion('heads')} ${cuenta.heads} – ${cuenta.tails} ${opcion('tails')}`,
        `Mejor de ${n} · tiro ${i + 1}`,
        false
      );
    }
    const label = opcion(ganador);
    const score = `${marcador[ganador]}–${marcador[ganador === 'heads' ? 'tails' : 'heads']}`;
    mostrar(label, `gana ${score} al mejor de ${n}`, true);
    ultimo = { ganador, texto: `ganó ${label} ${score} al mejor de ${n}` };
    guardar({ side: ganador, label, detalle: `${score} · mejor de ${n}` });
    return ganador;
  }

  async function lanzarVariasMonedas() {
    const activas = pequenas.slice(0, cuantas);
    const lados = lanzarVarias(activas.length, randomUnit);
    await Promise.all(activas.map((m, i) => voltear(m, lados[i], FLIP_MS.varias, i * ESCALONADO_MS)));
    const resumen = resumenVarias(lados, nombres);
    mostrar(resumen, `${activas.length} monedas`, true);
    ultimo = { ganador: null, texto: resumen };
    guardar({ side: null, label: resumen, detalle: `${activas.length} monedas` });
    return null;
  }

  async function flip() {
    if (busy) return;
    busy = true;
    btnFlip.setAttribute('aria-busy', 'true');
    btnFlip.disabled = true;
    limpiarResultado();

    let ganador = null;
    if (modo === 'varias') ganador = await lanzarVariasMonedas();
    else if (modo === 'mejor3') ganador = await lanzarSerie(3);
    else if (modo === 'mejor5') ganador = await lanzarSerie(5);
    else ganador = await lanzarUna();

    if (navigator.vibrate) navigator.vibrate(12);
    despues(ganador);

    busy = false;
    btnFlip.disabled = false;
    btnFlip.removeAttribute('aria-busy');
  }

  btnFlip.addEventListener('click', flip);
  grande.coin?.addEventListener('click', flip);
  pequenas.forEach((m) => m.coin?.addEventListener('click', flip));

  btnClear?.addEventListener('click', () => {
    history = [];
    writeStore(HISTORY_KEY, null);
    renderHistory();
  });

  aplicarNombres();
  aplicarModo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMoneda);
} else {
  initMoneda();
}
document.addEventListener('astro:page-load', initMoneda);
