#!/usr/bin/env node
/**
 * Paridad de tokens entre global.css y tailwind.css.
 *
 * AGENTS.md avisa de que los tokens están duplicados a propósito entre el
 * :root de global.css y el @theme de tailwind.css, y de que cambiar uno sin
 * el otro parte el sistema de diseño en dos. Ese aviso es una nota que hay
 * que recordar; esto lo convierte en algo que falla solo.
 *
 * Los nombres no coinciden entre los dos archivos (--text-secundary frente a
 * --color-ink-secondary), así que la correspondencia va explícita aquí abajo.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** global.css  ->  tailwind.css */
const PAIRS = {
  '--bg-body': '--color-ink',
  '--bg-surface': '--color-surface',
  '--bg-surface-alt': '--color-surface-alt',
  '--bg-surface-hover': '--color-surface-hover',
  '--bg-elevated': '--color-elevated',
  '--accent-coral': '--color-coral',
  '--accent-mint': '--color-mint',
  '--accent-purple': '--color-purple',
  '--accent-warm': '--color-warm',
  '--text-primary': '--color-ink-primary',
  '--text-secondary': '--color-ink-secondary',
  '--text-tertiary': '--color-ink-tertiary',
  '--accent-danger': '--color-danger',
  '--accent-success': '--color-success',
  '--radius-sm': '--radius-sm',
  '--radius-md': '--radius-md',
  '--radius-lg': '--radius-lg',
  '--radius-xl': '--radius-xl',
  '--shadow-sm': '--shadow-sm',
  '--shadow-md': '--shadow-md',
  '--shadow-lg': '--shadow-lg',
};

/** Lee las declaraciones de variables dentro del primer bloque que casa. */
function readVars(file, blockRe) {
  const css = readFileSync(join(ROOT, file), 'utf8');
  const block = css.match(blockRe);
  if (!block) throw new Error(`No encuentro el bloque de tokens en ${file}`);
  const vars = {};
  for (const m of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    // Solo interesa la divergencia real de valor, no la de formato:
    // rgba(0, 0, 0, 0.4) y rgba(0,0,0,.4) son el mismo negro.
    vars[m[1]] = m[2]
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ',')
      .replace(/\b0\.(\d)/g, '.$1')
      .toLowerCase();
  }
  return vars;
}

const site = readVars('src/styles/global.css', /:root\s*\{([\s\S]*?)\n\}/);
const theme = readVars('src/styles/tailwind.css', /@theme\s*\{([\s\S]*?)\n\}/);

const problems = [];
for (const [a, b] of Object.entries(PAIRS)) {
  if (!(a in site)) { problems.push(`${a} ya no existe en global.css`); continue; }
  if (!(b in theme)) { problems.push(`${b} ya no existe en el @theme de tailwind.css`); continue; }
  if (site[a] !== theme[b]) {
    problems.push(`${a} = ${site[a]}\n         ${b} = ${theme[b]}`);
  }
}

if (problems.length) {
  console.error('Tokens divergentes entre global.css y tailwind.css:\n');
  for (const p of problems) console.error('  ' + p);
  console.error(
    '\nLos dos archivos describen el mismo sistema de diseño. Un color o un\n' +
    'radio que cambia en uno tiene que cambiar en el otro, o `bg-surface` y\n' +
    'var(--bg-surface) dejan de significar lo mismo.'
  );
  process.exit(1);
}

console.log(`ok     ${Object.keys(PAIRS).length} tokens con el mismo valor en los dos archivos.`);
