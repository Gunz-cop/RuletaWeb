#!/usr/bin/env node
/**
 * Garantía de contraste de la ruleta (SDD de la ruleta, RNF-07).
 *
 * La paleta «Pastel vivo» vive como variables locales `--wheel-p0…p7` en
 * Wheel.astro y las etiquetas llevan la tinta `--wheel-tinta`. Este script no
 * repite esos colores a mano: los lee del componente, de modo que cambiar un
 * tono sin volver a hacer la cuenta rompe el test en vez de romper la
 * legibilidad en silencio.
 *
 * Se mide cada tono en los dos estados en que se ve una etiqueta:
 *   - a todo color (reposo y giro), y
 *   - atenuado (cuando hay ganador, el resto de gajos queda con la capa oscura
 *     al 30 %: opacidad 0,7 sobre el fondo del rotor, `--bg-surface`).
 * Umbral AA de texto normal: 4,5:1.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WHEEL = readFileSync(join(ROOT, 'src', 'components', 'Wheel.astro'), 'utf8');
const GLOBAL = readFileSync(join(ROOT, 'src', 'styles', 'global.css'), 'utf8');

const UMBRAL_AA_TEXTO_NORMAL = 4.5;
const OPACIDAD_ATENUADA = 0.7; // `.has-ganador .wheel-slice:not(.is-ganador)` en Wheel.astro

const variable = (fuente, nombre) => {
  const m = fuente.match(new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6})\\b`));
  return m ? m[1] : null;
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const tinta = variable(WHEEL, '--wheel-tinta');
const fondoRotor = variable(GLOBAL, '--bg-surface');
const tonos = Array.from({ length: 8 }, (_, i) => variable(WHEEL, `--wheel-p${i}`));
if (!tinta || !fondoRotor || tonos.some((t) => !t)) {
  console.error(
    'No encuentro la paleta de la ruleta en Wheel.astro (--wheel-p0…p7 y --wheel-tinta, en #rrggbb)\n' +
    'o --bg-surface en global.css. Si cambiaron de forma, actualiza este script antes de\n' +
    'asumir que las etiquetas siguen siendo legibles.'
  );
  process.exit(1);
}
const opacidadOk = new RegExp(`has-ganador[^{]*\\{\\s*opacity:\\s*${OPACIDAD_ATENUADA}\\s*;`).test(WHEEL);
if (!opacidadOk) {
  console.error(
    `Wheel.astro ya no atenúa los gajos no ganadores con opacity: ${OPACIDAD_ATENUADA}.\n` +
    'Si la atenuación cambió, actualiza OPACIDAD_ATENUADA: el contraste de abajo depende de ella.'
  );
  process.exit(1);
}

function luminancia([r, g, b]) {
  const canal = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
}
const contraste = (a, b) => {
  const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mezcla = (color, fondo, opacidad) => color.map((c, i) => c * opacidad + fondo[i] * (1 - opacidad));

const t = hex(tinta), f = hex(fondoRotor);
let peorPleno = Infinity, peorAtenuado = Infinity, peorTono = '';
const fallos = [];
tonos.forEach((tono, i) => {
  const color = hex(tono);
  const pleno = contraste(t, color);
  const atenuado = contraste(t, mezcla(color, f, OPACIDAD_ATENUADA));
  if (pleno < peorPleno) peorPleno = pleno;
  if (atenuado < peorAtenuado) { peorAtenuado = atenuado; peorTono = `p${i} ${tono}`; }
  if (pleno < UMBRAL_AA_TEXTO_NORMAL) fallos.push(`p${i} ${tono}: ${pleno.toFixed(2)}:1 a todo color`);
  if (atenuado < UMBRAL_AA_TEXTO_NORMAL) fallos.push(`p${i} ${tono}: ${atenuado.toFixed(2)}:1 atenuado`);
});

if (fallos.length) {
  console.error(`Contraste de la ruleta por debajo de ${UMBRAL_AA_TEXTO_NORMAL}:1 con la tinta ${tinta}:`);
  fallos.forEach((m) => console.error(`  ${m}`));
  process.exit(1);
}

console.log(
  `ok     paleta de la ruleta (${tonos.length} tonos, tinta ${tinta}): peor contraste ` +
  `${peorPleno.toFixed(2)}:1 a todo color y ${peorAtenuado.toFixed(2)}:1 atenuado (${peorTono}), ` +
  `por encima de ${UMBRAL_AA_TEXTO_NORMAL}:1.`
);
