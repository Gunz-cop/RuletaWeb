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
