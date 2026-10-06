// ==========================================================
// RULETA — lógica pura (sin DOM)
// ==========================================================
// Todo lo que la ruleta calcula y se puede comprobar sin navegador: sorteo,
// geometría de los gajos, tonos, plan del giro con su final con suspenso,
// reposo, emparejamiento de ocultas, lectura de lo guardado y enlace para
// compartir (SDD de la ruleta, §6.3 y §6.13). Lo prueba Node en
// scripts/ruleta-check.mjs, dentro de `npm test`.
//
// Parte de la lógica del prototipo aprobado (docs/prototipos/ruleta-rueda.html,
// rama claude/ruleta-7-prototipo, commit 4b4e43f). Donde el SDD dice otra
// cosa manda el SDD: `anguloFinal` sale normalizado a [0, 360).
//
// Ángulos en grados. El rotor gira en sentido horario (ángulo creciente) y el
// puntero está arriba; el gajo i ocupa de i·s a (i+1)·s, con s = 360/n.

import { limpiar } from './dados-opciones.js';

const U32 = 4294967296;
const u32 = () => {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; }
  catch { return Math.floor(Math.random() * U32); } // respaldo, como manda AGENTS.md
};
const unidad = (rnd = u32) => rnd() / U32;
const mod = (a, m) => ((a % m) + m) % m;

export function leerOpciones(texto) {
  return String(texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

// Entero uniforme en [0, n) con muestreo por rechazo: sin sesgo de módulo.
export function indiceAlAzar(n, rnd = u32) {
  const lim = U32 - (U32 % n);
  let x;
  do { x = rnd(); } while (x >= lim);
  return x % n;
}

const RADIO = 98, CENTRO = 100;
function punto(grados) {
  const r = (grados * Math.PI) / 180;
  return [CENTRO + RADIO * Math.sin(r), CENTRO - RADIO * Math.cos(r)];
}
// Gajo i: de i·s a (i+1)·s en grados desde el puntero (arriba), en sentido
// horario; `d` para un <path> en un viewBox 0 0 200 200. Con N = 1, círculo.
export function geometria(n) {
  const s = 360 / n;
  return Array.from({ length: n }, (_, i) => {
    const ini = i * s, fin = (i + 1) * s;
    let d;
    if (n === 1) {
      d = `M${CENTRO} ${CENTRO - RADIO}A${RADIO} ${RADIO} 0 1 1 ${CENTRO} ${CENTRO + RADIO}A${RADIO} ${RADIO} 0 1 1 ${CENTRO} ${CENTRO - RADIO}Z`;
    } else {
      const [x1, y1] = punto(ini), [x2, y2] = punto(fin);
      d = `M${CENTRO} ${CENTRO}L${x1.toFixed(3)} ${y1.toFixed(3)}A${RADIO} ${RADIO} 0 ${s > 180 ? 1 : 0} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}Z`;
    }
    return { ini, fin, med: ini + s / 2, d };
  });
}

// Tonos de la paleta «Pastel vivo» (SDD §6.12).
export const TONOS = 8;

// Tono de cada gajo: dos vecinos nunca comparten tono, tampoco el último y el
// primero. Hace falta una paleta de ≥ 3 tonos para que N impar tenga solución.
export function tonoDe(i, n, tonos = TONOS) {
  if (n <= 1) return 0;
  const t = i % tonos;
  if (i === n - 1 && t === 0) {
    const previo = (i - 1) % tonos;
    for (let c = 1; c < tonos; c++) if (c !== previo) return c;
  }
  return t;
}

// Gajo que queda bajo el puntero con el rotor girado `angulo` grados (horario).
export function gajoBajoPuntero(angulo, n) {
  return Math.min(n - 1, Math.floor(mod(-angulo, 360) / (360 / n)));
}

// Rebote máximo del aterrizaje normal.
export function aterrizaje(n) { return Math.min(2, 0.1 * (360 / n)); }

// Distancia (en grados) del puntero a la frontera más cercana con el rotor en `angulo`.
export function margenReposo(angulo, n) {
  const s = 360 / n, dentro = mod(-angulo, 360) % s;
  return Math.min(dentro, s - dentro);
}
// Amplitud del balanceo de reposo, calculada con la pose (SDD §6.3 y §6.5).
// Con la rueda grande también se limita por píxeles: nunca más de 6 px en el
// borde (`radio` en px).
export function amplitudReposo(margen, radio = Infinity) {
  return Math.min(1.5, 0.4 * margen, ((6 / radio) * 180) / Math.PI);
}

/* --- Final con suspenso (SDD §6.13) --- */
// Intervalo de la pose final dentro del gajo ganador, medido en el sentido del
// giro: 0 = frontera por la que entra el puntero, 1 = la de salida.
export const FINALES = { normal: [0.12, 0.88], casi: [0.90, 0.97], pelos: [0.03, 0.10], atras: [0.85, 0.95] };
const PESOS_FINAL = [['normal', 65], ['casi', 80], ['pelos', 95], ['atras', 100]]; // acumulados
const ANCHO_MIN = 0.025;                      // anchura mínima tras recortar (el ejemplo N = 30 del SDD)
// Grados mínimos de la pose final a la frontera (RNF-03).
export const margenMin = (n) => Math.max(0.03 * (360 / n), 1.5);

export function intervaloFinal(tipo, n) {
  const mf = margenMin(n) / (360 / n);
  let [lo, hi] = FINALES[tipo];
  lo = Math.max(lo, mf); hi = Math.min(hi, 1 - mf);
  if (hi - lo < ANCHO_MIN - 1e-9) {
    if (tipo === 'casi' || tipo === 'atras') lo = Math.max(mf, hi - ANCHO_MIN);
    else hi = Math.min(1 - mf, lo + ANCHO_MIN);
  }
  // Con gajos de menos de 3° (N > 120) el margen no cabe: centro del gajo.
  if (lo > hi) lo = hi = 0.5;
  return [lo, hi];
}

// Tipo de final, sorteado aparte e independiente del ganador. Con N > 30 (o
// N < 2, sin gajo vecino) siempre «normal»; nunca dos distintos de «normal»
// seguidos. `historial`: finales anteriores, el último al final.
export function elegirFinal(historial, n, rnd = u32) {
  if (n < 2 || n > 30) return 'normal';
  const r = indiceAlAzar(100, rnd);
  const tipo = PESOS_FINAL.find(([, acum]) => r < acum)[0];
  const ultimo = historial[historial.length - 1];
  return tipo !== 'normal' && ultimo && ultimo !== 'normal' ? 'normal' : tipo;
}

const FPS_MUESTRA = 60;
const PUNTERO_MAX = -18;      // grados del puntero levantado o golpeado
const PUNTERO_EMPUJE = 16;    // grados del puntero empujando de vuelta (vuelta atrás)
const FUSION_MS = 50;         // cruces más juntos que esto: el puntero se queda levantado
const CONTACTO = 0.8;         // grados de rotor que el puntero tarda en soltarse de un perno
const BLUR_OPACIDAD = 0.35;   // etiquetas con la rueda a más de medio gajo por fotograma

/* Curva por tramos (SDD §6.3, #15): fase rápida en el primer 70 % del tiempo
   con deceleración constante de v₀ a v₁, y cola cúbica en el 30 % final que
   recorre θ_c = min(90°, 1,5 gajos) (90° con N > 30); empalme sin salto de
   velocidad con v₁ = 3·θ_c / T_c. Devuelve θ(t), con t en segundos. */
export function curva(total, T, n) {
  const s = 360 / n, Tc = 0.3 * T, T1 = 0.7 * T;
  const thC = Math.min(total, n <= 30 ? Math.min(90, 1.5 * s) : 90);
  const v1 = (3 * thC) / Tc, D1 = total - thC;
  const v0 = (2 * D1) / T1 - v1;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= T) return total;
    if (t <= T1) return v0 * t - ((v0 - v1) * t * t) / (2 * T1);
    const tau = (t - T1) / Tc;
    return D1 + thC * (1 - (1 - tau) ** 3);
  };
}

// Pose final: ángulo del rotor (no normalizado) que deja el puntero a la
// fracción `fT` (en el sentido del giro) del gajo ganador.
export function poseFinal({ ganador, n, final, rnd = u32 }) {
  const [lo, hi] = intervaloFinal(final, n);
  const fT = lo + (hi - lo) * unidad(rnd);
  return { fT, objetivo: -(ganador + (1 - fT)) * (360 / n) };
}

/* Plan del giro. `anguloActual` es el ángulo del rotor al empezar la acción.
   `vueltas` (5–7) y `duracion` (ms, 5–7 s, D4) se sortean si no llegan; el
   arrastre elige las vueltas con la fuerza del gesto (§6.14), nunca el
   ganador. Devuelve el rotor (60 Hz, lineal entre muestras), el puntero (un
   golpe por cruce; los cruces a < 50 ms lo dejan levantado), la opacidad de
   las etiquetas (desenfoque de movimiento sin `filter`), los instantes de
   golpe para el tic, el aterrizaje y la pose final.
   `anguloFinal` va normalizado a [0, 360) (§6.15); los fotogramas y
   `anguloAccion` siguen sin normalizar, para que la animación sea continua. */
export function planGiro({ anguloActual, ganador, n, duracion, vueltas, final = 'normal', rnd = u32 }) {
  const s = 360 / n;
  if (n < 2 || n > 30) final = 'normal';
  if (vueltas === undefined) vueltas = 5 + indiceAlAzar(3, rnd);
  if (duracion === undefined) duracion = Math.min(7000, Math.max(5000, vueltas * 1000 + (unidad(rnd) - 0.5) * 600));
  const { fT, objetivo } = poseFinal({ ganador, n, final, rnd });
  const fL = 1 - fT;
  let rebote = 0, extra = 0;
  if (final === 'normal') { rebote = aterrizaje(n); extra = rebote; }
  else if (final === 'atras') { extra = (fL + 0.10 + 0.05 * unidad(rnd)) * s; } // se pasa 0,10–0,15 gajo
  const recorrido = mod(objetivo - anguloActual, 360) + 360 * vueltas;
  const total = recorrido + extra;
  const T = duracion / 1000;
  const th = curva(total, T, n);

  const K = Math.max(2, Math.round(T * FPS_MUESTRA));
  const rotor = [], angulos = [];
  for (let k = 0; k <= K; k++) {
    const a = anguloActual + th((k / K) * T);
    angulos.push(a);
    rotor.push({ offset: k / K, transform: `rotate(${a.toFixed(3)}deg)` });
  }

  // Cruces de frontera: la frontera j está en el ángulo j·s del rotor.
  const tiempoDe = (x) => {
    let a = 0, b = T;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (th(m) < x) a = m; else b = m; }
    return (a + b) / 2;
  };
  const cruces = [];
  for (let j = Math.floor(anguloActual / s) + 1; j * s <= anguloActual + total; j++) {
    const t = tiempoDe(j * s - anguloActual);
    const v = Math.max(1, (th(Math.min(T, t + 0.001)) - th(Math.max(0, t - 0.001))) / 0.002); // °/s
    cruces.push({ ini: t * 1000, fin: t * 1000 + Math.min(300, (CONTACTO / v) * 1000), v });
  }
  const grupos = [];
  for (const c of cruces) {
    const g = grupos[grupos.length - 1];
    if (g && c.ini - g.fin < FUSION_MS) g.fin = Math.max(g.fin, c.fin); else grupos.push({ ini: c.ini, fin: c.fin });
  }
  const puntero = [];
  const poner = (ms, grados) => {
    const t = Math.min(1, Math.max(puntero.length ? puntero[puntero.length - 1].offset : 0, ms / duracion));
    puntero.push({ offset: t, transform: `rotate(${grados}deg)` });
  };
  poner(0, PUNTERO_MAX); // sale levantado (anticipación) y baja antes del primer golpe, si le da tiempo
  if (grupos.length && grupos[0].ini >= 60) poner(Math.min(50, grupos[0].ini), 0);
  grupos.forEach((g, i) => {
    const siguiente = i + 1 < grupos.length ? grupos[i + 1].ini : duracion;
    const suelta = g.fin + 20;
    poner(g.ini, i === 0 && g.ini < 60 ? PUNTERO_MAX : 0);
    poner(g.ini + 20, PUNTERO_MAX);
    if (suelta > g.ini + 20) poner(suelta, PUNTERO_MAX);
    poner(Math.min(suelta + 50, siguiente), 0);
  });
  poner(duracion, 0);

  // Desenfoque: etiquetas a 0,35 mientras la rueda avanza > medio gajo por fotograma.
  const borrosa = (k) => Math.abs(angulos[Math.min(K, k + 1)] - angulos[k]) > 0.5 * s;
  const etiquetas = [{ offset: 0, opacity: borrosa(0) ? BLUR_OPACIDAD : 1 }];
  const rampa = 50 / duracion;
  for (let k = 1; k < K; k++) {
    if (borrosa(k) === borrosa(k - 1)) continue;
    const t = k / K, previo = borrosa(k - 1) ? BLUR_OPACIDAD : 1, nuevo = borrosa(k) ? BLUR_OPACIDAD : 1;
    const ultimo = etiquetas[etiquetas.length - 1].offset;
    etiquetas.push({ offset: Math.max(ultimo, t - rampa), opacity: previo }, { offset: Math.min(1, t + rampa), opacity: nuevo });
  }
  etiquetas.push({ offset: 1, opacity: etiquetas[etiquetas.length - 1].opacity });

  const fin = anguloActual + recorrido;          // pose final (sin normalizar)
  let aterriza;
  if (final === 'atras') {
    aterriza = {
      dur: 800, easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      rotor: [{ transform: `rotate(${fin + extra}deg)` }, { transform: `rotate(${fin}deg)` }],
      puntero: [{ offset: 0, transform: 'rotate(0deg)' }, { offset: 0.08, transform: `rotate(${PUNTERO_EMPUJE}deg)` },
        { offset: 0.85, transform: `rotate(${PUNTERO_EMPUJE}deg)` }, { offset: 1, transform: 'rotate(0deg)' }],
    };
  } else if (final === 'normal') {
    aterriza = {
      dur: 350, easing: 'ease-in-out', puntero: null,
      rotor: [{ transform: `rotate(${fin + rebote}deg)` }, { transform: `rotate(${fin - 0.3 * rebote}deg)`, offset: 0.45 }, { transform: `rotate(${fin}deg)` }],
    };
  } else {
    aterriza = {
      dur: 350, easing: 'ease-in-out', puntero: null,
      rotor: [{ transform: `rotate(${fin}deg)` }, { transform: `rotate(${fin + 0.25}deg)`, offset: 0.4 }, { transform: `rotate(${fin - 0.1}deg)`, offset: 0.7 }, { transform: `rotate(${fin}deg)` }],
    };
  }

  return {
    rotor, puntero, etiquetas, aterriza, duracion, vueltas, final, fT, rebote,
    golpes: grupos.map((g) => g.ini),
    anguloFinal: mod(fin, 360),
    anguloAccion: anguloActual + total,
    cruces: cruces.length,
  };
}

/* --- Ocultas (RF-08) --- */
// El emparejamiento por índice/texto de `updateFromTextarea` (roulette.js),
// sacado tal cual para poder probarlo. `antes` y `despues` son las listas de
// opciones (textos) y `ocultas` los índices ocultos de `antes`; devuelve los
// de `despues`. Primero la misma posición (escribir en medio sin reordenar);
// si en esa posición cambió el texto, la primera aparición libre de ese texto.
// Cada índice nuevo se usa una sola vez, así que dos ocultas con el mismo
// texto no colapsan; en orden ascendente, para que sea determinista. Si no
// queda aparición libre, la opción se borró y deja de rastrearse.
export function reasignarOcultas(antes, despues, ocultas) {
  const usados = new Set();
  const nuevas = new Set();
  [...ocultas].sort((a, b) => a - b).forEach((viejo) => {
    const texto = antes[viejo];
    if (texto === undefined) return;
    if (despues[viejo] === texto && !usados.has(viejo)) {
      nuevas.add(viejo);
      usados.add(viejo);
      return;
    }
    const i = despues.findIndex((o, idx) => o === texto && !usados.has(idx));
    if (i !== -1) {
      nuevas.add(i);
      usados.add(i);
    }
  });
  return nuevas;
}

/* --- Persistencia (SDD §6.9) --- */
export const CLAVES = {
  opciones: 'decidelo_ruleta_opciones',
  ocultas: 'decidelo_ruleta_ocultas',
  pregunta: 'decidelo_ruleta_pregunta',
  foco: 'decidelo_ruleta_foco',
  sonido: 'decidelo_ruleta_sonido',
  modo: 'decidelo_ruleta_modo',
  conteo: 'decidelo_ruleta_conteo',
  historial: 'decidelo_ruleta_historial',
};
// Las de antes del rediseño. No se borran: si hubiera que revertir el
// despliegue, el código anterior las sigue encontrando. `ruleta_sound` se
// deja de leer (el tic nuevo empieza desactivado, D1).
const VIEJAS = { opciones: 'ruleta_opciones', ocultas: 'ruleta_ocultas', pregunta: 'ruleta_titulo', foco: 'ruleta_focus' };
const TITULO_VIEJO = 'Ruleta de Opciones';

export const OPCIONES_POR_DEFECTO = ['Pizza', 'Tacos', 'Sushi', 'Hamburguesa', 'Ensalada', 'Pasta'];
export const MODOS = ['normal', 'eliminar', 'contar'];
export const PARA_MAX = 60;
export const HISTORIAL_MAX = 20;

const json = (raw) => { try { return JSON.parse(raw); } catch { return undefined; } };
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// `leer(clave)` devuelve el texto guardado o null (normalmente un
// localStorage.getItem); si lanza (Safari privado, almacenamiento bloqueado)
// cuenta como que no hay nada. Cada dato se lee de su clave nueva o, si
// falta, de la vieja. Lo corrupto se ignora y vale el valor por defecto.
export function migrarGuardado(leer) {
  const leerSeguro = (clave) => {
    try {
      const v = leer(clave);
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  };
  const nuevaOVieja = (dato) => {
    const v = leerSeguro(CLAVES[dato]);
    return v !== null || !VIEJAS[dato] ? v : leerSeguro(VIEJAS[dato]);
  };

  const opcionesGuardadas = nuevaOVieja('opciones');
  const opciones = opcionesGuardadas ?? OPCIONES_POR_DEFECTO.join('\n');
  const lista = leerOpciones(opciones);

  // Ocultas: v2 = {v:2, indices}; v1 = textos ocultos, que ocultan todas las
  // líneas con ese texto (lo que hacía el código viejo).
  const ocultas = new Set();
  const o = json(nuevaOVieja('ocultas'));
  if (esObjeto(o) && o.v === 2 && Array.isArray(o.indices)) {
    o.indices.forEach((i) => { if (Number.isInteger(i) && i >= 0 && i < lista.length) ocultas.add(i); });
  } else if (Array.isArray(o)) {
    const textos = new Set(o.filter((t) => typeof t === 'string'));
    lista.forEach((t, i) => { if (textos.has(t)) ocultas.add(i); });
  }

  const preguntaNueva = leerSeguro(CLAVES.pregunta);
  const titulo = preguntaNueva ?? leerSeguro(VIEJAS.pregunta);
  const pregunta = preguntaNueva === null && titulo === TITULO_VIEJO ? '' : limpiar(titulo, PARA_MAX);

  const modo = leerSeguro(CLAVES.modo);

  const cuentas = {};
  const c = json(leerSeguro(CLAVES.conteo));
  if (esObjeto(c) && c.v === 1 && esObjeto(c.cuentas)) {
    for (const [texto, n] of Object.entries(c.cuentas)) {
      if (Number.isInteger(n) && n > 0) cuentas[texto] = n;
    }
  }

  const historial = [];
  const h = json(leerSeguro(CLAVES.historial));
  if (Array.isArray(h)) {
    for (const e of h) {
      if (historial.length >= HISTORIAL_MAX) break;
      if (!esObjeto(e) || typeof e.opcion !== 'string' || !e.opcion) continue;
      const fila = { opcion: e.opcion, para: typeof e.para === 'string' ? e.para : '', t: Number.isFinite(e.t) ? e.t : 0 };
      if (Number.isInteger(e.cuenta) && e.cuenta > 0) fila.cuenta = e.cuenta;
      historial.push(fila);
    }
  }

  return {
    opciones,
    ocultas,
    pregunta,
    foco: nuevaOVieja('foco') === 'true',
    sonido: leerSeguro(CLAVES.sonido) === 'true',
    modo: MODOS.includes(modo) ? modo : 'normal',
    conteo: { v: 1, cuentas },
    historial,
  };
}

/* --- Compartir por enlace (SDD §6.10) --- */
export const ENLACE_MAX_OPCIONES = 100;
export const ENLACE_OPCION_MAX = 60;
// Por encima de esto la página avisa en vez de dar un enlace que puede romperse.
export const ENLACE_MAX_CARACTERES = 2000;

// /ruleta#para=…&opcion=…&opcion=…  En el fragmento: no llega a ningún
// servidor, y las opciones suelen ser nombres de personas. Mismo formato que
// el dado de opciones, con los límites de la ruleta.
export function enlace(base, { para, opciones }) {
  const u = new URL(base);
  u.search = '';
  const p = new URLSearchParams();
  const pregunta = limpiar(para, PARA_MAX);
  if (pregunta) p.set('para', pregunta);
  opciones
    .map((op) => limpiar(op, ENLACE_OPCION_MAX))
    .filter(Boolean)
    .slice(0, ENLACE_MAX_OPCIONES)
    .forEach((op) => p.append('opcion', op));
  u.hash = p.toString();
  return u.toString();
}

// Lee un enlace compartido (location.hash, con o sin #). null si no trae una
// ruleta válida: entonces la página se abre como siempre. Nunca lanza.
export function leerEnlace(hash) {
  try {
    if (typeof hash !== 'string') return null;
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const opciones = p.getAll('opcion')
      .map((op) => limpiar(op, ENLACE_OPCION_MAX))
      .filter(Boolean)
      .slice(0, ENLACE_MAX_OPCIONES);
    if (!opciones.length) return null;
    return { para: limpiar(p.get('para'), PARA_MAX), opciones };
  } catch {
    return null;
  }
}
