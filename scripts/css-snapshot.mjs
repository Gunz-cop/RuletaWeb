#!/usr/bin/env node
/**
 * Snapshot del CSS que realmente llega a cada página.
 *
 * El proyecto no tiene tests y la migración a Tailwind es gradual: se van
 * moviendo reglas de los <style> de página a global.css o a utilidades. El
 * riesgo de esa operación no es que el build falle —no falla— sino que una
 * regla cambie de valor sin que nadie lo note.
 *
 * Este script recoge, por página, TODAS las reglas CSS que el navegador va a
 * aplicar: las de las hojas enlazadas con <link> y las del <style> que Astro
 * inlinea cuando la hoja baja de 4 KB. Ese inline es la razón de que mirar
 * solo dist/_astro/*.css engañe: una página puede perder su archivo .css y
 * estar perfectamente, porque su CSS viajó dentro del HTML.
 *
 * Uso:
 *   node scripts/css-snapshot.mjs            verifica contra la línea base
 *   node scripts/css-snapshot.mjs --update   reescribe la línea base
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, splitTopLevel } from './lib/css-parse.mjs';
import { PAGINAS as PAGES } from './lib/paginas.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SNAP_DIR = join(ROOT, 'tests', 'css-snapshots');


const htmlPathFor = (page) =>
  page === 'index' ? join(DIST, 'index.html') : join(DIST, page, 'index.html');

/**
 * Astro añade [data-astro-cid-XXXX] a los selectores de un <style> de
 * componente. El hash cambia con el contenido del archivo, así que compararlo
 * tal cual daría diffs en cada edición. Se sustituye por [S], que conserva la
 * información que sí importa —la regla está scopeada, y por tanto pesa más en
 * la cascada— y descarta el hash volátil.
 */
const normalize = (css) => css.replace(/\[data-astro-cid-[a-z0-9]+\]/g, '[S]');

/**
 * Trocea una hoja en reglas de primer nivel. El troceo vive en lib/css-parse
 * porque contar llaves a pelo se rompe con `content: "}"`, que es CSS válido.
 */
const splitRules = (css) => splitTopLevel(stripComments(css)).map((b) => b.raw);

/**
 * Devuelve el CSS de una página separado en dos:
 *   global — la hoja compartida por todo el sitio (Layout.*.css)
 *   page   — el resto de <link> más el <style> inline
 * La separación evita repetir ~200 reglas idénticas en cada snapshot.
 */
function collect(page) {
  const html = readFileSync(htmlPathFor(page), 'utf8');
  const global = [], own = [];

  for (const m of html.matchAll(/<link[^>]*href="([^"]*\.css)"/g)) {
    const href = m[1];
    const css = readFileSync(join(DIST, href), 'utf8');
    (/\/Layout\.[^/]*\.css$/.test(href) ? global : own).push(...splitRules(css));
  }
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    own.push(...splitRules(m[1]));
  }
  return { global: global.map(normalize), page: own.map(normalize) };
}

function main() {
  const update = process.argv.includes('--update');

  if (!existsSync(DIST)) {
    console.error('No existe dist/. Ejecuta `npm run build` antes que los tests.');
    process.exit(1);
  }
  mkdirSync(SNAP_DIR, { recursive: true });

  const results = PAGES.map((p) => [p, collect(p)]);

  // La hoja global debe ser idéntica en todas las páginas; si no, la premisa
  // de este snapshot es falsa y el resto de la comparación no significa nada.
  const [, first] = results[0];
  for (const [page, { global }] of results) {
    if (global.join('\n') !== first.global.join('\n')) {
      console.error(`La hoja global de ${page} difiere de la de ${PAGES[0]}.`);
      process.exit(1);
    }
  }

  const files = [['_global', first.global], ...results.map(([p, r]) => [p, r.page])];
  let failed = 0;

  for (const [name, rules] of files) {
    const file = join(SNAP_DIR, name.replaceAll('/', '__') + '.txt');
    const actual = rules.join('\n') + '\n';

    if (update) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, actual);
      continue;
    }
    if (!existsSync(file)) {
      console.error(`FALTA  ${name} — sin línea base. Ejecuta \`npm run test:update\`.`);
      failed++;
      continue;
    }
    const expected = readFileSync(file, 'utf8');
    if (expected === actual) {
      console.log(`ok     ${name} (${rules.length} reglas)`);
      continue;
    }
    failed++;
    console.error(`FALLA  ${name}`);
    const exp = expected.trimEnd().split('\n'), act = actual.trimEnd().split('\n');
    const gone = exp.filter((r) => !act.includes(r));
    const added = act.filter((r) => !exp.includes(r));
    for (const r of gone.slice(0, 12)) console.error(`  -  ${r}`);
    for (const r of added.slice(0, 12)) console.error(`  +  ${r}`);
    if (gone.length + added.length > 24) {
      console.error(`  … y ${gone.length + added.length - 24} reglas más`);
    }
    if (!gone.length && !added.length) {
      console.error('  (mismas reglas, distinto orden — el orden afecta a la cascada)');
    }
  }

  if (update) {
    console.log(`Línea base reescrita: ${files.length} archivos en tests/css-snapshots/`);
    return;
  }
  if (failed) {
    console.error(
      `\n${failed} snapshot(s) con diferencias.\n` +
      'Si el cambio es intencionado, revisa el diff de arriba regla por regla\n' +
      'y actualiza la línea base con `npm run test:update`.'
    );
    process.exit(1);
  }
  console.log(`\n${files.length} snapshots sin cambios.`);
}

main();
