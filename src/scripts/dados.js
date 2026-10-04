// ==========================================================
// DADOS — de 1 a 6 dados de seis caras que ruedan sobre una mesa
// ==========================================================
// La apariencia vive en Dice.astro y dados.astro. Aquí se eligen los
// valores, se calcula cada tirada y se reproduce con la Web Animations API.
//
// Por qué la tirada se calcula y no se describe con un par de fotogramas:
// un dado que gira en el aire hacia un ángulo final y aterriza se lee como
// cartón. Para que parezca un dado, tiene que rebotar, volcar de arista en
// arista mientras rueda y recibir la luz según hacia dónde apunta cada cara.
// Eso se calcula en JS (unas 100 muestras por dado) y se entrega a
// element.animate() como fotogramas clave: sigue siendo la Web Animations
// API, con su .finished, sin librerías y sin requestAnimationFrame.
//
// El resultado se decide ANTES de animar (crypto.getRandomValues) y la
// animación termina exactamente en esa cara: la física solo lo enseña.

const COUNT_KEY = 'decidelo_dados_count';
const HISTORY_KEY = 'decidelo_dados_history';
const SHAKE_KEY = 'decidelo_dados_agitar';
const HISTORY_MAX = 10;
const MAX_DADOS = 6;

// Tiempos (ms). La tirada entera ronda 2 s con la anticipación: en el
// borde alto del margen de DESIGN.md, porque ahora el dado cruza la mesa,
// choca con la pared del fondo y vuelve.
const RECOGER_MS = 230;
const TIRADA_MS = [1550, 1800];
const ENTRADA_MS = [1550, 1800];
const DESLIZAR_MS = 380;
const REPOSO_MS = 3000;
const REDUCED_MS = 200;
const MUESTRAS = 96;

// Detección de sacudida, igual que el oráculo (si-o-no.js): varias lecturas
// fuertes seguidas, para que un golpe suelto no lance solo.
const SHAKE_DELTA = 15;
const SHAKE_HITS = 3;
const SHAKE_WINDOW_MS = 500;
const SHAKE_COOLDOWN_MS = 1000;

// --- Geometría ---------------------------------------------------------------
// Ejes de la mesa: x a la derecha, y hacia quien mira, z hacia arriba.
// NORMAL: hacia dónde apunta cada cara con el dado sin girar (Dice.astro).
// ARRIBA: giros en X e Y (grados) que dejan cada cara mirando hacia arriba.
const NORMAL = { 1: [0, 0, 1], 2: [1, 0, 0], 3: [0, -1, 0], 4: [0, 1, 0], 5: [-1, 0, 0], 6: [0, 0, -1] };
const ARRIBA = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const RAD = Math.PI / 180;
const INCLINACION = 50; // la de .dice-floor en Dice.astro

// Huecos en la mesa, en lados de dado, para cada cantidad. Se barajan en
// cada tirada para que cada dado caiga en un sitio distinto.
const HUECOS = {
  1: [[0, 0]],
  2: [[-0.95, 0.1], [0.95, -0.1]],
  3: [[-1.55, 0.25], [0, -0.35], [1.55, 0.2]],
  4: [[-0.95, -0.85], [0.95, -0.9], [-0.9, 0.9], [1, 0.85]],
  5: [[-1.75, -0.85], [0, -1], [1.75, -0.85], [-0.9, 0.9], [0.9, 0.95]],
  6: [[-1.75, -0.9], [0, -0.95], [1.75, -0.9], [-1.75, 0.9], [0, 0.95], [1.75, 0.9]],
};

// --- Cuaterniones: lo justo para girar un cubo sin bloqueo de ejes ----------
const Q = {
  ID: [1, 0, 0, 0],
  eje(x, y, z, a) {
    const l = Math.hypot(x, y, z) || 1;
    const s = Math.sin(a / 2);
    return [Math.cos(a / 2), (x / l) * s, (y / l) * s, (z / l) * s];
  },
  mul([aw, ax, ay, az], [bw, bx, by, bz]) {
    return [
      aw * bw - ax * bx - ay * by - az * bz,
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
    ];
  },
  inv([w, x, y, z]) {
    return [w, -x, -y, -z];
  },
  slerp(a, b, t) {
    let [bw, bx, by, bz] = b;
    let d = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
    if (d < 0) { d = -d; bw = -bw; bx = -bx; by = -by; bz = -bz; }
    let wa = 1 - t;
    let wb = t;
    if (d < 0.9995) {
      const th = Math.acos(d);
      const s = Math.sin(th);
      wa = Math.sin((1 - t) * th) / s;
      wb = Math.sin(t * th) / s;
    }
    const r = [a[0] * wa + bw * wb, a[1] * wa + bx * wb, a[2] * wa + by * wb, a[3] * wa + bz * wb];
    const l = Math.hypot(...r);
    return r.map((v) => v / l);
  },
  // Misma matriz que rotate3d() de CSS, por filas
  mat([w, x, y, z]) {
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  },
};

const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rot = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];

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

  // --- Un instante de un dado: transform del cubo, luz y sombra ---------------
  function instante(d, p, q, aire) {
    const s = d.el.offsetWidth;
    const h = s / 2;
    const R = Q.mat(q);
    // Apoyo: el vértice más bajo toca la mesa. De canto, el centro sube;
    // así al volcar sobre una arista el dado no atraviesa el suelo.
    const l1 = Math.abs(R[2][0]) + Math.abs(R[2][1]) + Math.abs(R[2][2]);
    const z = h * l1 + aire;
    // Y lo mismo contra la pared del fondo: el vértice más lejano la toca
    const fondo = -pared() + h * (Math.abs(R[1][0]) + Math.abs(R[1][1]) + Math.abs(R[1][2]));
    const y = Math.max(p[1], fondo);
    const cubo = `matrix3d(${R[0][0]},${R[1][0]},${R[2][0]},0,${R[0][1]},${R[1][1]},${R[2][1]},0,`
      + `${R[0][2]},${R[1][2]},${R[2][2]},0,${p[0]},${y},${z},1)`;
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
      opacity: Math.max(0, 0.9 * (1 - alto / (s * 2.4))),
    };
    return { cubo, luz, sombra };
  }

  function pintar(d) {
    const e = instante(d, d.p, d.q, 0);
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
    return Promise.all(anims.map(fin)).then(() => {
      anims.forEach((a) => {
        try { a.commitStyles(); } catch (e) { /* dado oculto a mitad de la animación */ }
        a.cancel();
      });
    });
  }

  // Interrumpible: lo que esté en marcha salta a su final y se parte de ahí
  function terminar(lista) {
    lista.forEach((d) => animados(d).forEach((e) => e.getAnimations().forEach((a) => a.finish())));
  }

  // --- La tirada: cruza la mesa, choca con la pared del fondo y vuelve ------
  // Como en una mesa de dados: se lanzan desde quien mira, botan una vez,
  // pegan en la pared del fondo, rebotan hacia el centro y ruedan hasta
  // asentarse. desde: { p, q, aire } · hasta: { p, q }. Devuelve las muestras.
  function trayectoria(d, desde, hasta) {
    const s = d.el.offsetWidth;
    const h = s / 2;
    // Punto de choque con la pared: entre la salida y el destino, un poco
    // desviado, para que cada dado pegue en un sitio distinto
    const choque = [
      desde.p[0] + (hasta.p[0] - desde.p[0]) * entre(0.55, 0.85) + s * entre(-0.35, 0.35),
      -pared() + h,
    ];
    const ida = [choque[0] - desde.p[0], choque[1] - desde.p[1]];
    const vuelta = [hasta.p[0] - choque[0], hasta.p[1] - choque[1]];
    const largoIda = Math.hypot(...ida) || 1;
    const largoVuelta = Math.hypot(...vuelta) || 1;
    // Rodar sin deslizar: gira alrededor del eje horizontal perpendicular a
    // la marcha, tanto como avanza. A la ida va casi todo en el aire, así
    // que rueda menos; a la vuelta, sobre la mesa.
    const ejeIda = [-ida[1] / largoIda, ida[0] / largoIda, 0];
    const ejeVuelta = [-vuelta[1] / largoVuelta, vuelta[0] / largoVuelta, 0];
    const rodarIda = (largoIda / (h * 1.25)) * 0.6;
    const rodarVuelta = largoVuelta / (h * 1.25);
    // Y en el aire, además, da vueltas sobre un eje cualquiera
    const ejeGiro = norm([entre(-1, 1), entre(-1, 1), entre(-0.6, 0.6)]);
    const giroTotal = entre(2.2, 3.4) * Math.PI;

    // Fracciones del tiempo: primer bote en la mesa, choque con la pared,
    // rebote de vuelta y último botecito; después solo rueda
    const [uBote, uPared, uRebote, uQuieto] = [0.22, 0.4, 0.56, 0.68];
    const arco = s * entre(0.5, 0.7);
    const bote = s * entre(0.4, 0.55);
    const rebote = s * entre(0.35, 0.5);
    const botecito = s * entre(0.08, 0.14);

    // La orientación es «lo que queda por girar» · «lo que queda por rodar
    // a la ida» · «… a la vuelta» · la final. Al principio eso no coincide
    // con la orientación de la que parte el dado; una corrección que se
    // desvanece en el primer tercio une las dos sin salto (con el dado
    // girando rápido no se nota).
    const A0 = Q.mul(Q.mul(Q.eje(...ejeGiro, -giroTotal), Q.eje(...ejeIda, -rodarIda)), Q.eje(...ejeVuelta, -rodarVuelta));
    const correccion = Q.mul(Q.mul(Q.inv(A0), desde.q), Q.inv(hasta.q));
    const parabola = (x, alto) => 4 * alto * x * (1 - x);

    const muestras = [];
    for (let k = 0; k <= MUESTRAS; k++) {
      const u = k / MUESTRAS;
      let p;
      let restaIda = 0;
      let restaVuelta = rodarVuelta;
      if (u < uPared) {
        // A la ida apenas frena: pega en la pared con fuerza
        const e = 1 - Math.pow(1 - u / uPared, 1.25);
        p = [desde.p[0] + ida[0] * e, desde.p[1] + ida[1] * e];
        restaIda = rodarIda * (1 - e);
      } else {
        // A la vuelta frena cada vez más hasta pararse
        const e = 1 - Math.pow(1 - (u - uPared) / (1 - uPared), 2.6);
        p = [choque[0] + vuelta[0] * e, choque[1] + vuelta[1] * e];
        restaVuelta = rodarVuelta * (1 - e);
      }
      let aire = 0;
      if (u < uBote) aire = desde.aire * (1 - u / uBote) + parabola(u / uBote, arco);
      else if (u < uPared) aire = parabola((u - uBote) / (uPared - uBote), bote);
      else if (u < uRebote) aire = parabola((u - uPared) / (uRebote - uPared), rebote);
      else if (u < uQuieto) aire = parabola((u - uRebote) / (uQuieto - uRebote), botecito);
      const giroResta = giroTotal * Math.pow(1 - Math.min(1, u / uQuieto), 1.6);
      const c = Math.min(1, u / 0.3);
      const q = Q.mul(
        Q.mul(Q.mul(Q.eje(...ejeGiro, -giroResta), Q.eje(...ejeIda, -restaIda)), Q.eje(...ejeVuelta, -restaVuelta)),
        Q.mul(Q.slerp(correccion, Q.ID, c * c * (3 - 2 * c)), hasta.q),
      );
      muestras.push(instante(d, p, q, aire));
    }
    return muestras;
  }

  // Desde dónde se lanzan: la mano de quien juega, delante de la mesa (por
  // debajo de la bandeja en pantalla) y un poco en alto. Los dados salen
  // juntos, como de una misma mano.
  function mano(i, s, centro) {
    return {
      p: [centro + (i - (cuantos - 1) / 2) * s * 0.55 + s * entre(-0.15, 0.15), s * 3.2 + 70 + s * entre(-0.2, 0.2)],
      aire: s * 1.1,
    };
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
    const centro = entre(-0.5, 0.5) * 40;
    return Promise.all(lista.map(({ d, i }, k) => {
      const s = d.el.offsetWidth;
      d.p = hueco(i, s);
      d.q = qArriba(d.valor, entre(-0.6, 0.6));
      if (reducido()) {
        pintar(d);
        return fin(d.el.animate([{ opacity: 0 }, { opacity: 1 }], REDUCED_MS));
      }
      const desde = { ...mano(i, s, centro), q: Q.eje(entre(-1, 1), entre(-1, 1), entre(-1, 1), entre(0, 6)) };
      return reproducir(d, trayectoria(d, desde, { p: d.p, q: d.q }), entre(...ENTRADA_MS), k * 60);
    }));
  }

  // Anticipación: se recogen de la mesa hacia la mano, cada vez más rápido
  // (como cuando alguien los barre y los junta antes de tirar)
  function recoger(d, i, centro) {
    const s = d.el.offsetWidth;
    const destino = mano(i, s, centro);
    const qa = Q.mul(Q.eje(entre(-1, 1), entre(-1, 1), entre(-1, 1), entre(1, 2.5)), d.q);
    const muestras = Array.from({ length: 13 }, (_, k) => {
      const e = Math.pow(k / 12, 2);
      return instante(
        d,
        [d.p[0] + (destino.p[0] - d.p[0]) * e, d.p[1] + (destino.p[1] - d.p[1]) * e],
        Q.slerp(d.q, qa, e),
        destino.aire * e,
      );
    });
    return reproducir(d, muestras, RECOGER_MS, i * 20).then(() => ({ ...destino, q: qa }));
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
      const centro = entre(-0.5, 0.5) * 40;
      const recogidos = await Promise.all(activos.map((d, i) => recoger(d, i, centro)));
      if (mia !== tirada) return;
      await Promise.all(activos.map((d, i) => {
        d.valor = valores[i];
        d.p = hueco(orden[i], d.el.offsetWidth);
        d.q = qArriba(d.valor, entre(-0.7, 0.7));
        return reproducir(d, trayectoria(d, recogidos[i], { p: d.p, q: d.q }), entre(...TIRADA_MS), i * 35);
      }));
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
    // Los que ya estaban se deslizan a su hueco nuevo (cambian de tamaño con
    // la cantidad); los nuevos entran rodando
    dados.slice(0, Math.min(antes, cuantos)).forEach((d, i) => {
      const desde = instante(d, d.p, d.q, 0);
      d.p = hueco(i, d.el.offsetWidth);
      if (reducido()) pintar(d);
      else reproducir(d, [desde, instante(d, d.p, d.q, 0)], DESLIZAR_MS);
    });
    if (cuantos > antes) entrar(dados.slice(antes, cuantos).map((d, k) => ({ d, i: antes + k })));
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
