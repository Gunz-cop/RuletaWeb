// ==========================================================
// TEMPORIZADOR — lógica pura (sin DOM)
// ==========================================================
// Modos, rangos, nombre del juego por país y conversión del historial
// viejo. No toca el documento para poder comprobarla con Node
// (scripts/temporizador-check.mjs, dentro de `npm test`).

import { paisPorZona } from './moneda-serie.js';

// Los tres usos de la herramienta. Los rangos van siempre en segundos; la
// unidad solo dice en qué se escriben los campos de «Personalizar».
export const MODOS = {
  papa: {
    presets: [[10, 30], [20, 60], [60, 120]],
    porDefecto: 1,
    unidad: 's',
  },
  impulso: {
    presets: [[120, 300], [300, 600], [600, 1200]],
    porDefecto: 0,
    unidad: 'min',
  },
  // En avisos el rango es el tiempo entre un aviso y el siguiente
  avisos: {
    presets: [[20, 60], [60, 180], [180, 600]],
    porDefecto: 1,
    unidad: 'min',
  },
};

// Duración total de una sesión de avisos; 0 = hasta que se pare a mano
export const TOTALES_AVISOS = [0, 300, 600, 1200];

export const LIMITE_MIN_S = 1;
export const LIMITE_MAX_S = 3600;

// Cómo se llama el juego de pasar el objeto en cada país. Es lo que la
// gente busca, así que el modo se presenta con su nombre (DESIGN.md,
// "Variantes regionales sin pedir ubicación"; fuentes en el artículo).
export const JUEGOS = {
  papa: {
    nombre: 'Papa caliente',
    corto: 'Papa caliente',
    final: '¡Se quemó!',
    perder: 'A quien se le queme',
    ejemplo: 'hace una penitencia',
  },
  tingo: {
    nombre: 'Tingo, tingo, tango',
    corto: 'Tingo tango',
    final: '¡Tango!',
    perder: 'A quien le caiga',
    ejemplo: 'canta una canción',
  },
  sequema: {
    nombre: 'La papa se quema',
    corto: 'Papa se quema',
    final: '¡Se quemó la papa!',
    perder: 'A quien se le queme',
    ejemplo: 'cuenta un chiste',
  },
  patata: {
    nombre: 'Patata caliente',
    corto: 'Patata caliente',
    final: '¡Se quemó!',
    perder: 'A quien se le queme',
    ejemplo: 'paga la siguiente ronda',
  },
};

// País → nombre del juego. Lo que no está aquí usa «papa caliente», que es
// como se dice en casi toda Latinoamérica.
const JUEGO_POR_PAIS = { CO: 'tingo', MX: 'sequema', ES: 'patata' };

function paisPorIdioma(idioma) {
  return String(idioma || '').split('-')[1]?.toUpperCase() || null;
}

export function juegoPorDefecto({ zona, idioma } = {}) {
  for (const pais of [paisPorZona(zona), paisPorIdioma(idioma)]) {
    if (pais && Object.hasOwn(JUEGO_POR_PAIS, pais)) return JUEGO_POR_PAIS[pais];
  }
  return 'papa';
}

// Object.hasOwn: la clave puede venir de un enlace ('__proto__'…)
export function juegoValido(clave) {
  return typeof clave === 'string' && Object.hasOwn(JUEGOS, clave) ? clave : null;
}

export function modoValido(clave) {
  return typeof clave === 'string' && Object.hasOwn(MODOS, clave) ? clave : null;
}

// Rango en segundos, enteros, dentro de los límites y con min <= max
export function normalizarRango(min, max) {
  let a = Math.round(Number(min));
  let b = Math.round(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  a = Math.min(LIMITE_MAX_S, Math.max(LIMITE_MIN_S, a));
  b = Math.min(LIMITE_MAX_S, Math.max(LIMITE_MIN_S, b));
  return a <= b ? [a, b] : [b, a];
}

// Un segundo entero del rango, todos con la misma probabilidad. `unidad`
// es un número en [0, 1) que da quien llama (crypto en el navegador).
export function duracionAleatoria([min, max], unidad) {
  const n = max - min + 1;
  return min + Math.min(n - 1, Math.floor(unidad * n));
}

export function formatoDuracion(seg) {
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function formatoRango([min, max]) {
  if (min === max) return formatoDuracion(min);
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} min`;
  if (max < 60) return `${min}–${max} s`;
  return `${formatoDuracion(min)} – ${formatoDuracion(max)}`;
}

// Configuración que llega en un enlace: ?modo=papa&min=10&max=30&juego=tingo
export function configDeUrl(busqueda) {
  const p = new URLSearchParams(busqueda || '');
  const modo = modoValido(p.get('modo'));
  const juego = juegoValido(p.get('juego'));
  const rango = p.has('min') && p.has('max') ? normalizarRango(p.get('min'), p.get('max')) : null;
  return { modo, juego, rango };
}

// El historial de la versión anterior guardaba {timestamp, mode, range,
// result, duration} con emojis en los textos. Se convierte al formato
// nuevo para que nadie pierda sus rondas al cambiar de diseño.
export function convertirHistorialViejo(viejo) {
  if (!Array.isArray(viejo)) return [];
  return viejo
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const bomba = String(e.mode || '').includes('Bomba');
      const dur = Number(e.duration);
      return {
        modo: bomba ? 'papa' : 'visible',
        texto: bomba ? '¡Se quemó!' : 'Tiempo cumplido',
        lado: Number.isFinite(dur) && dur > 0 ? `Duró ${formatoDuracion(dur)}` : '',
        hora: String(e.timestamp || ''),
      };
    });
}

// --- Respiración ------------------------------------------------------------
// Fases en segundos: inhala, mantén, exhala, mantén. Una fase de 0 se salta.
export const RESPIRACIONES = {
  suave: { etiqueta: 'Suave 4-6', fases: [4, 0, 6, 0] },
  cuadrada: { etiqueta: 'Cuadrada 4-4-4-4', fases: [4, 4, 4, 4] },
  '478': { etiqueta: '4-7-8', fases: [4, 7, 8, 0] },
};

export const NOMBRES_FASE = ['Inhala', 'Mantén', 'Exhala', 'Mantén'];

const MAX_FASE_S = 12;

// Un patrón propio: enteros de 0 a 12 s, y sin inhalar o exhalar no hay
// respiración, así que esas dos fases valen al menos 1 s.
export function normalizarRespiracion(fases) {
  if (!Array.isArray(fases) || fases.length !== 4) return null;
  const n = fases.map((f) => Math.round(Number(f)));
  if (n.some((f) => !Number.isFinite(f))) return null;
  return n.map((f, i) => Math.min(MAX_FASE_S, Math.max(i % 2 === 0 ? 1 : 0, f)));
}

export function etiquetaRespiracion(fases) {
  return fases.filter((f, i) => f > 0 || i % 2 === 0).join('-');
}

// --- Evidencia personal -----------------------------------------------------
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const redondear1 = (x) => Math.round(x * 10) / 10;
const ganasValidas = (g) => Number.isInteger(g) && g >= 1 && g <= 10;
const claveGanas = (de) => String(de || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Resumen de las esperas del modo impulso: medias de antes y después de las
// últimas `ultimas` esperas completas que tienen las dos notas, y lo mismo
// por tipo de ganas. Con menos de 3 esperas así no hay evidencia (null):
// una media de dos datos diría más de lo que sabe.
export function resumenEsperas(esperas, ultimas = 10) {
  if (!Array.isArray(esperas)) return null;
  const validas = esperas.filter((e) => e && typeof e === 'object');
  const conNotas = validas.filter((e) => !e.parada && ganasValidas(e.antes) && ganasValidas(e.despues));
  if (conNotas.length < 3) return null;
  const recientes = conNotas.slice(0, ultimas);
  const antes = redondear1(media(recientes.map((e) => e.antes)));
  const despues = redondear1(media(recientes.map((e) => e.despues)));
  const completas = validas.filter((e) => !e.parada && Number(e.seg) > 0);
  const grupos = new Map();
  for (const e of conNotas) {
    const k = claveGanas(e.de);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, { de: String(e.de).trim(), lista: [] });
    grupos.get(k).lista.push(e);
  }
  const porTipo = [...grupos.values()]
    .map(({ de, lista }) => ({
      de,
      n: lista.length,
      antes: redondear1(media(lista.map((e) => e.antes))),
      despues: redondear1(media(lista.map((e) => e.despues))),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  return {
    n: recientes.length,
    antes,
    despues,
    tendencia: despues < antes ? 'bajan' : despues > antes ? 'suben' : 'igual',
    segMedia: completas.length ? Math.round(media(completas.map((e) => Number(e.seg)))) : 0,
    total: validas.length,
    paradas: validas.filter((e) => e.parada).length,
    porTipo: porTipo.length > 1 ? porTipo : [],
  };
}

export const ATENCION = {
  respiracion: 'En la respiración',
  pensando: 'Pensando en otra cosa',
  fuera: 'Distraído con algo de fuera',
};

// Resumen de las sesiones de avisos. `ahora` entra como parámetro para
// poder probar «esta semana» sin depender del reloj.
export function resumenSesiones(sesiones, ahora = Date.now()) {
  if (!Array.isArray(sesiones)) return null;
  const validas = sesiones.filter((s) => s && typeof s === 'object' && Number(s.seg) > 0);
  if (!validas.length) return null;
  const semana = 7 * 24 * 3600 * 1000;
  const conAtencion = validas.filter((s) => Object.hasOwn(ATENCION, s.atencion || ''));
  return {
    n: validas.length,
    seg: validas.reduce((a, s) => a + Number(s.seg), 0),
    semana: validas.filter((s) => ahora - Number(s.t) < semana).length,
    conAtencion: conAtencion.length,
    enRespiracion: conAtencion.filter((s) => s.atencion === 'respiracion').length,
  };
}

// «1 h 40 min» para totales largos; formatoDuracion para lo demás
export function formatoTotal(seg) {
  const s = Math.max(0, Math.round(seg));
  if (s < 3600) return formatoDuracion(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

// 7.8 → «7,8»: la coma decimal es la del español
export const decimal = (x) => String(x).replace('.', ',');
