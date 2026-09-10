#!/usr/bin/env node
/**
 * Diferencias visuales entre dos versiones del sitio.
 *
 * Los tests de CSS comparan reglas: dicen que una declaración cambió de valor.
 * No dicen si la página se ve bien. Esto sí: construye dos versiones, las
 * fotografía en varios anchos y compara los píxeles.
 *
 * No guarda imágenes de referencia en el repositorio. Una línea base en PNG
 * son megabytes que envejecen mal y que hay que regenerar a cada retoque; aquí
 * la referencia se construye en el momento a partir de una rama. Sale más
 * lento —son dos builds— pero no engorda el repositorio y nunca está caduca.
 *
 *   node scripts/visual-diff.mjs                 compara con main
 *   node scripts/visual-diff.mjs --base HEAD~1   compara con el commit anterior
 *   node scripts/visual-diff.mjs --umbral 0.02   tolerancia, por defecto 0
 *
 * Las diferencias se guardan como PNG en .visual-diff/salida/.
 */

import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRABAJO = join(ROOT, '.visual-diff');
const SALIDA = join(TRABAJO, 'salida');

/**
 * El chromium de este entorno no lo gestiona Playwright, así que hay que
 * señalarlo a mano. En otra máquina, con `npx playwright install` hecho,
 * basta con no definir la variable.
 */
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;

/** Anchos elegidos por lo que revela cada uno, no por redondez. */
const ANCHOS = [
  { nombre: 'movil', width: 390, height: 844 },     // iPhone, el grueso del tráfico
  { nombre: 'tablet', width: 768, height: 1024 },   // el borde exacto del breakpoint
  { nombre: 'escritorio', width: 1280, height: 900 },
  { nombre: 'ancho', width: 1536, height: 900 },    // donde .container se desmadra
];

const PAGINAS = [
  '/', '/amigo-secreto', '/dados', '/equipos', '/moneda', '/numeros',
  '/piedra-papel-tijera', '/si-o-no', '/temporizador',
  '/contacto', '/sobre', '/blog', '/blog/moneda/decision-moneda',
];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.json': 'application/json', '.xml': 'application/xml', '.woff2': 'font/woff2',
};

function servir(dist) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    for (const candidato of [join(dist, url), join(dist, url, 'index.html'), join(dist, url + '.html')]) {
      try {
        const cuerpo = await readFile(candidato);
        res.writeHead(200, { 'Content-Type': MIME[extname(candidato)] ?? 'application/octet-stream' });
        return res.end(cuerpo);
      } catch { /* siguiente candidato */ }
    }
    res.writeHead(404).end('no');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, puerto: server.address().port })));
}

async function capturar(dist, etiqueta) {
  const { server, puerto } = await servir(dist);
  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  const capturas = new Map();

  for (const vp of ANCHOS) {
    const ctx = await navegador.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });

    // Nada de red externa: fuentes de Google y AdSense harían las capturas
    // dependientes de la conexión y del momento. Se bloquean en las dos
    // versiones por igual, así que la comparación sigue siendo justa; lo que
    // no se puede sacar de aquí es cómo se ve la tipografía real.
    await ctx.route('**/*', (ruta) => {
      const u = new URL(ruta.request().url());
      return u.hostname === '127.0.0.1' ? ruta.continue() : ruta.abort();
    });

    for (const ruta of PAGINAS) {
      const pagina = await ctx.newPage();
      await pagina.goto(`http://127.0.0.1:${puerto}${ruta}`, { waitUntil: 'load' });

      // .reveal aparece cuando un observador de scroll le pone .revealed. En
      // una captura de página completa nunca llega a dispararse para lo que
      // está por debajo del pliegue, así que se marca a mano: se ejercita el
      // CSS real, no se falsea con !important.
      await pagina.evaluate(() => {
        for (const el of document.querySelectorAll('.reveal')) el.classList.add('revealed');
      });
      // Deja que el layout se asiente tras añadir la clase.
      await pagina.waitForTimeout(120);

      const png = await pagina.screenshot({
        fullPage: true,
        // Congela transiciones y lleva las animaciones finitas a su estado
        // final, que es justo lo que .slide-up deja con animation-fill-mode.
        animations: 'disabled',
        caret: 'hide',
      });
      capturas.set(`${ruta}|${vp.nombre}`, png);
      await pagina.close();
    }
    await ctx.close();
  }

  await navegador.close();
  server.close();
  console.log(`   ${etiqueta}: ${capturas.size} capturas`);
  return capturas;
}

/** Construye `ref` en un worktree aparte y devuelve su dist/. */
function construirBase(ref) {
  const arbol = join(TRABAJO, 'base');
  // Limpia un worktree de una ejecución anterior. Falla si no hay ninguno,
  // que es el caso normal la primera vez, así que el error se ignora.
  try {
    execFileSync('git', ['worktree', 'remove', '--force', arbol], { cwd: ROOT, stdio: 'ignore' });
  } catch { /* no había nada que limpiar */ }
  execFileSync('git', ['worktree', 'add', '--detach', arbol, ref], { cwd: ROOT, stdio: 'ignore' });
  // node_modules pesa y tarda; el worktree usa el del repositorio principal.
  execFileSync('ln', ['-sfn', join(ROOT, 'node_modules'), join(arbol, 'node_modules')]);
  execFileSync('npx', ['astro', 'build'], { cwd: arbol, stdio: 'ignore' });
  return join(arbol, 'dist');
}

const args = process.argv.slice(2);
const valor = (bandera, pordefecto) => {
  const i = args.indexOf(bandera);
  return i === -1 ? pordefecto : args[i + 1];
};
const base = valor('--base', 'main');
const umbral = Number(valor('--umbral', '0'));

if (!existsSync(join(ROOT, 'dist'))) {
  console.error('No existe dist/. Ejecuta `npm run build` antes.');
  process.exit(1);
}

await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

console.log(`Construyendo la referencia (${base})…`);
const distBase = construirBase(base);

console.log('Capturando…');
const antes = await capturar(distBase, `base ${base}`);
const ahora = await capturar(join(ROOT, 'dist'), 'árbol actual');

let distintas = 0, iguales = 0;
const informe = [];

for (const [clave, pngAntes] of antes) {
  const pngAhora = ahora.get(clave);
  const [ruta, ancho] = clave.split('|');
  const a = PNG.sync.read(pngAntes);
  const b = PNG.sync.read(pngAhora);

  if (a.width !== b.width || a.height !== b.height) {
    distintas++;
    informe.push(`  ${ruta} @${ancho}: la página cambia de tamaño, ${a.width}x${a.height} -> ${b.width}x${b.height}`);
    continue;
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const pixeles = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const proporcion = pixeles / (a.width * a.height);

  if (proporcion > umbral) {
    distintas++;
    const nombre = (ruta === '/' ? 'index' : ruta.slice(1).replaceAll('/', '__')) + `__${ancho}`;
    await writeFile(join(SALIDA, `${nombre}.diff.png`), PNG.sync.write(diff));
    await writeFile(join(SALIDA, `${nombre}.antes.png`), pngAntes);
    await writeFile(join(SALIDA, `${nombre}.ahora.png`), pngAhora);
    informe.push(`  ${ruta} @${ancho}: ${pixeles} píxeles (${(proporcion * 100).toFixed(3)}%)`);
  } else {
    iguales++;
  }
}

console.log(`\n${iguales} capturas idénticas, ${distintas} con diferencias.`);
if (distintas) {
  console.log('\nDiferencias:');
  for (const l of informe) console.log(l);
  console.log(`\nImágenes en ${SALIDA} (antes / ahora / diff por cada una).`);
  process.exit(1);
}
