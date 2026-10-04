// ==========================================================
// DADOS — de 1 a 6 dados (D4 a D20) que ruedan sobre una mesa, y tiradas de rol
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
// arriba (ver dados-fisica.js). Con los dados de rol, lo mismo con
// renumerarForma() (dados-poliedros.js).
//
// Cada dado de la mesa puede ser de cualquier tipo: su marcado se clona de
// la plantilla del tipo que toca (Dice.astro). Así una tirada de rol puede
// mezclar tipos (1d20+1d6). Con el D6 todo hace exactamente lo de siempre.

import { NORMAL, Q, rot, dot, norm, simular, desdeLaMano, renumerar, MUESTRAS_POR_S } from './dados-fisica.js';
import { forma, renumerarForma, aplanarForma, alturaApoyo } from './dados-poliedros.js';
import { parsear, resolver, ventaja, sinElMenor, LADOS_VALIDOS } from './dados-notacion.js';

const COUNT_KEY = 'decidelo_dados_count';
const TIPO_KEY = 'decidelo_dados_tipo';
const HISTORY_KEY = 'decidelo_dados_history';
const SHAKE_KEY = 'decidelo_dados_agitar';
const TIRADA_KEY = 'decidelo_dados_tirada';
const GUARDADAS_KEY = 'decidelo_dados_guardadas';
const HISTORY_MAX = 10;
const GUARDADAS_MAX = 20;
const MAX_DADOS = 6;

// Tiempos (ms). La tirada dura lo que tarda la física en parar los dados
// (entre 1,2 y 2,2 s, ver scripts/dados-check.mjs) más la anticipación.
const RECOGER_MS = 220;
// La física se reproduce a cámara lenta: a velocidad real (1,2–2,1 s) la
// tirada se veía demasiado rápida para seguirla con la vista
const LENTO = 1.5;
// Crear personaje son seis tiradas seguidas: a velocidad real, con una
// pausa para ver qué dado se descartó, tarda unos 10 s; a cámara lenta, 15
const LENTO_PERSONAJE = 1;
const PAUSA_PERSONAJE_MS = 450;
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
// Valores: crypto con rechazo del sobrante, para que todas las caras pesen
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
// tiradas viejas se conservan. Las tiradas de rol añaden `texto` (la fila,
// «17 = 12 + 5») y `lado` (la tirada o su nombre, «Ataque espada»); con
// ellas la suma es la guardada, porque lleva el modificador.
function leerHistorial() {
  const raw = readStore(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && Array.isArray(h.details) && h.details.length
      && h.details.every((v) => Number.isInteger(v) && v >= 1 && v <= 20))
    .map((h) => (typeof h.texto === 'string'
      ? {
        sum: Number.isInteger(h.sum) ? h.sum : 0,
        details: h.details,
        texto: h.texto.slice(0, 80),
        ...(typeof h.lado === 'string' ? { lado: h.lado.slice(0, 60) } : {}),
      }
      : { sum: h.details.reduce((a, b) => a + b, 0), details: h.details }))
    .slice(-HISTORY_MAX);
}

// La versión anterior guardaba la cantidad como texto ("2") y llegaba a 3
function leerCantidad() {
  const n = parseInt(readStore(COUNT_KEY, 2), 10);
  return n >= 1 && n <= MAX_DADOS ? n : 2;
}

function leerTipo() {
  const n = parseInt(readStore(TIPO_KEY, 6), 10);
  return LADOS_VALIDOS.includes(n) ? n : 6;
}

// Tiradas guardadas: [{ nombre, tirada }]; las que ya no se entienden se
// descartan al leer
function leerGuardadas() {
  const raw = readStore(GUARDADAS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g) => g && typeof g.nombre === 'string' && g.nombre.trim() && parsear(g.tirada).ok)
    .map((g) => ({ nombre: g.nombre.trim().slice(0, 30), tirada: parsear(g.tirada).texto }))
    .slice(0, GUARDADAS_MAX);
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
  const typeBtns = [...document.querySelectorAll('[data-dice-type]')];
  const shakeBox = $('dice-shake');
  const btnShake = $('btn-shake');
  const shakeMsg = $('shake-msg');
  const historyList = $('history-list');
  const historyCount = $('history-count');
  const btnClear = $('btn-clear');
  const rolForm = $('rol-form');
  const rolTirada = $('rol-tirada');
  const rolError = $('rol-error');
  const rolPersonaje = $('rol-personaje');
  const rolGuardadas = $('rol-guardadas');
  const rolGuardar = $('rol-guardar');
  const rolNombre = $('rol-nombre');

  if (!stage || !floor || !btnRoll || !result || btnRoll.dataset.ready) return;
  btnRoll.dataset.ready = 'true';

  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = (a) => a?.finished.catch(() => {});

  // Plantillas del marcado de cada tipo de dado (Dice.astro)
  const plantillas = Object.fromEntries(
    [...stage.querySelectorAll('template[data-plantilla]')].map((t) => [Number(t.dataset.plantilla), t]),
  );

  // Las caras de un dado: su normal (para la luz) y su capa de sombra
  function leerCaras(d) {
    if (!d.f) {
      return [...d.el.querySelectorAll('.dice-face')].map((f) => ({
        n: NORMAL[f.dataset.face],
        shade: f.querySelector('.dice-shade'),
      }));
    }
    return [...d.el.querySelectorAll('.rol-face')].map((f) => ({
      n: d.f.caras[f.dataset.cara].n,
      shade: f.querySelector('.dice-shade'),
    }));
  }

  const dados = [...floor.querySelectorAll('[data-die]')].map((el) => {
    const d = {
      el,
      sombra: floor.querySelector(`[data-shadow="${el.dataset.die}"]`),
      lados: 6,
      f: null,
      valor: azar(6),
      p: [0, 0],
      q: Q.ID,
    };
    d.caras = leerCaras(d);
    return d;
  });

  // Cambia el dado de tipo clonando la plantilla. Sin animación: se hace
  // con el dado recogido o justo antes de lanzarlo.
  function prepararDado(d, lados) {
    if (d.lados === lados || !plantillas[lados]) return;
    d.el.replaceChildren(plantillas[lados].content.cloneNode(true));
    d.lados = lados;
    d.f = lados === 6 ? null : forma(lados);
    d.el.dataset.lados = String(lados);
    d.sombra.classList.toggle('is-rol', lados !== 6);
    d.caras = leerCaras(d);
    if (d.valor > lados) d.valor = azar(lados);
  }

  let cuantos = leerCantidad();
  let tipo = leerTipo();
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

  // Los dados que hay en la mesa: cuántos y de qué tipo cada uno. Cambian
  // de tamaño con la cantidad (data-count en Dice.astro).
  function ponerEnMesa(tipos) {
    stage.dataset.count = String(tipos.length);
    dados.forEach((d, i) => {
      if (i < tipos.length) prepararDado(d, tipos[i]);
      d.el.hidden = i >= tipos.length;
      d.sombra.hidden = i >= tipos.length;
    });
    marcarParedes(caja(dados[0].el.offsetWidth));
    return dados.slice(0, tipos.length);
  }

  const enMesa = () => dados.filter((d) => !d.el.hidden);

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
    const alto = z - (d.f ? h * d.f.apoyo : h);
    const off = s * 0.06 + alto * 0.45;
    const sombra = {
      transform: `translate3d(${p[0] + off}px, ${y + off * 0.8}px, 0.5px) `
        + `rotateZ(${Math.atan2(R[1][0], R[0][0])}rad) scale(${1 + alto / (s * 2.5)})`,
      opacity: Math.max(0, 0.9 * (1 - alto / (s * 2.4))) * k,
    };
    return { cubo, luz, sombra };
  }

  // Altura del centro con el vértice más bajo tocando la mesa: así un dado
  // de canto no la atraviesa
  function apoyado(d, q) {
    const h = d.el.offsetWidth / 2;
    if (d.f) return h * alturaApoyo(d.f, q);
    const R = Q.mat(q);
    return h * (Math.abs(R[2][0]) + Math.abs(R[2][1]) + Math.abs(R[2][2]));
  }

  // Pose apoyada en la mesa (o a `aire` píxeles de ella)
  function instante(d, p, q, aire) {
    return pose(d, [p[0], p[1], apoyado(d, q) + aire], q);
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
  // Cada dado choca con su propia forma; los D6 sin forma, como siempre.
  function tirar(activos, valores, lento = LENTO) {
    const s = activos[0].el.offsetWidth;
    const mesa = caja(s);
    marcarParedes(mesa);
    const cuerpos = desdeLaMano(activos.length, mesa, s).map((c, i) => ({ ...c, forma: activos[i].f }));
    const sims = simular(cuerpos, mesa, s);
    return Promise.all(activos.map((d, i) => {
      const lista = sims[i];
      const ultima = lista[lista.length - 1];
      const P = d.f ? renumerarForma(d.f, ultima.q, valores[i]) : renumerar(ultima.q, valores[i]);
      d.valor = valores[i];
      d.p = [ultima.x[0], ultima.x[1]];
      d.q = Q.mul(ultima.q, P);
      const muestras = lista.map((m) => pose(d, m.x, Q.mul(m.q, P)));
      return reproducir(d, muestras, ((lista.length - 1) / MUESTRAS_POR_S) * 1000 * lento);
    }));
  }

  function hueco(i, s) {
    const [x, y] = HUECOS[enMesa().length][i];
    return [(x + entre(-0.12, 0.12)) * s, (y + entre(-0.12, 0.12)) * s];
  }

  // Sin tirada (movimiento reducido): en su hueco, con su valor arriba
  function colocar(d, valor, i) {
    d.valor = valor;
    d.p = hueco(i, d.el.offsetWidth);
    if (d.f) {
      const q0 = Q.eje(0, 0, 1, entre(-0.6, 0.6));
      d.q = aplanarForma(d.f, Q.mul(q0, renumerarForma(d.f, q0, valor)));
    } else {
      d.q = qArriba(valor, entre(-0.6, 0.6));
    }
    pintar(d);
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

  // Entrada: los dados se lanzan solos al cargar, igual que en una tirada.
  // También al cambiar la cantidad o el tipo: cambian de tamaño y la física
  // necesita a todos en la mesa a la vez, así que se vuelven a lanzar todos,
  // conservando sus valores.
  function entrar() {
    const activos = ponerEnMesa(Array(cuantos).fill(tipo));
    if (reducido()) {
      return Promise.all(activos.map((d, i) => {
        colocar(d, d.valor, i);
        return fin(d.el.animate([{ opacity: 0 }, { opacity: 1 }], REDUCED_MS));
      }));
    }
    return tirar(activos, activos.map((d) => d.valor));
  }

  // Anticipación: los dados de la mesa se encogen en su sitio y desaparecen;
  // después entran lanzados desde la derecha
  function recoger(d, i) {
    const z = apoyado(d, d.q);
    const muestras = Array.from({ length: 9 }, (_, k) => {
      const e = 1 - Math.pow(1 - k / 8, 2);
      return pose(d, [d.p[0], d.p[1], z * (1 - e)], d.q, 1 - e);
    });
    return reproducir(d, muestras, RECOGER_MS, i * 25);
  }

  // Una tirada completa sobre la mesa: recoge los dados que hay, pone los
  // de `tipos` y los lanza con `valores`. Devuelve su número de tirada, o 0
  // si otra la interrumpió (entonces no se escribe nada).
  async function lanzarEnMesa(tipos, valores, lento = LENTO) {
    const mia = ++tirada;
    ocupado = true;
    ultimaTirada = Date.now();
    const antes = enMesa();
    terminar(dados);
    pararReposo();
    limpiarResultado();

    if (reducido()) {
      const activos = ponerEnMesa(tipos);
      const orden = barajar([...activos.keys()]);
      activos.forEach((d, i) => colocar(d, valores[i], orden[i]));
      await fin(stage.animate([{ opacity: 0 }, { opacity: 1 }], REDUCED_MS));
    } else {
      await Promise.all(antes.map(recoger));
      if (mia !== tirada) return 0;
      const activos = ponerEnMesa(tipos);
      await tirar(activos, valores, lento);
    }
    if (mia !== tirada) return 0;

    enMesa().forEach(pintar);
    ocupado = false;
    reposar();
    navigator.vibrate?.(12);
    return mia;
  }

  // Una pausa que también se puede interrumpir (y sin setTimeout: es una
  // animación vacía de la Web Animations API)
  const pausa = (ms) => fin(stage.animate([], ms));

  // --- Resultado e historial -------------------------------------------------
  // El desglose sigue el orden en que se ven los dados: por filas, de
  // izquierda a derecha. Si no, «5 + 2» con el 2 a la izquierda confunde.
  function ordenVisual(lista) {
    const s = lista[0].el.offsetWidth;
    return [...lista].sort((a, b) => (Math.abs(a.p[1] - b.p[1]) > s * 0.8 ? a.p[1] - b.p[1] : a.p[0] - b.p[0]));
  }

  function limpiarResultado() {
    result.classList.remove('is-shown', 'is-largo');
    result.removeAttribute('data-suma');
    result.removeAttribute('data-caras');
    dados.forEach((d) => d.el.classList.remove('is-descartado'));
  }

  // data-suma y data-caras: el test de estado comprueba que el texto
  // coincide con las caras que quedaron arriba (data-caras, en el orden de
  // los dados en el HTML)
  function mostrarTexto(principal, lado, suma, largo = false) {
    resultMain.textContent = principal;
    resultSide.textContent = lado;
    result.dataset.suma = String(suma);
    result.dataset.caras = enMesa().map((d) => d.valor).join(',');
    result.classList.toggle('is-largo', largo);
    result.classList.add('is-shown');
  }

  function mostrar(valores) {
    const suma = valores.reduce((a, b) => a + b, 0);
    mostrarTexto(String(suma), valores.length === 1 ? 'Un dado' : valores.join(' + '), suma);
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
        label.textContent = h.texto ?? (h.details.length === 1 ? 'Un dado' : h.details.join(' + '));
        const side = document.createElement('span');
        side.className = 'history-side';
        side.textContent = h.lado ?? `Suma ${h.sum}`;
        row.append(n, label, side);
        historyList.appendChild(row);
      });
    }
    if (historyCount) {
      historyCount.textContent = history.length === 1 ? '1 tirada' : history.length ? `${history.length} tiradas` : '';
    }
  }

  // entrada: { sum, details } (D6, como siempre) o con texto y lado (rol)
  function guardar(entrada) {
    history.push(entrada);
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
  // La acción principal: `cuantos` dados del tipo elegido
  async function lanzar() {
    const valores = Array.from({ length: cuantos }, () => azar(tipo));
    if (!(await lanzarEnMesa(Array(cuantos).fill(tipo), valores))) return;
    const enOrden = ordenVisual(enMesa()).map((d) => d.valor);
    mostrar(enOrden);
    const suma = enOrden.reduce((a, b) => a + b, 0);
    if (tipo === 6) {
      guardar({ sum: suma, details: enOrden });
    } else {
      guardar({
        sum: suma,
        details: enOrden,
        texto: enOrden.length === 1 ? `Un d${tipo}` : enOrden.join(' + '),
        lado: `${cuantos}d${tipo} · suma ${suma}`,
      });
    }
  }

  btnRoll.addEventListener('click', lanzar);

  // --- Cuántos dados y de qué tipo -----------------------------------------------
  function aplicarSeleccion() {
    countBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.diceCount) === cuantos)));
    typeBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.diceType) === tipo)));
    btnRoll.textContent = tipo === 6
      ? (cuantos === 1 ? 'Lanzar dado' : 'Lanzar dados')
      : `Lanzar ${cuantos === 1 ? '' : cuantos}d${tipo}`;
  }

  function cambiarMesa() {
    tirada++; // una tirada en marcha ya no escribe su resultado
    ocupado = false;
    terminar(dados);
    limpiarResultado();
    if (rolPersonaje) rolPersonaje.hidden = true;
    aplicarSeleccion();
    entrar();
  }

  countBtns.forEach((b) => b.addEventListener('click', () => {
    const nuevo = Number(b.dataset.diceCount);
    if ((nuevo === cuantos && enMesa().every((d) => d.lados === tipo) && enMesa().length === cuantos) || !HUECOS[nuevo]) return;
    cuantos = nuevo;
    writeStore(COUNT_KEY, cuantos);
    cambiarMesa();
  }));

  typeBtns.forEach((b) => b.addEventListener('click', () => {
    const nuevo = Number(b.dataset.diceType);
    if ((nuevo === tipo && enMesa().every((d) => d.lados === tipo) && enMesa().length === cuantos) || !LADOS_VALIDOS.includes(nuevo)) return;
    tipo = nuevo;
    writeStore(TIPO_KEY, tipo);
    cambiarMesa();
  }));

  // --- Modo rol -------------------------------------------------------------------
  const signo = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);

  // Los controles de rol están debajo, lejos de la mesa: al tirar desde
  // ellos se sube hasta la mesa, o la tirada pasaría sin verse
  function verMesa() {
    const arriba = stage.getBoundingClientRect().top;
    const abajo = result.getBoundingClientRect().bottom;
    if (arriba >= 0 && abajo <= window.innerHeight) return;
    window.scrollTo({ top: window.scrollY + arriba - 16, behavior: reducido() ? 'auto' : 'smooth' });
  }

  function mostrarError(texto) {
    if (rolError) rolError.textContent = texto;
    if (texto) rolTirada?.setAttribute('aria-invalid', 'true');
    else rolTirada?.removeAttribute('aria-invalid');
  }

  // Tirada escrita: «1d20+5», «2d6+3», «1d8+1d6». nombre: el de una tirada
  // guardada, que es lo que se lee luego en el historial
  async function tirarNotacion(t, nombre = '') {
    if (rolPersonaje) rolPersonaje.hidden = true;
    verMesa();
    const tipos = t.grupos.flatMap((g) => Array(g.cantidad).fill(g.lados));
    const valores = tipos.map((l) => azar(l));
    if (!(await lanzarEnMesa(tipos, valores))) return;
    // Cada grupo, en el orden en que se ven sus dados
    let k = 0;
    const activos = enMesa();
    const porGrupo = t.grupos.map((g) => {
      const suyos = activos.slice(k, (k += g.cantidad));
      return ordenVisual(suyos).map((d) => d.valor);
    });
    const { total, desglose } = resolver(t, porGrupo);
    const solo = porGrupo.flat().length === 1 && !t.mod;
    mostrarTexto(String(total), solo ? (nombre || t.texto) : `${nombre || t.texto}: ${desglose}`, total);
    guardar({
      sum: total,
      details: porGrupo.flat(),
      texto: solo ? String(total) : `${total} = ${desglose}`,
      lado: nombre || t.texto,
    });
  }

  rolForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = parsear(rolTirada.value);
    if (!t.ok) {
      mostrarError(t.error);
      rolTirada.focus();
      return;
    }
    mostrarError('');
    rolTirada.value = t.texto;
    writeStore(TIRADA_KEY, t.texto);
    tirarNotacion(t);
  });

  rolTirada?.addEventListener('input', () => {
    if (rolError?.textContent) mostrarError('');
  });

  // Ventaja y desventaja: 2d20 y vale el mayor o el menor. Si la tirada
  // escrita es 1d20 con modificador (1d20+5, la de un ataque), se suma.
  async function tirarVentaja(modo) {
    if (rolPersonaje) rolPersonaje.hidden = true;
    verMesa();
    const t = parsear(rolTirada?.value);
    const g = t.ok && t.grupos.length === 1 ? t.grupos[0] : null;
    const mod = g && g.cantidad === 1 && g.lados === 20 && g.signo === 1 ? t.mod : 0;
    if (!(await lanzarEnMesa([20, 20], [azar(20), azar(20)]))) return;
    const [a, b] = ordenVisual(enMesa());
    const r = ventaja(a.valor, b.valor, modo);
    (r.descartado === 0 ? a : b).el.classList.add('is-descartado');
    const total = r.valor + mod;
    const nombreModo = modo === 'ventaja' ? 'Con ventaja' : 'Con desventaja';
    const tiradaTxt = mod ? `1d20${mod < 0 ? '-' : '+'}${Math.abs(mod)}` : '';
    mostrarTexto(
      String(total),
      `${nombreModo}: ${a.valor} y ${b.valor}${mod ? `, ${r.valor} ${signo(mod)}` : ''}`,
      total,
    );
    guardar({
      sum: total,
      details: [a.valor, b.valor],
      texto: mod ? `${total} = ${r.valor} ${signo(mod)}` : String(total),
      lado: `${tiradaTxt ? `${tiradaTxt} ` : ''}${nombreModo.toLowerCase()} (${a.valor} y ${b.valor})`,
    });
  }

  $('btn-ventaja')?.addEventListener('click', () => tirarVentaja('ventaja'));
  $('btn-desventaja')?.addEventListener('click', () => tirarVentaja('desventaja'));

  // Crear personaje: 4d6 sin el menor, seis veces. Cada una se tira de
  // verdad en la mesa y el dado descartado se apaga; la lista dice cuál fue.
  async function crearPersonaje() {
    if (!rolPersonaje) return;
    rolPersonaje.replaceChildren();
    rolPersonaje.hidden = false;
    verMesa();
    const valores = [];
    for (let k = 0; k < 6; k++) {
      const mia = await lanzarEnMesa([6, 6, 6, 6], [1, 2, 3, 4].map(() => azar(6)), reducido() ? LENTO : LENTO_PERSONAJE);
      if (!mia) return;
      const orden = ordenVisual(enMesa());
      const r = sinElMenor(orden.map((d) => d.valor));
      orden[r.descartado].el.classList.add('is-descartado');
      valores.push(r.total);

      const row = document.createElement('li');
      row.className = 'personaje-row';
      const n = document.createElement('span');
      n.className = 'personaje-num';
      n.textContent = String(k + 1);
      const v = document.createElement('span');
      v.className = 'personaje-valor';
      v.textContent = String(r.total);
      const det = document.createElement('span');
      det.className = 'personaje-dados';
      const quedan = orden.filter((_, i) => i !== r.descartado).map((d) => d.valor);
      det.textContent = `${quedan.join(' + ')}, sin el ${orden[r.descartado].valor}`;
      row.append(n, v, det);
      rolPersonaje.append(row);

      const suma = valores.reduce((a, b) => a + b, 0);
      mostrarTexto(valores.join(' · '), k < 5 ? `Personaje: ${k + 1} de 6` : `Personaje · suma ${suma}`, suma, true);
      if (k < 5) {
        await pausa(reducido() ? 0 : PAUSA_PERSONAJE_MS);
        if (mia !== tirada) return;
      } else {
        guardar({ sum: suma, details: valores, texto: valores.join(' · '), lado: 'Personaje' });
      }
    }
  }

  $('btn-personaje')?.addEventListener('click', crearPersonaje);

  // --- Tiradas guardadas ----------------------------------------------------------
  let guardadas = leerGuardadas();

  function renderGuardadas() {
    if (!rolGuardadas) return;
    rolGuardadas.replaceChildren();
    if (!guardadas.length) {
      const vacia = document.createElement('li');
      vacia.className = 'guardada-vacia';
      vacia.textContent = 'Guarda las que repites, como «Ataque espada: 1d20+5».';
      rolGuardadas.append(vacia);
      return;
    }
    guardadas.forEach((g, i) => {
      const row = document.createElement('li');
      row.className = 'guardada-row';
      const tirar = document.createElement('button');
      tirar.type = 'button';
      tirar.className = 'guardada-tirar';
      tirar.dataset.guardada = String(i);
      const nombre = document.createElement('span');
      nombre.textContent = g.nombre;
      const expr = document.createElement('span');
      expr.className = 'guardada-expr';
      expr.textContent = g.tirada;
      tirar.append(nombre, expr);
      tirar.setAttribute('aria-label', `Tirar ${g.nombre}: ${g.tirada}`);
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'guardada-quitar';
      quitar.dataset.quitar = String(i);
      quitar.textContent = 'Quitar';
      quitar.setAttribute('aria-label', `Quitar ${g.nombre}`);
      row.append(tirar, quitar);
      rolGuardadas.append(row);
    });
  }

  rolGuardadas?.addEventListener('click', (e) => {
    const tirarBtn = e.target.closest('[data-guardada]');
    const quitarBtn = e.target.closest('[data-quitar]');
    if (tirarBtn) {
      const g = guardadas[Number(tirarBtn.dataset.guardada)];
      if (!g) return;
      mostrarError('');
      if (rolTirada) rolTirada.value = g.tirada;
      tirarNotacion(parsear(g.tirada), g.nombre);
    } else if (quitarBtn) {
      guardadas.splice(Number(quitarBtn.dataset.quitar), 1);
      writeStore(GUARDADAS_KEY, guardadas.length ? guardadas : null);
      renderGuardadas();
    }
  });

  rolGuardar?.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = parsear(rolTirada?.value);
    if (!t.ok) {
      mostrarError(rolTirada?.value.trim() ? t.error : 'Escribe arriba la tirada que quieres guardar, por ejemplo 1d20+5.');
      rolTirada?.focus();
      return;
    }
    mostrarError('');
    const nombre = (rolNombre?.value.trim() || t.texto).slice(0, 30);
    // Mismo nombre: se reemplaza
    guardadas = guardadas.filter((g) => g.nombre.toLowerCase() !== nombre.toLowerCase());
    guardadas.unshift({ nombre, tirada: t.texto });
    guardadas = guardadas.slice(0, GUARDADAS_MAX);
    writeStore(GUARDADAS_KEY, guardadas);
    if (rolNombre) rolNombre.value = '';
    renderGuardadas();
  });

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
  if (rolTirada) {
    const ultima = readStore(TIRADA_KEY, '');
    if (typeof ultima === 'string' && parsear(ultima).ok) rolTirada.value = ultima;
  }
  aplicarSeleccion();
  renderHistory();
  renderGuardadas();
  entrar().then(() => {
    if (tirada === 0) reposar();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDados);
} else {
  initDados();
}
document.addEventListener('astro:page-load', initDados);
