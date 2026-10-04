#!/usr/bin/env node
/**
 * Comprueba el lector de tiradas de rol (src/scripts/dados-notacion.js):
 * que entiende las tiradas que escribe un jugador, que rechaza las
 * inválidas con un mensaje que dice qué falla, y las reglas de ventaja,
 * desventaja y crear personaje.
 */
import { parsear, resolver, ventaja, sinElMenor, escribir } from '../src/scripts/dados-notacion.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Válidas ----------------------------------------------------------------------
const validas = [
  ['2d6+3', [{ signo: 1, cantidad: 2, lados: 6 }], 3, '2d6+3'],
  ['1d20+5', [{ signo: 1, cantidad: 1, lados: 20 }], 5, '1d20+5'],
  ['3d8-1', [{ signo: 1, cantidad: 3, lados: 8 }], -1, '3d8-1'],
  ['d20', [{ signo: 1, cantidad: 1, lados: 20 }], 0, '1d20'],
  [' 2 D 6 + 3 ', [{ signo: 1, cantidad: 2, lados: 6 }], 3, '2d6+3'],
  ['1d8+1d6+2', [{ signo: 1, cantidad: 1, lados: 8 }, { signo: 1, cantidad: 1, lados: 6 }], 2, '1d8+1d6+2'],
  ['1d20−1d4', [{ signo: 1, cantidad: 1, lados: 20 }, { signo: -1, cantidad: 1, lados: 4 }], 0, '1d20-1d4'],
  ['4d10+2-1', [{ signo: 1, cantidad: 4, lados: 10 }], 1, '4d10+1'],
  ['3+1d12', [{ signo: 1, cantidad: 1, lados: 12 }], 3, '1d12+3'],
  ['6d4', [{ signo: 1, cantidad: 6, lados: 4 }], 0, '6d4'],
];
for (const [texto, grupos, mod, normal] of validas) {
  const r = parsear(texto);
  check(r.ok, `«${texto}» debería valer y dice: ${r.error}`);
  if (!r.ok) continue;
  check(igual(r.grupos, grupos), `«${texto}»: grupos ${JSON.stringify(r.grupos)}`);
  check(r.mod === mod, `«${texto}»: modificador ${r.mod}, se esperaba ${mod}`);
  check(r.texto === normal, `«${texto}» se escribe «${r.texto}», se esperaba «${normal}»`);
}

// --- Inválidas: cada una con el trozo de mensaje que tiene que dar ------------------
const invalidas = [
  ['', 'Escribe una tirada'],
  ['   ', 'Escribe una tirada'],
  ['2d7', 'No hay dado de 7 caras'],
  ['1d100', 'No hay dado de 100 caras'],
  ['0d6', 'al menos un dado'],
  ['7d6', 'Como mucho 6 dados'],
  ['4d6+3d8', 'Como mucho 6 dados'],
  ['5', 'Falta el dado'],
  ['2d6+', 'Falta algo después del +'],
  ['2d6++3', 'Sobra un signo'],
  ['2d', 'Falta el número de caras'],
  ['2d6 x 3', 'No entiendo «x»'],
  ['1d20*2', 'No entiendo «*»'],
  ['2d6d8', 'Separa cada parte'],
  ['1d20+500', 'demasiado grande'],
  ['1d20+' + '1'.repeat(60), 'demasiado larga'],
];
for (const [texto, trozo] of invalidas) {
  const r = parsear(texto);
  check(!r.ok, `«${texto}» no debería valer`);
  if (!r.ok) check(r.error.includes(trozo), `«${texto}»: el mensaje «${r.error}» debería decir «${trozo}»`);
}

// --- Resultado y desglose ---------------------------------------------------------------
const t1 = parsear('1d20+5');
check(igual(resolver(t1, [[12]]), { total: 17, desglose: '12 + 5' }), `1d20+5 con 12: ${JSON.stringify(resolver(t1, [[12]]))}`);
const t2 = parsear('3d8-1');
check(igual(resolver(t2, [[2, 7, 4]]), { total: 12, desglose: '2 + 7 + 4 − 1' }), '3d8-1 con 2, 7, 4');
const t3 = parsear('1d20-1d4');
check(igual(resolver(t3, [[9], [3]]), { total: 6, desglose: '9 − 3' }), '1d20-1d4 con 9 y 3');
const t4 = parsear('2d6');
check(igual(resolver(t4, [[3, 5]]), { total: 8, desglose: '3 + 5' }), '2d6 con 3 y 5');
check(escribir([{ signo: 1, cantidad: 2, lados: 20 }]) === '2d20', 'escribir 2d20');

// --- Ventaja, desventaja, personaje --------------------------------------------------
check(igual(ventaja(4, 17, 'ventaja'), { valor: 17, descartado: 0 }), 'ventaja 4 y 17');
check(igual(ventaja(4, 17, 'desventaja'), { valor: 4, descartado: 1 }), 'desventaja 4 y 17');
check(ventaja(9, 9, 'ventaja').valor === 9, 'ventaja con empate');
check(igual(sinElMenor([3, 6, 2, 5]), { total: 14, descartado: 2 }), '4d6 sin el menor: 3 6 2 5');
check(igual(sinElMenor([4, 1, 1, 6]), { total: 11, descartado: 1 }), '4d6 con dos unos: descarta solo uno');
check(igual(sinElMenor([6, 6, 6, 6]), { total: 18, descartado: 0 }), '4d6 todo seis');

if (fallos.length) {
  console.error(`FALLA  notación de dados: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error('  ' + f);
  process.exit(1);
}
console.log(`ok     notación de dados (${validas.length} tiradas válidas, ${invalidas.length} inválidas con su mensaje, ventaja y personaje)`);
