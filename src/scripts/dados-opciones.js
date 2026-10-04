// ==========================================================
// DADOS — dado de opciones: lógica pura (sin DOM)
// ==========================================================
// El visitante escribe de dos a seis opciones y cada una va impresa en una
// cara del dado. No toca el documento para poder comprobarla con Node
// (scripts/dados-opciones-check.mjs, dentro de `npm test`).
//
// Por qué las caras sobrantes dicen «otra vez» en vez de repetir opciones:
// un dado tiene seis caras y con 4 o 5 opciones no se pueden repartir por
// igual. Repetir dos de ellas las haría más probables, y esconder el reparto
// (decidir entre las opciones y fingir la cara) sería mentir con el dibujo.
// Con «otra vez» el dado sigue siendo un dado de verdad: cada cara pesa
// 1/6, y si sale una sin opción vuelve a rodar, como se haría en la mesa.
// Con 2, 3 o 6 opciones el reparto sí es exacto y no hay caras vacías.

export const MAX_OPCIONES = 6;
export const OPCION_MAX = 24;
export const PARA_MAX = 40;

// Espacios repetidos fuera y recortado al máximo. Siempre texto, nunca HTML:
// quien lo pinta usa textContent.
export function limpiar(texto, max) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// para: «¿Qué cenamos?» (opcional). lista: lo escrito en cada casilla, con
// huecos; las vacías no cuentan.
export function validar(para, lista) {
  const opciones = (Array.isArray(lista) ? lista : [])
    .map((o) => limpiar(o, OPCION_MAX))
    .filter(Boolean)
    .slice(0, MAX_OPCIONES);
  if (opciones.length === 0) {
    return { ok: false, error: 'Escribe al menos dos opciones, una en cada casilla.' };
  }
  if (opciones.length === 1) {
    return { ok: false, error: 'Con una sola opción no hay nada que decidir: escribe al menos dos.' };
  }
  return { ok: true, para: limpiar(para, PARA_MAX), opciones };
}

// Qué lleva cada cara (índice 0 = cara 1 … índice 5 = cara 6). null es una
// cara «otra vez». Las caras opuestas suman 7 (1-6, 2-5, 3-4):
// - con 3 opciones cada una va en un par de caras opuestas, así nunca se
//   ven dos veces la misma a la vez;
// - con 2 se alternan, así dos caras opuestas nunca llevan la misma.
export function carasDe(opciones) {
  const n = opciones.length;
  if (n === 3) return [0, 1, 2, 2, 1, 0].map((i) => opciones[i]);
  return Array.from({ length: 6 }, (_, i) => {
    if (6 % n === 0) return opciones[i % n];
    return i < n ? opciones[i] : null;
  });
}

// Enlace para compartir: /dados#para=…&opcion=…&opcion=…  Va en el
// fragmento (#), como los retos de piedra, papel o tijera: el navegador no
// lo envía a ningún servidor, y las opciones pueden ser nombres de gente
// («¿Quién friega?»). Se lee igual de claro en un mensaje.
export function enlace(base, { para, opciones }) {
  const u = new URL(base);
  u.search = '';
  const p = new URLSearchParams();
  if (para) p.set('para', para);
  opciones.forEach((o) => p.append('opcion', o));
  u.hash = p.toString();
  return u.toString();
}

// Lee un enlace compartido (location.hash, con o sin #). null si no trae
// un dado válido: entonces la página se abre como siempre.
export function leerEnlace(hash) {
  let p;
  try {
    p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  } catch (e) {
    return null;
  }
  const lista = p.getAll('opcion');
  if (!lista.length) return null;
  const r = validar(p.get('para') ?? '', lista);
  return r.ok ? { para: r.para, opciones: r.opciones } : null;
}

// Lo guardado en localStorage: { para, opciones: [6 casillas] }. Las casillas
// conservan sus huecos para que el formulario vuelva tal cual se dejó.
export function leerGuardado(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.opciones)) return null;
  const casillas = Array.from({ length: MAX_OPCIONES }, (_, i) => limpiar(raw.opciones[i], OPCION_MAX));
  if (!casillas.some(Boolean) && !raw.para) return null;
  return { para: limpiar(raw.para, PARA_MAX), opciones: casillas };
}
