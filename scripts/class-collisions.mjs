#!/usr/bin/env node
/**
 * Colisiones entre las clases del proyecto y las utilidades de Tailwind.
 *
 * tailwind.css importa las utilidades SIN capa a propósito, para que puedan
 * ganarle a global.css (las razones están escritas allí). El efecto lateral
 * es que cuando una clase propia se llama igual que una utilidad —.container,
 * .delay-2, .sr-only— Tailwind la genera, la coloca después en la hoja y,
 * con la misma especificidad, gana ella. La clase del proyecto deja de hacer
 * lo que dice hacer, sin error de build y sin aviso.
 *
 * Este script compara los nombres de clase que define el CSS del proyecto
 * con lo que acaba emitido y avisa de los choques.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, flatRules } from './lib/css-parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Colisiones ya revisadas una a una y aceptadas. Cada entrada necesita un
 * motivo: si no se sabe por qué es inofensiva, no lo es.
 */
const ACEPTADAS = {
  'sr-only':
    'Tailwind gana, pero su versión oculta igual de bien (clip-path en vez de ' +
    'clip). Misma función, implementación más moderna.',
  'delay-1': 'Ver delay-2.',
  'delay-2':
    'Tailwind pisa transition-delay pero no animation-delay. Estas clases se ' +
    'usan siempre junto a .slide-up, que anima con @keyframes, así que el ' +
    'escalonado visible lo sigue marcando animation-delay. .reveal, que sí ' +
    'usa transition, se escalona con .reveal-delay-N, que Tailwind no genera.',
  'delay-3': 'Ver delay-2.',
  'delay-4': 'Ver delay-2.',
  'container':
    'PENDIENTE DE DECISIÓN, NO ES INOFENSIVA. El proyecto define ' +
    'max-width:1200px y la utilidad .container de Tailwind la sobrescribe con ' +
    'su escala (40/48/64/80/96rem). Medido: de 1024 a 1279px el contenedor ' +
    'queda en 1024px, hasta 176px más estrecho de lo diseñado; de 1280 a ' +
    '1535px pasa a 1280px; y a partir de 1536px se queda en 1536px, hasta ' +
    '336px más ancho, para cualquier pantalla por grande que sea. Viene del ' +
    'commit que integró Tailwind, no de la migración ' +
    'gradual. Arreglarlo cambia el aspecto actual en escritorio, así que es ' +
    'una decisión de producto: renombrar la clase propia, o asumir la escala ' +
    'de Tailwind.',
};

/**
 * Cuenta, por nombre de clase suelta, cuántas reglas la declaran. Compara
 * cuentas en lugar de contenidos: el CSS fuente y el minificado escriben lo
 * mismo de formas distintas (0.08s frente a 80ms), así que comparar cuerpos
 * daría falsos positivos. Si el bundle declara una clase más veces que el
 * código fuente, esas de más las puso Tailwind.
 */
function contarClases(css) {
  const cuenta = new Map();
  for (const { selector } of flatRules(stripComments(css))) {
    for (const parte of selector.split(',')) {
      // Solo clases sueltas: una utilidad nunca choca con un selector compuesto.
      const m = parte.trim().match(/^\.([a-z][a-z0-9-]*)(?::{1,2}[a-z-]+)?$/);
      if (m) cuenta.set(m[1], (cuenta.get(m[1]) ?? 0) + 1);
    }
  }
  return cuenta;
}

function cssDelProyecto() {
  let css = readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8');
  for (const dir of ['src/pages', 'src/components', 'src/layouts']) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (!f.endsWith('.astro')) continue;
      const src = readFileSync(join(ROOT, dir, f), 'utf8');
      for (const m of src.matchAll(/<style>([\s\S]*?)<\/style>/g)) css += '\n' + m[1];
    }
  }
  return css;
}

const distAstro = join(ROOT, 'dist/_astro');
let bundle;
try {
  const layout = readdirSync(distAstro).find((f) => /^Layout\..*\.css$/.test(f));
  bundle = readFileSync(join(distAstro, layout), 'utf8');
} catch {
  console.error('No encuentro la hoja global en dist/. Ejecuta `npm run build` antes.');
  process.exit(1);
}

const enFuente = contarClases(cssDelProyecto());
const enBundle = contarClases(bundle);

const choques = [];
for (const [nombre, nFuente] of enFuente) {
  const nBundle = enBundle.get(nombre) ?? 0;
  if (nBundle > nFuente) choques.push([nombre, nBundle - nFuente]);
}
choques.sort();

const nuevas = choques.filter(([n]) => !(n in ACEPTADAS));
const nombresChoque = new Set(choques.map(([n]) => n));
const obsoletas = Object.keys(ACEPTADAS).filter((n) => !nombresChoque.has(n));

for (const [n, extra] of choques) {
  if (n in ACEPTADAS) console.log(`aceptada  .${n} (+${extra} regla(s) de Tailwind)`);
  else console.error(`COLISIÓN  .${n} — Tailwind añade ${extra} regla(s) con este nombre`);
}
for (const n of obsoletas) {
  console.error(`SOBRA     .${n} está en ACEPTADAS pero ya no colisiona; quítala.`);
}

if (nuevas.length || obsoletas.length) {
  if (nuevas.length) {
    console.error(
      `\n${nuevas.length} colisión(es) nueva(s). Una clase del proyecto se llama igual\n` +
      'que una utilidad de Tailwind y, al importarse las utilidades sin capa,\n' +
      'gana la de Tailwind. Renombra la clase propia, o añádela a ACEPTADAS en\n' +
      'este script con el motivo por el que da igual.'
    );
  }
  process.exit(1);
}
console.log(`\n${choques.length} colisiones, todas revisadas.`);
