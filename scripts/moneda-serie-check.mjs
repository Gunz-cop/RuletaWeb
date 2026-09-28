#!/usr/bin/env node
/**
 * Comprueba la lógica pura de la moneda (src/scripts/moneda-serie.js):
 * que las series terminan cuando deben, que el ganador es justo (~50/50)
 * y que los nombres regionales y resúmenes salen bien.
 *
 * Es el único código de herramienta sin DOM del sitio, así que se puede
 * probar con Node directamente, sin navegador.
 */
import { webcrypto } from 'node:crypto';
import {
  jugarSerie, lanzarVarias, resumenVarias, nombresPorIdioma, glifos, modoValido,
} from '../src/scripts/moneda-serie.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

const rnd = () => webcrypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

for (const n of [3, 5]) {
  const meta = Math.floor(n / 2) + 1;
  let gana = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) {
    const r = jugarSerie(n, rnd);
    check(r.tiros.length >= meta && r.tiros.length <= n, `mejor de ${n}: ${r.tiros.length} tiros`);
    check(r.marcador[r.ganador] === meta, `mejor de ${n}: el ganador no llegó a ${meta}`);
    check(r.marcador.heads + r.marcador.tails === r.tiros.length, `mejor de ${n}: marcador descuadrado`);
    if (r.ganador === 'heads') gana++;
  }
  const p = gana / N;
  check(p > 0.47 && p < 0.53, `mejor de ${n}: cara gana ${(p * 100).toFixed(1)}% (esperado ~50%)`);
}

// Secuencia fija: el orden de los tiros se respeta y la serie se corta a tiempo
const fija = (seq) => { let i = 0; return () => seq[i++]; };
const r = jugarSerie(3, fija([0.1, 0.9, 0.2, 0.9]));
check(r.tiros.join() === 'heads,tails,heads' && r.ganador === 'heads', 'mejor de 3 con secuencia fija');

check(lanzarVarias(5, rnd).length === 5, 'varias: cantidad');
check(resumenVarias(['heads', 'heads', 'tails'], 'sello') === '2 caras · 1 sello', 'resumen singular/plural');
check(resumenVarias(['tails', 'tails'], 'aguila') === '0 águilas · 2 soles', 'resumen águila/sol');

check(nombresPorIdioma('es-CO') === 'sello', 'es-CO → sello');
check(nombresPorIdioma('es-CR') === 'corona', 'es-CR → corona');
check(nombresPorIdioma('es-ES') === 'cruz', 'es-ES → cruz');
check(nombresPorIdioma(undefined) === 'cruz', 'sin idioma → cruz');
check(glifos('ceca').tails === 'Ce', 'cara/ceca con glifos distintos');
check(modoValido('<script>') === 'una', 'modo inválido');

if (fallos.length) {
  for (const f of fallos.slice(0, 20)) console.error(`FALLA  ${f}`);
  process.exit(1);
}
console.log('ok     lógica de la moneda (series, varias monedas, nombres regionales)');
