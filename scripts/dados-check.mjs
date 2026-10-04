#!/usr/bin/env node
/**
 * Comprueba la física de los dados (src/scripts/dados-fisica.js) con muchas
 * tiradas al azar: que todos los dados se paran dentro de la mesa, planos
 * sobre una cara y apoyados, sin meterse uno dentro de otro, y que después
 * de renumerar la cara de arriba es siempre el valor elegido.
 */
import { simular, desdeLaMano, renumerar, caraArriba, Q } from '../src/scripts/dados-fisica.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };
let semilla = 12345;
const aleatorio = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);

const TIRADAS = 600;
let duracionMax = 0;
let duracionTotal = 0;
for (let t = 0; t < TIRADAS; t++) {
  const n = 1 + (t % 6);
  const s = n >= 4 ? 50 : n === 3 ? 62 : 70;
  const caja = { izquierda: -170 + s * 0.2, derecha: 170 - s * 0.2, fondo: -104, frente: 70 };
  const muestras = simular(desdeLaMano(n, caja, s, aleatorio), caja, s);
  const finales = muestras.map((m) => m[m.length - 1]);
  const dura = muestras[0].length / 60;
  duracionMax = Math.max(duracionMax, dura);
  duracionTotal += dura;
  finales.forEach((f, i) => {
    const h = s / 2;
    check(Math.abs(f.x[2] - h) < 0.5, `tirada ${t}: dado ${i} no queda apoyado (z=${f.x[2].toFixed(1)})`);
    check(caraArriba(f.q).z > 0.9999, `tirada ${t}: dado ${i} no queda plano`);
    check(f.x[0] > caja.izquierda && f.x[0] < caja.derecha && f.x[1] > caja.fondo && f.x[1] < caja.frente,
      `tirada ${t}: dado ${i} acaba fuera de la mesa (${f.x[0].toFixed(0)}, ${f.x[1].toFixed(0)})`);
    for (let j = i + 1; j < finales.length; j++) {
      const d = Math.hypot(f.x[0] - finales[j].x[0], f.x[1] - finales[j].x[1]);
      check(d > s * 1.2, `tirada ${t}: dados ${i} y ${j} quedan montados (${(d / s).toFixed(2)} lados)`);
    }
    for (let v = 1; v <= 6; v++) {
      const P = renumerar(f.q, v, aleatorio);
      check(caraArriba(Q.mul(f.q, P)).cara === v, `tirada ${t}: renumerar a ${v} no deja el ${v} arriba`);
    }
  });
}

if (fallos.length) {
  console.error(`FALLA  física de los dados: ${fallos.length} fallo(s)`);
  for (const f of fallos.slice(0, 15)) console.error('  ' + f);
  process.exit(1);
}
console.log(`ok     física de los dados (${TIRADAS} tiradas: se paran planos, dentro de la mesa, sin montarse; duración media ${(duracionTotal / TIRADAS).toFixed(2)} s, máx ${duracionMax.toFixed(2)} s)`);
