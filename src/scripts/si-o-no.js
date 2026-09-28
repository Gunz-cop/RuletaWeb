// ==========================================================
// ORÁCULO SÍ O NO — la bola 8 responde a una pregunta
// ==========================================================
// La apariencia vive en OracleBall.astro y si-o-no.astro. Aquí se elige la
// respuesta, se anima la bola con la Web Animations API y se escribe el
// texto. La bola tiene cuatro movimientos: entra rodando al cargar, flota en
// reposo, gira del 8 a la ventana en la primera consulta, y en cada consulta
// se agita (con burbujas) antes de que el dado emerja. También se puede consultar agitando el móvil (DeviceMotionEvent),
// siempre con un gesto previo del visitante: iOS no deja leer el sensor sin
// pedir permiso desde un toque.

const HISTORY_KEY = 'decidelo_siono_history';
const QUESTION_KEY = 'decidelo_siono_pregunta';
const GUT_KEY = 'decidelo_siono_intuicion';
const SHAKE_KEY = 'decidelo_siono_agitar';
const HISTORY_MAX = 10;
const QUESTION_MAX = 120;

// Tiempos de la consulta: giro (solo la primera vez, solapado con el
// agitado) + agitado + dado que emerge. Unos 1,7 s en total, dentro del
// margen de DESIGN.md: más largo ya es suspense de tragamonedas.
const ENTRY_MS = 1100;
const ROLL_MS = 760;
const SINK_MS = 220;
const SHAKE_MS = 850;
const SHAKE_DELAY_MS = 250;
const EMERGE_MS = 750;
const FLOAT_MS = 2800;
const BOB_MS = 3200;
const REDUCED_MS = 200;
const PLACEHOLDER_MS = 3200;

// Ejemplos que rotan en el campo vacío: enseñan qué tipo de pregunta sirve
const EJEMPLOS = [
  '¿Pido pizza esta noche?',
  '¿Le escribo primero?',
  '¿Salgo hoy?',
  '¿Veo otro capítulo?',
  '¿Voy al gimnasio hoy?',
  '¿Me corto el pelo?',
];

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
  const rig = $('oracle-rig');
  const ball = $('oracle-ball');
  const eight = $('oracle-eight');
  const win = $('oracle-window');
  const floor = $('oracle-floor');
  const bubbles = [...(object?.querySelectorAll('.oracle-bubble') ?? [])];
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
    // La fila nueva entra deslizándose (regla .is-new en si-o-no.astro)
    historyList?.firstElementChild?.classList.add('is-new');
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

  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = (a) => a?.finished.catch(() => {});

  // --- Movimiento en reposo: flota la bola y, con respuesta, el dado --------
  let flotando = [];
  let meciendo = null;

  function flotar() {
    parar();
    if (reducido() || !rig) return;
    const opts = { duration: FLOAT_MS, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' };
    flotando = [
      rig.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }], opts),
      floor?.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.9)', opacity: 0.75 }], opts),
    ].filter(Boolean);
  }

  function parar() {
    flotando.forEach((a) => a.cancel());
    flotando = [];
  }

  function mecer() {
    meciendo?.cancel();
    meciendo = null;
    if (reducido() || !die) return;
    // El dado real nunca queda quieto: flota en el líquido
    meciendo = die.animate([
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(-1.5%) rotate(1.5deg)' },
      { transform: 'translateY(0.5%) rotate(-1deg)' },
      { transform: 'translateY(0) rotate(0deg)' },
    ], { duration: BOB_MS, iterations: Infinity, easing: 'ease-in-out' });
  }

  // --- Entrada: la bola llega rodando y el 8 gira hasta quedar de frente ----
  function entrar() {
    if (reducido()) {
      rig?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS });
      return;
    }
    const d = ball.offsetWidth;
    const rebote = 'cubic-bezier(0.3, 0.75, 0.35, 1.08)';
    rig?.animate([
      { opacity: 0, transform: `translate(${-0.35 * d}px, ${-0.12 * d}px)` },
      { opacity: 1, offset: 0.35 },
      { transform: `translate(${0.02 * d}px, 0)`, offset: 0.8 },
      { opacity: 1, transform: 'none' },
    ], { duration: ENTRY_MS, easing: rebote });
    eight?.animate([
      { transform: `translateX(${-0.4 * d}px) scaleX(0.25)` },
      { transform: `translateX(${0.03 * d}px) scaleX(0.97)`, offset: 0.8 },
      { transform: 'none' },
    ], { duration: ENTRY_MS, easing: rebote });
    const llegada = floor?.animate([
      { opacity: 0, transform: 'scale(0.4)' },
      { opacity: 1, transform: 'none' },
    ], { duration: ENTRY_MS, easing: 'ease-out' });
    fin(llegada).then(() => { if (!busy) flotar(); });
  }

  // --- Consultar: giro, agitado, burbujas y el dado que emerge ---------------
  function girar() {
    // Del 8 a la ventana: el 8 se va hacia el borde derecho y la ventana
    // entra por el izquierdo, comprimidos cerca del borde como en una esfera.
    // La clase .is-open fija el estado final; la animación solo lo recorre.
    const d = ball.offsetWidth * 0.42;
    object.classList.add('is-open');
    if (reducido()) {
      return Promise.all([
        fin(eight?.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'none' }], { duration: REDUCED_MS })),
        fin(win?.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { duration: REDUCED_MS })),
      ]);
    }
    return Promise.all([
      // En la bola real el 8 y la ventana están en caras opuestas: nunca se
      // ven a la vez. El 8 termina de irse antes de que asome la ventana.
      fin(eight?.animate([
        { opacity: 1, transform: 'translateX(0) scaleX(1)', easing: 'cubic-bezier(0.45, 0, 0.9, 0.5)' },
        { opacity: 0, transform: `translateX(${d}px) scaleX(0.15)`, offset: 0.48 },
        { opacity: 0, transform: `translateX(${d}px) scaleX(0.15)` },
      ], { duration: ROLL_MS })),
      fin(win?.animate([
        { opacity: 0, transform: `translateX(${-d}px) scaleX(0.15)` },
        { opacity: 0, transform: `translateX(${-d}px) scaleX(0.15)`, offset: 0.46, easing: 'cubic-bezier(0.1, 0.6, 0.3, 1)' },
        { opacity: 1, transform: 'translateX(0) scaleX(1)' },
      ], { duration: ROLL_MS })),
    ]);
  }

  function hundir() {
    // Una respuesta anterior se hunde en el líquido antes de agitar
    object.classList.add('is-asking');
    if (reducido() || !object.classList.contains('is-revealed')) return Promise.resolve();
    return fin(die?.animate([
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
      { opacity: 0, transform: 'translateY(12%) scale(0.7) rotate(12deg)', filter: 'blur(3px)' },
    ], { duration: SINK_MS, easing: 'ease-in' }));
  }

  function sacudir(retraso) {
    if (reducido()) return Promise.resolve();
    // Sacudida amortiguada: cada vaivén más corto que el anterior
    const s = ball.offsetWidth / 208;
    const t = (x, y, r) => `translate(${x * s}px, ${y * s}px) rotate(${r}deg)`;
    const shake = ball.animate([
      { transform: t(0, 0, 0) },
      { transform: t(-9, 5, -7) },
      { transform: t(8, -6, 6) },
      { transform: t(-8, 4, -5) },
      { transform: t(6, -3, 4) },
      { transform: t(-4, 2, -2.5) },
      { transform: t(2, -1, 1) },
      { transform: t(0, 0, 0) },
    ], { duration: SHAKE_MS, delay: retraso, easing: 'ease-in-out' });
    floor?.animate([
      { transform: 'scale(1)' }, { transform: 'scale(0.86, 0.8)' }, { transform: 'scale(1.04)' },
      { transform: 'scale(0.92)' }, { transform: 'scale(1)' },
    ], { duration: SHAKE_MS, delay: retraso, easing: 'ease-in-out' });
    // Burbujas que suben por el líquido mientras se agita (solo decoración:
    // su azar no decide nada, por eso basta Math.random)
    bubbles.forEach((b) => {
      const deriva = (Math.random() - 0.5) * 30;
      b.animate([
        { opacity: 0, transform: 'translate(0, 0) scale(0.5)' },
        { opacity: 0.9, offset: 0.25 },
        { opacity: 0, transform: `translate(${deriva}%, -${320 + Math.random() * 260}%) scale(1.1)` },
      ], {
        duration: 500 + Math.random() * 400,
        delay: retraso + 120 + Math.random() * 420,
        easing: 'cubic-bezier(0.3, 0, 0.6, 1)',
      });
    });
    return fin(shake);
  }

  function emerger(r) {
    if (dieText) dieText.textContent = r.texto;
    object.classList.remove('is-asking');
    object.classList.add('is-revealed');
    // El dado sube desenfocado desde el fondo, gira un poco de más y se
    // asienta; su estado final lo fija .is-revealed, sin `fill`.
    return fin(die?.animate(
      reducido()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(18%) scale(0.45) rotate(-32deg)', filter: 'blur(5px)' },
            { opacity: 0.85, transform: 'translateY(-3%) scale(1.06) rotate(5deg)', filter: 'blur(0.5px)', offset: 0.65 },
            { opacity: 1, transform: 'translateY(1%) scale(0.98) rotate(-2deg)', filter: 'blur(0)', offset: 0.85 },
            { opacity: 1, transform: 'none', filter: 'blur(0)' },
          ],
      { duration: reducido() ? REDUCED_MS : EMERGE_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
    ));
  }

  async function agitar(r) {
    parar();
    meciendo?.cancel();
    if (!object.classList.contains('is-open')) {
      // Primera consulta: el giro y el agitado se solapan
      object.classList.add('is-asking');
      await Promise.all([girar(), sacudir(SHAKE_DELAY_MS)]);
    } else {
      await hundir();
      await sacudir(0);
    }
    await emerger(r);
    mecer();
    flotar();
  }

  async function consultar() {
    if (busy) return;
    busy = true;
    btnAsk.disabled = true;
    btnAsk.setAttribute('aria-busy', 'true');
    btnAsk.textContent = 'Consultando…';
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
    btnAsk.textContent = 'Consultar de nuevo';
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

  // --- Ejemplos que rotan en el campo vacío ------------------------------------
  let ejemplo = 0;
  const rotar = setInterval(() => {
    if (!input || !input.isConnected) return clearInterval(rotar);
    if (input.value || document.activeElement === input) return;
    ejemplo = (ejemplo + 1) % EJEMPLOS.length;
    input.placeholder = EJEMPLOS[ejemplo];
  }, PLACEHOLDER_MS);

  renderHistory();
  entrar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiONo);
} else {
  initSiONo();
}
document.addEventListener('astro:page-load', initSiONo);
