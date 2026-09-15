#!/usr/bin/env node
/**
 * Garantía de contraste de la ruleta.
 *
 * generateContrastColors() (roulette.js) pinta cada gajo con
 * hsl(hue, S%, L%) rotando 360° de hue; wheel-canvas.js elige blanco o
 * negro para el texto de cada gajo según cuál dé más contraste (ver
 * colorTextoLegible allí). El peor caso posible de esa estrategia —
 * demostrado analíticamente y documentado en wheel-canvas.js— es 4.58:1,
 * por encima del umbral AA de texto normal (4.5:1), pero ESO SOLO VALE
 * mientras S y L se queden donde están hoy (58%, 46%). Si alguien sube la
 * luminosidad sin volver a hacer la cuenta, la garantía se rompe en
 * silencio: el comentario la sigue afirmando y nada más lo nota.
 *
 * Este script no repite esa cuenta a mano: lee la S/L reales de
 * roulette.js, barre los 360° de hue con esos valores y falla si algún
 * gajo, con el mejor texto posible entre blanco y negro, no llega a 4.5:1.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROULETTE_JS = join(ROOT, 'src', 'scripts', 'roulette.js');
const WHEEL_CANVAS_JS = join(ROOT, 'src', 'scripts', 'roulette', 'wheel-canvas.js');

const UMBRAL_AA_TEXTO_NORMAL = 4.5;

// --- Extraer S/L reales de generateContrastColors(), no una copia a mano ---
const rouletteSrc = readFileSync(ROULETTE_JS, 'utf8');
const m = rouletteSrc.match(/colors\.push\(`hsl\(\$\{hue\},\s*([\d.]+)%,\s*([\d.]+)%\)`\)/);
if (!m) {
  console.error(
    'No encuentro el patrón `colors.push(`hsl(${hue}, S%, L%)`)` en roulette.js.\n' +
    'Si generateContrastColors() cambió de forma, actualiza el regex de este script\n' +
    'antes de asumir que la paleta sigue siendo segura.'
  );
  process.exit(1);
}
const [, sStr, lStr] = m;
const S = Number(sStr);
const L = Number(lStr);

// --- Guardarraíl barato: que wheel-canvas.js siga eligiendo entre blanco Y
// negro (no un blanco fijo) para el texto de cada gajo. La cuenta de abajo
// solo tiene sentido si esta selección sigue existiendo. ---
const wheelCanvasSrc = readFileSync(WHEEL_CANVAS_JS, 'utf8');
if (!/#ffffff/.test(wheelCanvasSrc) || !/#000000/.test(wheelCanvasSrc)) {
  console.error(
    'wheel-canvas.js ya no parece elegir entre blanco (#ffffff) y negro\n' +
    '(#000000) para el texto de los gajos. Si volvió a un color de texto fijo,\n' +
    'la garantía de contraste de este script ya no aplica — hay que revisar\n' +
    'colorTextoLegible() y, si hace falta, este script también.'
  );
  process.exit(1);
}

// --- Misma matemática que colorTextoLegible() en wheel-canvas.js ---
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance([r, g, b]) {
  const canal = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
}

function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Barrido en pasos de 0.1° — más fino que los ~137.5° que separan gajos
// vecinos, así que no se cuela ningún hue real de generateContrastColors()
// entre dos muestras.
let peor = Infinity;
let peorHue = 0;
for (let hue = 0; hue < 360; hue += 0.1) {
  const L_rel = relativeLuminance(hslToRgb(hue, S, L));
  const mejorContraste = Math.max(contrastRatio(L_rel, 1), contrastRatio(L_rel, 0));
  if (mejorContraste < peor) {
    peor = mejorContraste;
    peorHue = hue;
  }
}

if (peor < UMBRAL_AA_TEXTO_NORMAL) {
  console.error(
    `El peor contraste texto/gajo con S=${S}% L=${L}% es ${peor.toFixed(2)}:1 ` +
    `(en hue≈${peorHue.toFixed(1)}°), por debajo del umbral AA de ${UMBRAL_AA_TEXTO_NORMAL}:1.\n` +
    'generateContrastColors() cambió de saturación/luminosidad sin volver a\n' +
    'verificar que el texto siga siendo legible sobre cada gajo posible.'
  );
  process.exit(1);
}

console.log(
  `ok     paleta de la ruleta (hsl(hue,${S}%,${L}%)): peor contraste texto/gajo ` +
  `${peor.toFixed(2)}:1 (hue≈${peorHue.toFixed(1)}°), por encima de ${UMBRAL_AA_TEXTO_NORMAL}:1.`
);
