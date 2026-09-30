// ==========================================================
// PIEDRA, PAPEL O TIJERA — contra la máquina o dos jugadores
// ==========================================================
// La apariencia vive en PptHands.astro, HandShape.astro y la página. Aquí se
// decide la jugada de la máquina, se anima con la Web Animations API y se
// escribe el texto. Las manos siguen el ciclo de movimiento de DESIGN.md:
// entran desde su lado al cargar, respiran en reposo, marcan el "piedra,
// papel, tijera" en cada ronda y se asientan al enseñar la jugada.
// Con dos jugadores se elige por turnos en el mismo móvil: la jugada del
// primero no se ve en ningún sitio hasta que el segundo elige.

// Formato heredado de la versión anterior ({ victorias, derrotas, empates }):
// se sigue usando tal cual para el marcador contra la máquina.
const SCORE_KEY = 'decidelo_ppt_score';
const SCORE_DOS_KEY = 'decidelo_ppt_score_dos';
const MODE_KEY = 'decidelo_ppt_modo';
const NAMES_KEY = 'decidelo_ppt_nombres';
const HISTORY_KEY = 'decidelo_ppt_historial';
const HISTORY_MAX = 10;
const NAME_MAX = 20;

// Tres golpes de ~330ms (uno por palabra) + el asiento: unos 1,4 s, dentro
// del margen de DESIGN.md.
const ENTRY_MS = 900;
const PUMP_MS = 330;
const LAND_MS = 380;
const IDLE_MS = 1700;
const REDUCED_MS = 200;

const FORMAS = ['piedra', 'papel', 'tijera'];
const NOMBRE = { piedra: 'Piedra', papel: 'Papel', tijera: 'Tijera' };
const VENCE = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' };
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
  const namesBox = $('ppt-names');
  const nameInputs = [$('ppt-name-input-1'), $('ppt-name-input-2')];
  const turn = $('ppt-turn');
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
    name: $(`ppt-name-${n}`),
    score: $(`ppt-score-${n}`),
    // La mano derecha es la izquierda en espejo: gira al revés
    giro: n === 1 ? -1 : 1,
  }));

  if (!object || !result || choices.length !== 3 || object.dataset.ready) return;
  object.dataset.ready = 'true';

  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = (a) => a?.finished.catch(() => {});

  // --- Estado ------------------------------------------------------------------
  let modo = readStore(MODE_KEY, 'maquina') === 'dos' ? 'dos' : 'maquina';
  const guardados = readStore(NAMES_KEY, []);
  nameInputs.forEach((input, i) => {
    if (input) input.value = String((Array.isArray(guardados) && guardados[i]) || '').slice(0, NAME_MAX);
  });
  let marcador = leerMarcador(modo);
  let history = leerHistorial();
  let busy = false;
  let pendiente = null; // jugada del jugador 1 mientras elige el 2

  const nombres = () =>
    modo === 'maquina'
      ? ['Tú', 'Máquina']
      : nameInputs.map((input, i) => input?.value.trim() || `Jugador ${i + 1}`);

  function pintarNombres() {
    const [n1, n2] = nombres();
    lados[0].name.textContent = n1;
    lados[1].name.textContent = n2;
  }

  function pintarMarcador() {
    lados[0].score.textContent = marcador.j1;
    lados[1].score.textContent = marcador.j2;
  }

  function pintarTurno() {
    if (!turn) return;
    const [n1, n2] = nombres();
    if (modo === 'maquina') turn.textContent = 'Elige tu jugada';
    else if (pendiente) turn.textContent = `Listo. Ahora ${n2}, sin que ${n1} mire`;
    else turn.textContent = `Elige ${n1}, sin que ${n2} mire`;
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

  // Aterrizaje: al abrir la mano en la jugada, un pequeño aplastamiento
  function asentar() {
    return Promise.all(lados.map((l) => fin(l.rig?.animate([
      { transform: 'scale(1.08, 0.9)' },
      { transform: 'scale(0.97, 1.04)', offset: 0.5 },
      { transform: 'none' },
    ], { duration: LAND_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }))));
  }

  // --- Ronda ----------------------------------------------------------------------
  function limpiar() {
    result.classList.remove('is-shown');
    delete result.dataset.estado;
    delete result.dataset.ganador;
    lados.forEach((l) => {
      l.side?.classList.remove('is-winner', 'is-loser');
      if (l.hand) l.hand.dataset.forma = 'piedra';
    });
  }

  function bloquear(activo) {
    busy = activo;
    choices.forEach((b) => { b.disabled = activo; });
    modeBtns.forEach((b) => { b.disabled = activo; });
  }

  async function jugar(e1, e2) {
    bloquear(true);
    limpiar();
    parar();

    if (reducido()) {
      lados[0].hand.dataset.forma = e1;
      lados[1].hand.dataset.forma = e2;
      await Promise.all(lados.map((l) => fin(l.rig?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS }))));
    } else {
      for (const palabra of CANTO) {
        if (turn) turn.textContent = palabra;
        await golpe();
      }
      lados[0].hand.dataset.forma = e1;
      lados[1].hand.dataset.forma = e2;
      await asentar();
    }

    const g = e1 === e2 ? 'empate' : VENCE[e1] === e2 ? 'j1' : 'j2';
    const [n1, n2] = nombres();
    let texto;
    if (g === 'empate') texto = 'Empate';
    else if (modo === 'maquina') texto = g === 'j1' ? 'Ganas tú' : 'Gana la máquina';
    else texto = `Gana ${g === 'j1' ? n1 : n2}`;

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
    if (g === 'j1') marcador.j1 += 1;
    else if (g === 'j2') marcador.j2 += 1;
    else marcador.empates += 1;
    guardarMarcador(modo, marcador);
    pintarMarcador();
    guardar({ e1, e2, g, texto });

    if (navigator.vibrate) navigator.vibrate(30);
    pendiente = null;
    choices.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    bloquear(false);
    pintarTurno();
    reposar();
  }

  choices.forEach((btn) => {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (busy) return;
      const eleccion = btn.dataset.choice;
      if (!FORMAS.includes(eleccion)) return;

      if (modo === 'maquina') {
        btn.setAttribute('aria-pressed', 'true');
        jugar(eleccion, FORMAS[randomIndex(3)]);
        return;
      }
      // Dos jugadores: la jugada del primero no se marca en ningún botón,
      // o el segundo la vería al coger el móvil
      if (!pendiente) {
        pendiente = eleccion;
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
    writeStore(MODE_KEY, modo === 'dos' ? 'dos' : null);
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === modo)));
    if (namesBox) namesBox.hidden = modo !== 'dos';
    const grupo = document.getElementById('ppt-choices');
    grupo?.setAttribute('aria-label', modo === 'dos' ? 'Jugada' : 'Tu jugada');
    pendiente = null;
    marcador = leerMarcador(modo);
    limpiar();
    pintarNombres();
    pintarMarcador();
    pintarTurno();
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (!busy && b.dataset.mode !== modo) ponerModo(b.dataset.mode === 'dos' ? 'dos' : 'maquina');
  }));

  nameInputs.forEach((input) => input?.addEventListener('input', () => {
    const valores = nameInputs.map((i) => i?.value.trim().slice(0, NAME_MAX) ?? '');
    writeStore(NAMES_KEY, valores.some(Boolean) ? valores : null);
    pintarNombres();
    pintarTurno();
  }));

  ponerModo(modo);
  renderHistory();
  entrar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPPT);
} else {
  initPPT();
}
document.addEventListener('astro:page-load', initPPT);
