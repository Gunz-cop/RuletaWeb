#!/usr/bin/env node
/**
 * Estilos computados en los estados que hay que provocar.
 *
 * El resto de tests miran la página en reposo. Este pulsa botones y comprueba
 * qué recibe cada elemento después, que es donde un refactor rompe cosas en
 * silencio: si una sección se mueve a un componente, su hash de scope cambia
 * y las reglas que se quedaron fuera dejan de encontrarla. El CSS sigue
 * emitiéndose igual, así que los snapshots no lo ven; el elemento, sí.
 *
 *   node scripts/estado-dom.mjs            verifica contra la línea base
 *   node scripts/estado-dom.mjs --update   reescribe la línea base
 */

import { createServer } from 'node:http';
import { readFile, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile as leer } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ESTADOS } from './lib/estados.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = join(ROOT, 'tests', 'estado-dom.json');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

function servir(dist) {
  const s = createServer(async (req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    for (const c of [join(dist, u), join(dist, u, 'index.html'), join(dist, u + '.html')]) {
      try {
        const b = await leer(c);
        res.writeHead(200, { 'Content-Type': MIME[extname(c)] ?? 'application/octet-stream' });
        return res.end(b);
      } catch { /* siguiente */ }
    }
    res.writeHead(404).end('no');
  });
  return new Promise((k) => s.listen(0, '127.0.0.1', () => k({ s, p: s.address().port })));
}

// Invariantes de geometría (rects), aparte del snapshot de estilos
// computados de arriba. No tienen "línea base" que actualizar: no son un
// valor que se espera que cambie con el diseño, son una relación que
// siempre tiene que cumplirse (un botón no puede quedar tapado, un panel
// position:fixed no puede moverse al scrollear). Por eso viven en su propio
// acumulador (`fallosInvariantes`) y hacen fallar el proceso en los dos
// modos, con o sin --update: actualizar la línea base no tiene sentido
// para "el botón GIRAR sigue tapado".
const fallosInvariantes = [];

async function medir() {
  if (!existsSync(DIST)) {
    console.error('No existe dist/. Ejecuta `npm run build` antes.');
    process.exit(1);
  }
  const { s, p } = await servir(DIST);
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  const salida = {};
  for (const est of ESTADOS) {
    // Un contexto nuevo por estado. El modo foco se recuerda en el navegador,
    // así que compartir contexto lo filtraba al estado siguiente y la línea
    // base acababa grabando un "reposo" con el hero ya oculto.
    const ctx = await nav.newContext({ viewport: est.viewport ?? { width: 1280, height: 900 } });
    // Sin red externa: las fuentes y los anuncios no cambian estas propiedades
    // y sí harían el resultado dependiente de la conexión.
    await ctx.route('**/*', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    const pagina = await ctx.newPage();
    await pagina.goto(`http://127.0.0.1:${p}${est.ruta}`, { waitUntil: 'load' });
    // Si el estado no llega a producirse, eso ya es el fallo: se anota y se
    // sigue, en vez de reventar el proceso con una excepción de Playwright
    // que no dice qué estado era ni deja correr los demás.
    try {
      for (const { sel, texto } of est.escribir ?? []) await pagina.fill(sel, texto);
      for (const sel of est.clics ?? []) await pagina.click(sel);
      if (est.esperarSelector) {
        await pagina.waitForSelector(est.esperarSelector, { timeout: 20000 });
      }
    } catch (e) {
      salida[`${est.ruta} [${est.nombre}]`] =
        `EL ESTADO NO SE PRODUJO: ${String(e.message).split('\n')[0]}`;
      await pagina.close();
      await ctx.close();
      continue;
    }
    if (est.clics?.length) await pagina.waitForTimeout(est.espera ?? 250);

    // verificarRelacion es la vía de escape para lo que un snapshot de
    // getComputedStyle no puede expresar: geometría relativa entre dos
    // elementos, o el mismo elemento antes/después de scrollear. Recibe la
    // página de Playwright directamente (este archivo no serializa a JSON,
    // así que puede llevar funciones de verdad) y hace su propia
    // interacción -- clic, scroll, lo que haga falta -- en vez de la
    // secuencia genérica de clics/comprobar de arriba.
    if (est.verificarRelacion) {
      const resultado = await est.verificarRelacion(pagina);
      salida[`${est.ruta} [${est.nombre}]`] = { relacion: resultado };
      if (!resultado.ok) {
        fallosInvariantes.push(`${est.ruta} [${est.nombre}]: ${resultado.mensaje}`);
      }
      await pagina.close();
      await ctx.close();
      continue;
    }

    const leer = () => pagina.evaluate((comprobar) => {
      const r = {};
      for (const { sel, props } of comprobar) {
        const el = document.querySelector(sel);
        if (!el) { r[sel] = 'NO EXISTE EN EL DOM'; continue; }
        const cs = getComputedStyle(el);
        r[sel] = Object.fromEntries(props.map((k) => [k, cs[k]]));
      }
      return r;
    }, est.comprobar ?? []);

    // Espera a que los valores dejen de moverse en vez de a un reloj fijo.
    // Una transición a medias da opacity: 0.998 y el test parpadea; esto lo
    // vimos con el modal del ganador, que aparece con un fundido.
    let previo = JSON.stringify(await leer());
    let medida = previo;
    for (let intento = 0; intento < 20; intento++) {
      await pagina.waitForTimeout(150);
      medida = JSON.stringify(await leer());
      if (medida === previo) break;
      previo = medida;
    }
    salida[`${est.ruta} [${est.nombre}]`] = JSON.parse(medida);

    await pagina.close();
    await ctx.close();
  }
  await nav.close();
  s.close();
  return salida;
}

const actual = await medir();
const texto = JSON.stringify(actual, null, 2) + '\n';

// Las invariantes de geometría se imprimen y hacen fallar el proceso pase
// lo que pase con la línea base de estilos computados -- ver el comentario
// junto a fallosInvariantes más arriba.
function reportarInvariantes() {
  if (!fallosInvariantes.length) return true;
  console.error(`\n${fallosInvariantes.length} invariante(s) de geometría fallan:`);
  for (const msg of fallosInvariantes) console.error(`FALLA  ${msg}`);
  return false;
}

if (process.argv.includes('--update')) {
  mkdirSync(dirname(BASE), { recursive: true });
  writeFileSync(BASE, texto);
  console.log(`Línea base de estados reescrita: ${Object.keys(actual).length} estados.`);
  if (!reportarInvariantes()) process.exit(1);
} else if (!existsSync(BASE)) {
  console.error('No hay línea base. Ejecuta `npm run test:estado -- --update`.');
  process.exit(1);
} else {
  const esperado = JSON.parse(readFileSync(BASE, 'utf8'));
  let fallos = 0;
  for (const [estado, elementos] of Object.entries(esperado)) {
    // Los estados que solo llevan verificarRelacion se guardan como
    // { relacion: {...} } y no entran en este diff: sus números (px de
    // getBoundingClientRect) varían un poco de una corrida a otra por
    // redondeo de subpíxel, y ya los valida reportarInvariantes() con
    // tolerancia -- compararlos aquí por igualdad exacta los volvería
    // intermitentes sin razón.
    if (elementos && typeof elementos === 'object' && 'relacion' in elementos) continue;
    for (const [sel, props] of Object.entries(elementos)) {
      const ahora = actual[estado]?.[sel];
      if (JSON.stringify(ahora) === JSON.stringify(props)) continue;
      fallos++;
      console.error(`FALLA  ${estado}  ${sel}`);
      console.error(`  esperado: ${JSON.stringify(props)}`);
      console.error(`  ahora:    ${JSON.stringify(ahora)}`);
    }
  }
  const invariantesOk = reportarInvariantes();
  if (fallos) {
    console.error(`\n${fallos} comprobación(es) de estado fallan. Una regla dejó de`);
    console.error('aplicarse a su elemento, aunque el CSS se siga emitiendo igual.');
  }
  if (fallos || !invariantesOk) process.exit(1);
  console.log(`ok     ${Object.keys(esperado).length} estados con los mismos estilos computados.`);
}
