// ==========================================================
// DADOS — de 1 a 6 dados de seis caras que ruedan sobre una mesa
// ==========================================================
// La apariencia vive en Dice.astro y dados.astro. Aquí se eligen los
// valores, se calcula cada tirada y se reproduce con la Web Animations API.
//
// Por qué la tirada se simula y no se describe con un par de fotogramas:
// un dado que gira en el aire hacia un ángulo final y aterriza se lee como
// cartón. La tirada se simula entera con dados-fisica.js (vuelo, choque con
// la pared del fondo y los lados, botes, rodar hasta pararse), se toma una
// muestra cada 1/60 s y se entrega a element.animate() como fotogramas
// clave, con la luz de cada cara calculada en cada muestra. Sigue siendo la
// Web Animations API, con su .finished, sin librerías.
//
// El resultado se decide ANTES de animar (crypto.getRandomValues); la física
// decide cómo cae el dado y renumerar() pone el valor elegido en la cara de
// arriba (ver dados-fisica.js).

import { NORMAL, Q, rot, dot, norm, simular, desdeLaMano, renumerar, MUESTRAS_POR_S } from './dados-fisica.js';

const COUNT_KEY = 'decidelo_dados_count';
const HISTORY_KEY = 'decidelo_dados_history';
const SHAKE_KEY = 'decidelo_dados_agitar';
const HISTORY_MAX = 10;
const MAX_DADOS = 6;

// Tiempos (ms). La tirada dura lo que tarda la física en parar los dados
// (entre 1,2 y 2,2 s, ver scripts/dados-check.mjs) más la anticipación.
const RECOGER_MS = 220;
// La física se reproduce a cámara lenta: a velocidad real (1,2–2,1 s) la
// tirada se veía demasiado rápida para seguirla con la vista
const LENTO = 1.5;
const REPOSO_MS = 3000;
const REDUCED_MS = 200;

// Detección de sacudida, igual que el oráculo (si-o-no.js): varias lecturas
// fuertes seguidas, para que un golpe suelto no lance solo.
const SHAKE_DELTA = 15;
const SHAKE_HITS = 3;
const SHAKE_WINDOW_MS = 500;
const SHAKE_COOLDOWN_MS = 1000;

// --- Geometría ---------------------------------------------------------------
// Ejes de la mesa: x a la derecha, y hacia quien mira, z hacia arriba.
// NORMAL (en dados-fisica.js): hacia dónde apunta cada cara sin girar.
// ARRIBA: giros en X e Y (grados) que dejan cada cara mirando hacia arriba;
// solo para colocar los dados sin tirada (movimiento reducido).
const ARRIBA = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const RAD = Math.PI / 180;
const INCLINACION = 50; // la de .dice-floor en Dice.astro

// Huecos en la mesa, en lados de dado, para cada cantidad: dónde se colocan
// los dados cuando no hay tirada animada (movimiento reducido). Con
// animación, dónde se paran lo decide la física.
const HUECOS = {
  1: [[0, 0]],
  2: [[-0.95, 0.1], [0.95, -0.1]],
  3: [[-1.55, 0.25], [0, -0.35], [1.55, 0.2]],
  4: [[-0.95, -0.85], [0.95, -0.9], [-0.9, 0.9], [1, 0.85]],
  5: [[-1.75, -0.85], [0, -1], [1.75, -0.85], [-0.9, 0.9], [0.9, 0.95]],
  6: [[-1.75, -0.9], [0, -0.95], [1.75, -0.9], [-1.75, 0.9], [0, 0.95], [1.75, 0.9]],
};

// Luz desde arriba, a la izquierda y al fondo. Las caras que miran hacia
// quien juega quedan en sombra: así cada arista separa dos tonos distintos.
const LUZ = norm([-0.45, -0.55, 0.85]);

const qArriba = (valor, giro) => Q.mul(
  Q.eje(0, 0, 1, giro),
  Q.mul(Q.eje(1, 0, 0, ARRIBA[valor][0] * RAD), Q.eje(0, 1, 0, ARRIBA[valor][1] * RAD)),
);

// --- Azar ---------------------------------------------------------------------
// Valores: crypto con rechazo del sobrante, para que las seis caras pesen
// exactamente igual. Lo puramente estético (giros, huecos, alturas) usa
// Math.random: no decide nada.
function azar(n) {
  if (window.crypto?.getRandomValues) {
    const limite = Math.floor(4294967296 / n) * n;
    const v = new Uint32Array(1);
    do window.crypto.getRandomValues(v); while (v[0] >= limite);
    return (v[0] % n) + 1;
  }
  return Math.floor(Math.random() * n) + 1;
}
const entre = (a, b) => a + Math.random() * (b - a);

// --- Almacenamiento -------------------------------------------------------------
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

// Historial: [{ sum, details: [..] }], el más antiguo primero. Es el mismo
// formato que guardaba la versión anterior, que además tenía el D20: sus
// tiradas viejas se conservan aunque pasen de 6.
function leerHistorial() {
  const raw = readStore(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && Array.isArray(h.details) && h.details.length
      && h.details.every((v) => Number.isInteger(v) && v >= 1 && v <= 20))
    .map((h) => ({ sum: h.details.reduce((a, b) => a + b, 0), details: h.details }))
    .slice(-HISTORY_MAX);
}

// La versión anterior guardaba la cantidad como texto ("2") y llegaba a 3
function leerCantidad() {
  const n = parseInt(readStore(COUNT_KEY, 2), 10);
  return n >= 1 && n <= MAX_DADOS ? n : 2;
}

function initDados() {
  const $ = (id) => document.getElementById(id);
  const stage = $('dice-stage');
  const floor = $('dice-floor');
  const btnRoll = $('btn-roll');
  const result = $('dice-result');
  const resultMain = $('dice-result-main');
  const resultSide = $('dice-result-side');
  const countBtns = [...document.querySelectorAll('[data-dice-count]')];
  const shakeBox = $('dice-shake');
  const btnShake = $('btn-shake');
  const shakeMsg = $('shake-msg');
  const historyList = $('history-list');
  const historyCount = $('history-count');
  const btnClear = $('btn-clear');

  if (!stage || !floor || !btnRoll || !result || btnRoll.dataset.ready) return;
  btnRoll.dataset.ready = 'true';

  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = (a) => a?.finished.catch(() => {});

  const dados = [...floor.querySelectorAll('[data-die]')].map((el) => ({
    el,
    sombra: floor.querySelector(`[data-shadow="${el.dataset.die}"]`),
    caras: [...el.querySelectorAll('.dice-face')].map((f) => ({
      n: NORMAL[f.dataset.face],
      shade: f.querySelector('.dice-shade'),
    })),
    valor: azar(6),
    p: [0, 0],
    q: Q.ID,
  }));

  let cuantos = leerCantidad();
  let tirada = 0; // cada tirada nueva invalida la anterior
  let ocupado = false;
  let ultimaTirada = 0;
  let reposo = null;

  // Distancia de la pared del fondo al centro de la mesa (--wall en Dice.astro)
  const pared = () => parseFloat(getComputedStyle(floor).getPropertyValue('--wall')) || 104;

  // La mesa en la que se simula la tirada: la pared del fondo, una línea
  // delante (para que los dados no tapen el resultado) y los bordes de la
  // bandeja a los lados
  function caja(s) {
    const mitad = Math.min(stage.offsetWidth / 2, 320) - s * 0.6;
    return { izquierda: -mitad, derecha: mitad, fondo: -pared(), frente: s * 0.9 + 20 };
  }

  // La pared izquierda se dibuja donde la física la pone (depende del ancho
  // de la bandeja y del tamaño de los dados)
  function marcarParedes(mesa) {
    floor.style.setProperty('--izquierda', `${mesa.izquierda}px`);
    floor.style.setProperty('--frente', `${mesa.frente}px`);
  }

  // --- Una pose de un dado: transform del cubo, luz y sombra -----------------
  // x: centro del dado en la mesa [x, y, z]; q: orientación; k: escala
  // (1 normal, 0 desaparecido: así se van los dados antes de cada tirada)
  function pose(d, x, q, k = 1) {
    const s = d.el.offsetWidth;
    const h = s / 2;
    const R = Q.mat(q);
    const [px, y, z] = x;
    const p = [px, y];
    const cubo = `matrix3d(${R[0][0] * k},${R[1][0] * k},${R[2][0] * k},0,${R[0][1] * k},${R[1][1] * k},${R[2][1] * k},0,`
      + `${R[0][2] * k},${R[1][2] * k},${R[2][2] * k},0,${p[0]},${y},${z},1)`;
    const luz = d.caras.map((c) => {
      const n = rot(R, c.n);
      return { shade: (1 - (0.4 + 0.6 * Math.max(0, dot(n, LUZ)))) * 0.8 };
    });
    // La sombra se aleja (hacia el lado contrario a la luz), crece y se
    // desvanece cuanto más alto va el dado
    const alto = z - h;
    const off = s * 0.06 + alto * 0.45;
    const sombra = {
      transform: `translate3d(${p[0] + off}px, ${y + off * 0.8}px, 0.5px) `
        + `rotateZ(${Math.atan2(R[1][0], R[0][0])}rad) scale(${1 + alto / (s * 2.5)})`,
      opacity: Math.max(0, 0.9 * (1 - alto / (s * 2.4))) * k,
    };
    return { cubo, luz, sombra };
  }

  // Pose apoyada en la mesa (o a `aire` píxeles de ella): el vértice más bajo
  // toca el suelo, así un dado de canto no lo atraviesa
  function instante(d, p, q, aire) {
    const R = Q.mat(q);
    const l1 = Math.abs(R[2][0]) + Math.abs(R[2][1]) + Math.abs(R[2][2]);
    return pose(d, [p[0], p[1], (d.el.offsetWidth / 2) * l1 + aire], q);
  }

  function pintar(d) {
    aplicar(d, instante(d, d.p, d.q, 0));
  }

  // Escribe una pose en los estilos del dado (sin animación)
  function aplicar(d, e) {
    d.el.style.transform = e.cubo;
    e.luz.forEach((l, i) => { d.caras[i].shade.style.opacity = l.shade; });
    d.sombra.style.transform = e.sombra.transform;
    d.sombra.style.opacity = e.sombra.opacity;
  }

  const animados = (d) => [d.el, d.sombra, ...d.caras.map((c) => c.shade)];

  // Reproduce una lista de instantes: una animación para el cubo, otra para
  // la sombra y una por capa de luz, todas con el mismo reloj
  function reproducir(d, muestras, duracion, delay = 0) {
    const opts = { duration: duracion, delay, easing: 'linear', fill: 'both' };
    const anims = [
      d.el.animate(muestras.map((m) => ({ transform: m.cubo })), opts),
      d.sombra.animate(muestras.map((m) => m.sombra), opts),
    ];
    d.caras.forEach((c, i) => {
      anims.push(c.shade.animate(muestras.map((m) => ({ opacity: m.luz[i].shade })), opts));
    });
    // Al terminar, la última pose se escribe a mano antes de cancelar. No se
    // usa commitStyles(): si falla (Safari con algunos matrix3d), cancelar
    // devuelve el dado un instante a su pose anterior y se ve un dado
    // fantasma en la mesa mientras los demás aún no han entrado.
    return Promise.all(anims.map(fin)).then(() => {
      aplicar(d, muestras[muestras.length - 1]);
      anims.forEach((a) => a.cancel());
    });
  }

  // Interrumpible: lo que esté en marcha salta a su final y se parte de ahí
  function terminar(lista) {
    lista.forEach((d) => animados(d).forEach((e) => e.getAnimations().forEach((a) => a.finish())));
  }

  // --- La tirada -----------------------------------------------------------------
  // Simula a la vez todos los dados (se empujan entre ellos), pone en cada uno
  // el valor elegido con renumerar() y reproduce las muestras. Todos tienen
  // el mismo número de muestras: la tirada acaba cuando el último se para.
  function tirar(activos, valores) {
    const s = activos[0].el.offsetWidth;
    const mesa = caja(s);
    marcarParedes(mesa);
    const sims = simular(desdeLaMano(activos.length, mesa, s), mesa, s);
    return Promise.all(activos.map((d, i) => {
      const lista = sims[i];
      const ultima = lista[lista.length - 1];
      const P = renumerar(ultima.q, valores[i]);
      d.valor = valores[i];
      d.p = [ultima.x[0], ultima.x[1]];
      d.q = Q.mul(ultima.q, P);
      const muestras = lista.map((m) => pose(d, m.x, Q.mul(m.q, P)));
      return reproducir(d, muestras, ((lista.length - 1) / MUESTRAS_POR_S) * 1000 * LENTO);
    }));
  }

  function hueco(i, s) {
    const [x, y] = HUECOS[cuantos][i];
    return [(x + entre(-0.12, 0.12)) * s, (y + entre(-0.12, 0.12)) * s];
  }

  function barajar(lista) {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = azar(i + 1) - 1;
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }

  // --- Fases del ciclo de movimiento ----------------------------------------
  // Reposo: la cámara respira (menos de 2 px en los bordes). Los dados no
  // flotan: un dado quieto sobre la mesa no se mueve.
  function reposar() {
    if (reducido() || reposo) return;
    reposo = floor.animate(
      [
        { transform: `rotateX(${INCLINACION}deg) rotateZ(-0.5deg)` },
        { transform: `rotateX(${INCLINACION + 0.8}deg) rotateZ(0.5deg)` },
      ],
      { duration: REPOSO_MS, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );
  }

  function pararReposo() {
    reposo?.cancel();
    reposo = null;
  }

  // Entrada: los dados se lanzan solos al cargar, igual que en una tirada
  function entrar(lista) {
    if (reducido()) {
      return Promise.all(lista.map(({ d, i }) => {
        d.p = hueco(i, d.el.offsetWidth);
        d.q = qArriba(d.valor, entre(-0.6, 0.6));
        pintar(d);
        return fin(d.el.animate([{ opacity: 0 }, { opacity: 1 }], REDUCED_MS));
      }));
    }
    const activos = lista.map(({ d }) => d);
    return tirar(activos, activos.map((d) => d.valor));
  }

  // Anticipación: los dados de la mesa se encogen en su sitio y desaparecen;
  // después entran lanzados desde la derecha
  function recoger(d, i) {
    const R = Q.mat(d.q);
    const z = (d.el.offsetWidth / 2) * (Math.abs(R[2][0]) + Math.abs(R[2][1]) + Math.abs(R[2][2]));
    const muestras = Array.from({ length: 9 }, (_, k) => {
      const e = 1 - Math.pow(1 - k / 8, 2);
      return pose(d, [d.p[0], d.p[1], z * (1 - e)], d.q, 1 - e);
    });
    return reproducir(d, muestras, RECOGER_MS, i * 25);
  }

  // --- Resultado e historial -------------------------------------------------
  // El desglose sigue el orden en que se ven los dados: por filas, de
  // izquierda a derecha. Si no, «5 + 2» con el 2 a la izquierda confunde.
  function ordenVisual(lista) {
    const s = lista[0].el.offsetWidth;
    return [...lista]
      .sort((a, b) => (Math.abs(a.p[1] - b.p[1]) > s * 0.8 ? a.p[1] - b.p[1] : a.p[0] - b.p[0]))
      .map((d) => d.valor);
  }

  function limpiarResultado() {
    result.classList.remove('is-shown');
    result.removeAttribute('data-suma');
  }

  function mostrar(valores) {
    const suma = valores.reduce((a, b) => a + b, 0);
    resultMain.textContent = String(suma);
    resultSide.textContent = valores.length === 1 ? 'Un dado' : valores.join(' + ');
    // data-suma: el test de estado comprueba que coincide con las caras
    result.dataset.suma = String(suma);
    result.classList.add('is-shown');
  }

  let history = leerHistorial();
  writeStore(HISTORY_KEY, history.length ? history : null);

  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Sin tiradas aún';
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
        label.textContent = h.details.length === 1 ? 'Un dado' : h.details.join(' + ');
        const side = document.createElement('span');
        side.className = 'history-side';
        side.textContent = `Suma ${h.sum}`;
        row.append(n, label, side);
        historyList.appendChild(row);
      });
    }
    if (historyCount) {
      historyCount.textContent = history.length === 1 ? '1 tirada' : history.length ? `${history.length} tiradas` : '';
    }
  }

  function guardar(valores) {
    history.push({ sum: valores.reduce((a, b) => a + b, 0), details: valores });
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    writeStore(HISTORY_KEY, history);
    renderHistory();
    // La fila nueva entra deslizándose (regla .is-new en dados.astro)
    historyList?.firstElementChild?.classList.add('is-new');
  }

  btnClear?.addEventListener('click', () => {
    history = [];
    writeStore(HISTORY_KEY, null);
    renderHistory();
  });

  // --- Lanzar -------------------------------------------------------------------
  async function lanzar() {
    const mia = ++tirada;
    ocupado = true;
    ultimaTirada = Date.now();
    const activos = dados.slice(0, cuantos);
    terminar(activos);
    pararReposo();
    limpiarResultado();

    const valores = activos.map(() => azar(6));
    const orden = barajar([...Array(cuantos).keys()]);

    if (reducido()) {
      activos.forEach((d, i) => {
        d.valor = valores[i];
        d.p = hueco(orden[i], d.el.offsetWidth);
        d.q = qArriba(d.valor, entre(-0.6, 0.6));
        pintar(d);
      });
      await fin(stage.animate([{ opacity: 0 }, { opacity: 1 }], REDUCED_MS));
    } else {
      await Promise.all(activos.map(recoger));
      if (mia !== tirada) return;
      await tirar(activos, valores);
    }
    if (mia !== tirada) return;

    activos.forEach(pintar);
    const enOrden = ordenVisual(activos);
    mostrar(enOrden);
    guardar(enOrden);
    ocupado = false;
    reposar();
    navigator.vibrate?.(12);
  }

  btnRoll.addEventListener('click', lanzar);

  // --- Cuántos dados ------------------------------------------------------------
  function aplicarCuantos() {
    countBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.diceCount) === cuantos)));
    stage.dataset.count = String(cuantos);
    dados.forEach((d, i) => {
      d.el.hidden = i >= cuantos;
      d.sombra.hidden = i >= cuantos;
    });
    btnRoll.textContent = cuantos === 1 ? 'Lanzar dado' : 'Lanzar dados';
    marcarParedes(caja(dados[0].el.offsetWidth));
  }

  countBtns.forEach((b) => b.addEventListener('click', () => {
    const antes = cuantos;
    const nuevo = Number(b.dataset.diceCount);
    if (nuevo === antes || !HUECOS[nuevo]) return;
    tirada++; // una tirada en marcha ya no escribe su resultado
    ocupado = false;
    terminar(dados);
    cuantos = nuevo;
    writeStore(COUNT_KEY, cuantos);
    limpiarResultado();
    aplicarCuantos();
    // Cambian de tamaño con la cantidad y la física necesita a todos en la
    // mesa a la vez: se vuelven a lanzar todos, conservando sus valores
    entrar(dados.slice(0, cuantos).map((d, i) => ({ d, i })));
  }));

  // --- Agitar el móvil para lanzar -------------------------------------------
  // Mismo patrón que el oráculo: solo en pantallas táctiles con sensor, y
  // siempre activado con un toque (iOS solo da el permiso desde un gesto).
  const conSensor = 'DeviceMotionEvent' in window && window.matchMedia('(pointer: coarse)').matches;
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
        if (golpes.length >= SHAKE_HITS && !ocupado && ahora - ultimaTirada > SHAKE_COOLDOWN_MS) {
          golpes = [];
          lanzar();
        }
      }
    }
    previa = actual;
  }

  function pintarAgitar(activo, mensaje) {
    btnShake?.setAttribute('aria-pressed', String(activo));
    if (btnShake) btnShake.textContent = activo ? 'Agitar para lanzar: activado' : 'Agitar el móvil para lanzar';
    if (shakeMsg) shakeMsg.textContent = mensaje ?? (activo ? 'Agita el móvil como si fuera un cubilete.' : '');
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
    // En Android no hay permiso que pedir y se recuerda la preferencia; en
    // iOS el permiso no sobrevive a la recarga y hay que volver a tocar.
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
            desactivarAgitar('Sin permiso para leer el movimiento. Puedes lanzar con el botón.');
            return;
          }
        } catch (e) {
          desactivarAgitar('Este navegador no deja leer el movimiento. Puedes lanzar con el botón.');
          return;
        }
      }
      writeStore(SHAKE_KEY, 'on');
      activarAgitar();
    });

    // Con las transiciones de Astro la página se sustituye sin recargar: el
    // listener de window sobreviviría y seguiría lanzando dados invisibles
    document.addEventListener('astro:before-swap', () => desactivarAgitar(), { once: true });
  }

  // --- Arranque -------------------------------------------------------------
  aplicarCuantos();
  renderHistory();
  entrar(dados.slice(0, cuantos).map((d, i) => ({ d, i }))).then(() => {
    if (tirada === 0) reposar();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDados);
} else {
  initDados();
}
document.addEventListener('astro:page-load', initDados);
