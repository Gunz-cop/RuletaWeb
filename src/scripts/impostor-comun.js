// ==========================================================
// EL IMPOSTOR — lo que comparten el servidor y la página
// ==========================================================
// Límites, opciones y limpieza de lo que escribe el usuario. Está separado
// de impostor-logica.js a propósito: aquella importa la lista de palabras,
// y la lista de palabras no puede viajar al navegador (quien abra las
// herramientas de desarrollo la leería antes de saber su rol). La página
// importa solo este archivo.

export const MAX_JUGADORES = 24;
export const MIN_JUGADORES = 3;
export const MAX_NOMBRE = 20;
export const LARGO_CODIGO = 5;
// Sin I, L ni O: se confunden con 1 y 0 cuando alguien dicta el código
// por videollamada.
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const SEGUNDOS_OPCIONES = [20, 30, 45, 60, 90, 120];
export const VUELTAS_OPCIONES = [1, 2, 3];
export const MAS_SEGUNDOS = 15;
// Modo a distancia: pistas escritas por turno y chat en la votación
export const MAX_PISTA = 40;
export const MAX_CHAT = 200;
export const CHAT_GUARDADO = 200;
export const CHAT_ENTREGA = 50;
export const CHAT_RITMO_MS = 800;

/** Lo que escribió alguien → código válido, o '' si no lo es. */
export function normalizarCodigo(texto) {
  const c = String(texto || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c.length !== LARGO_CODIGO) return '';
  for (const ch of c) if (!ALFABETO_CODIGO.includes(ch)) return '';
  return c;
}

// Controles, separadores de línea y los caracteres que invierten o ocultan
// texto (U+202A–202E, U+2066–2069, ancho cero): un nombre no puede
// desordenar la lista de los demás.
const RARO = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');

/** Texto escrito por alguien, sin caracteres de control y recortado a `max` letras. */
export function normalizarTexto(texto, max) {
  const limpio = String(texto ?? '').replace(RARO, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(limpio).slice(0, max).join('').trim();
}

export function normalizarNombre(texto) {
  return normalizarTexto(texto, MAX_NOMBRE);
}
