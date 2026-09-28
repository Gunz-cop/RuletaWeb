// ==========================================================
// ORÁCULO SÍ O NO — la bola 8 responde a una pregunta
// ==========================================================
// La apariencia vive en OracleBall.astro y si-o-no.astro. Aquí se elige la
// respuesta, se agita la bola con la Web Animations API y se escribe el
// texto. También se puede consultar agitando el móvil (DeviceMotionEvent),
// siempre con un gesto previo del visitante: iOS no deja leer el sensor sin
// pedir permiso desde un toque.

const HISTORY_KEY = 'decidelo_siono_history';
const QUESTION_KEY = 'decidelo_siono_pregunta';
const GUT_KEY = 'decidelo_siono_intuicion';
const SHAKE_KEY = 'decidelo_siono_agitar';
const HISTORY_MAX = 10;
const QUESTION_MAX = 120;

// Agitado + dado que emerge: 1,6 s en total, dentro del margen de DESIGN.md
// (más largo ya es suspense de tragamonedas).
const SHAKE_MS = 1100;
const EMERGE_MS = 500;
const REDUCED_MS = 200;

// Detección de sacudida: variación de aceleración (m/s², con gravedad) entre
// dos lecturas seguidas. Caminar o girar el móvil ronda 3–8; una sacudida
// clara pasa de 15. Se piden varias lecturas fuertes seguidas para que un
// golpe suelto (dejar el móvil en la mesa) no consulte solo.
const SHAKE_DELTA = 15;
const SHAKE_HITS = 3;
const SHAKE_WINDOW_MS = 500;
const SHAKE_COOLDOWN_MS = 1000;

// Las 15 respuestas clásicas de la bola 8: cinco de cada tipo.
const RESPUESTAS = [
  { texto: 'Sí', tipo: 'si' },
  { texto: 'Definitivamente sí', tipo: 'si' },
  { texto: 'Sin duda alguna', tipo: 'si' },
  { texto: 'Todo apunta a que sí', tipo: 'si' },
  { texto: 'Es muy probable', tipo: 'si' },
  { texto: 'Es incierto', tipo: 'neutra' },
  { texto: 'Pregunta más tarde', tipo: 'neutra' },
  { texto: 'No puedo predecirlo ahora', tipo: 'neutra' },
  { texto: 'Mejor no te lo digo ahora', tipo: 'neutra' },
  { texto: 'Concéntrate y pregunta', tipo: 'neutra' },
  { texto: 'No', tipo: 'no' },
  { texto: 'Definitivamente no', tipo: 'no' },
  { texto: 'Poco probable', tipo: 'no' },
  { texto: 'Las fuentes dicen que no', tipo: 'no' },
  { texto: 'No cuentes con ello', tipo: 'no' },
];

const TIPO = { si: 'Sí', no: 'No', neutra: 'Ni sí ni no' };

// La versión anterior guardaba el color en vez del tipo
const TIPO_VIEJO = { cyan: 'si', purple: 'no', neutral: 'neutra' };

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

function randomIndex(n) {
  if (window.crypto && window.crypto.getRandomValues) {
    // Rechazo del sobrante para que las 15 respuestas pesen exactamente igual
    const limite = Math.floor(4294967296 / n) * n;
    const values = new Uint32Array(1);
    do window.crypto.getRandomValues(values); while (values[0] >= limite);
    return values[0] % n;
  }
  return Math.floor(Math.random() * n);
}

// Historial en el formato actual ({ pregunta, respuesta, tipo }, el más
// antiguo primero). El formato viejo ({ question, answer, class, timestamp },
// el más reciente primero) se convierte al leerlo.
function leerHistorial() {
  const raw = readStore(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  const viejo = raw.some((h) => h && typeof h.question === 'string');
  const lista = viejo
    ? raw.slice().reverse().map((h) => ({
        pregunta: h?.question,
        respuesta: h?.answer,
        tipo: TIPO_VIEJO[h?.class] ?? 'neutra',
      }))
    : raw;
  return lista
    .filter((h) => h && typeof h.respuesta === 'string')
    .map((h) => ({
      pregunta: typeof h.pregunta === 'string' ? h.pregunta.slice(0, QUESTION_MAX) : '',
      respuesta: h.respuesta,
      tipo: TIPO[h.tipo] ? h.tipo : 'neutra',
    }))
    .slice(-HISTORY_MAX);
}

function initSiONo() {
  const $ = (id) => document.getElementById(id);
  const input = $('oracle-question');
  const btnAsk = $('btn-ask');
  const object = $('oracle-object');
  const ball = $('oracle-ball');
  const die = $('oracle-die');
  const dieText = $('oracle-die-text');
  const result = $('oracle-result');
  const resultMain = $('oracle-result-main');
  const resultSide = $('oracle-result-side');
  const after = $('oracle-after');
  const gut = $('oracle-gut');
  const gutMsg = $('gut-msg');
  const btnRelief = $('gut-relief');
  const btnDisappoint = $('gut-disappoint');
  const btnGutOff = $('gut-off');
  const btnShare = $('btn-share');
  const shakeBox = $('oracle-shake');
  const btnShake = $('btn-shake');
  const shakeMsg = $('shake-msg');
  const historyList = $('history-list');
  const historyCount = $('history-count');
  const btnClear = $('btn-clear');

  if (!btnAsk || !object || !ball || !result || btnAsk.dataset.ready) return;
  btnAsk.dataset.ready = 'true';

  // --- Estado inicial: enlace compartido > lo guardado ----------------------
  // La pregunta del enlace solo se escribe con .value / textContent, nunca
  // como HTML: viene de la URL y cualquiera puede fabricar una.
  const params = new URLSearchParams(location.search);
  const clip = (v) => String(v ?? '').slice(0, QUESTION_MAX);
  if (input) input.value = clip(params.get('pregunta') ?? readStore(QUESTION_KEY, ''));
  input?.addEventListener('input', () => writeStore(QUESTION_KEY, input.value.trim() || null));

  // --- Historial -------------------------------------------------------------
  let history = leerHistorial();
  writeStore(HISTORY_KEY, history.length ? history : null);

  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();

    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Sin consultas aún';
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
        label.textContent = h.pregunta || 'Pregunta en mente';
        const side = document.createElement('span');
        side.className = 'history-side';
        side.textContent = h.respuesta;
        row.append(n, label, side);
        historyList.appendChild(row);
      });
    }

    if (historyCount) {
      const cuenta = { si: 0, no: 0, neutra: 0 };
      history.forEach((h) => { cuenta[h.tipo] += 1; });
      historyCount.textContent = history.length
        ? `Sí ${cuenta.si} · No ${cuenta.no}` + (cuenta.neutra ? ` · Dudas ${cuenta.neutra}` : '')
        : '';
    }
  }

  function guardar(entrada) {
    history.push(entrada);
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    writeStore(HISTORY_KEY, history);
    renderHistory();
  }

  btnClear?.addEventListener('click', () => {
    history = [];
    writeStore(HISTORY_KEY, null);
    renderHistory();
  });

  // --- Resultado, intuición y compartir --------------------------------------
  let ultimo = null; // { pregunta, respuesta, tipo }

  function limpiarResultado() {
    result.classList.remove('is-shown');
    delete result.dataset.estado;
    if (after) after.hidden = true;
    if (gutMsg) gutMsg.textContent = '';
    [btnRelief, btnDisappoint].forEach((b) => b?.setAttribute('aria-pressed', 'false'));
  }

  function mostrar(r) {
    resultMain.textContent = r.texto;
    // "Sí" / "No" a secas ya dicen su tipo: repetirlo debajo sobra
    resultSide.textContent = r.texto === TIPO[r.tipo] ? '' : TIPO[r.tipo];
    result.classList.add('is-shown');
    result.dataset.estado = 'final';
  }

  function despues() {
    if (!after) return;
    after.hidden = false;
    // Solo con pregunta escrita y respuesta que decide: ante un "Es incierto"
    // no hay nada que preferir.
    const preguntar = ultimo?.pregunta && ultimo.tipo !== 'neutra' && readStore(GUT_KEY, 'on') !== 'off';
    if (gut) gut.hidden = !preguntar;
  }

  function responder(alivio) {
    if (!ultimo || ultimo.tipo === 'neutra' || !gutMsg) return;
    btnRelief?.setAttribute('aria-pressed', String(alivio));
    btnDisappoint?.setAttribute('aria-pressed', String(!alivio));
    const dijo = ultimo.tipo === 'si' ? 'sí' : 'no';
    const otro = ultimo.tipo === 'si' ? 'no' : 'sí';
    const em = document.createElement('em');
    gutMsg.replaceChildren();
    if (alivio) {
      em.textContent = dijo;
      gutMsg.append('Entonces ya lo tenías claro: ', em, '.');
    } else {
      em.textContent = otro;
      gutMsg.append('Parece que en el fondo querías un ', em, '. El oráculo te ayudó a descubrirlo; puedes elegirlo sin culpa.');
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
    const q = input?.value.trim();
    if (q) u.searchParams.set('pregunta', q);
    return u.toString();
  }

  btnShare?.addEventListener('click', async () => {
    const url = enlace();
    const q = input?.value.trim();
    const texto = ultimo && q
      ? `Le pregunté al oráculo «${q}» y me dijo: ${ultimo.respuesta}. Pregúntale tú:`
      : 'Pregúntale al oráculo:';
    const original = 'Compartir esta pregunta';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Decídelo.app — oráculo sí o no', text: texto, url });
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

  // --- Consultar --------------------------------------------------------------
  let busy = false;
  let ultimaConsulta = 0;

  async function agitar(r) {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    object.classList.remove('is-revealed');
    object.classList.add('is-asking');

    if (!reducido) {
      // Sacudida amortiguada: cada vaivén más corto que el anterior
      const shake = ball.animate([
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(-7px, 4px) rotate(-4deg)' },
        { transform: 'translate(6px, -4px) rotate(4deg)' },
        { transform: 'translate(-6px, 3px) rotate(-3deg)' },
        { transform: 'translate(5px, -2px) rotate(3deg)' },
        { transform: 'translate(-3px, 2px) rotate(-2deg)' },
        { transform: 'translate(2px, -1px) rotate(1deg)' },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ], { duration: SHAKE_MS, easing: 'ease-in-out' });
      await shake.finished.catch(() => {});
    }

    if (dieText) dieText.textContent = r.texto;
    object.classList.remove('is-asking');
    object.classList.add('is-revealed');

    // El dado sube desde el fondo del líquido; su estado final lo fija la
    // clase .is-revealed, así que la animación no necesita `fill`.
    const emerge = die?.animate(
      reducido
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'scale(0.6) rotate(-14deg)' },
            { opacity: 1, transform: 'scale(1) rotate(0deg)' },
          ],
      { duration: reducido ? REDUCED_MS : EMERGE_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
    await emerge?.finished.catch(() => {});
  }

  async function consultar() {
    if (busy) return;
    busy = true;
    btnAsk.disabled = true;
    btnAsk.setAttribute('aria-busy', 'true');
    // En el móvil, cerrar el teclado para que se vea la bola
    input?.blur();
    limpiarResultado();

    const pregunta = input?.value.trim().slice(0, QUESTION_MAX) ?? '';
    const r = RESPUESTAS[randomIndex(RESPUESTAS.length)];
    await agitar(r);

    mostrar(r);
    ultimo = { pregunta, respuesta: r.texto, tipo: r.tipo };
    guardar({ pregunta, respuesta: r.texto, tipo: r.tipo });
    if (navigator.vibrate) navigator.vibrate(12);
    despues();

    ultimaConsulta = Date.now();
    busy = false;
    btnAsk.disabled = false;
    btnAsk.removeAttribute('aria-busy');
  }

  btnAsk.addEventListener('click', consultar);
  ball.addEventListener('click', consultar);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      consultar();
    }
  });

  // --- Agitar el móvil para consultar ------------------------------------------
  // Solo en pantallas táctiles con sensor: en escritorio el control ni aparece.
  const conSensor = 'DeviceMotionEvent' in window
    && window.matchMedia('(pointer: coarse)').matches;
  const pidePermiso = typeof window.DeviceMotionEvent?.requestPermission === 'function';

  let escuchando = false;
  let previa = null;
  let golpes = [];

  function alMoverse(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const actual = { x: a.x, y: a.y ?? 0, z: a.z ?? 0 };
    if (previa) {
      const delta = Math.abs(actual.x - previa.x) + Math.abs(actual.y - previa.y) + Math.abs(actual.z - previa.z);
      const ahora = Date.now();
      if (delta > SHAKE_DELTA) {
        golpes = golpes.filter((t) => ahora - t < SHAKE_WINDOW_MS);
        golpes.push(ahora);
        if (golpes.length >= SHAKE_HITS && !busy && ahora - ultimaConsulta > SHAKE_COOLDOWN_MS) {
          golpes = [];
          consultar();
        }
      }
    }
    previa = actual;
  }

  function pintarAgitar(activo, mensaje) {
    btnShake?.setAttribute('aria-pressed', String(activo));
    if (btnShake) btnShake.textContent = activo ? 'Agitar para consultar: activado' : 'Agitar el móvil para consultar';
    if (shakeMsg) shakeMsg.textContent = mensaje ?? (activo ? 'Piensa tu pregunta y agita el móvil.' : '');
  }

  function activarAgitar() {
    if (escuchando) return;
    escuchando = true;
    previa = null;
    golpes = [];
    window.addEventListener('devicemotion', alMoverse);
    pintarAgitar(true);
  }

  function desactivarAgitar(mensaje) {
    escuchando = false;
    window.removeEventListener('devicemotion', alMoverse);
    pintarAgitar(false, mensaje);
  }

  if (conSensor && shakeBox && btnShake) {
    shakeBox.hidden = false;
    // Sin permiso que pedir (Android), se recuerda la preferencia. En iOS el
    // permiso no sobrevive a la recarga y solo se puede pedir desde un toque,
    // así que ahí el visitante vuelve a activarlo.
    if (readStore(SHAKE_KEY, 'off') === 'on' && !pidePermiso) activarAgitar();

    btnShake.addEventListener('click', async () => {
      if (escuchando) {
        writeStore(SHAKE_KEY, 'off');
        desactivarAgitar();
        return;
      }
      if (pidePermiso) {
        try {
          const estado = await window.DeviceMotionEvent.requestPermission();
          if (estado !== 'granted') {
            desactivarAgitar('Sin permiso para leer el movimiento. Puedes consultar con el botón.');
            return;
          }
        } catch (e) {
          desactivarAgitar('Este navegador no deja leer el movimiento. Puedes consultar con el botón.');
          return;
        }
      }
      writeStore(SHAKE_KEY, 'on');
      activarAgitar();
    });

    // Con las transiciones de Astro la página se sustituye sin recargar: el
    // listener de window sobreviviría a la página y seguiría consultando.
    document.addEventListener('astro:before-swap', () => desactivarAgitar(), { once: true });
  }

  renderHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiONo);
} else {
  initSiONo();
}
document.addEventListener('astro:page-load', initSiONo);
