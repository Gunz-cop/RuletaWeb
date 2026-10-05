#!/usr/bin/env node
/**
 * Comprueba el giro de la ruleta (src/scripts/roulette/plan-giro.js), el
 * mismo módulo que usa la página: que cada giro pare en el gajo elegido y
 * que el ganador sea uniforme (χ² a α = 0,001) para varios números de
 * opciones, y que el recorrido siga en el rango de vueltas de siempre.
 * Las pruebas de uniformidad usan un generador con semilla para que el
 * resultado no cambie de una ejecución a otra: con crypto, un α de 0,001
 * haría fallar el CI de vez en cuando sin que nada se hubiera roto.
 */
import { planificarGiro, pasoDeGiro, indiceEnPuntero, enteroUniforme } from '../src/scripts/roulette/plan-giro.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

let semilla = 20261005;
const u32Semilla = () => (semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0);

// Valores críticos de χ² a α = 0,001 por grados de libertad (N - 1).
const CRITICO = { 1: 10.828, 2: 13.816, 5: 20.515, 6: 22.458, 12: 32.909 };

function girar(n, angulo, u32) {
  const plan = planificarGiro(n, angulo, u32);
  let a = angulo;
  let v = plan.velocidadInicial;
  let frames = 0;
  for (;;) {
    const paso = pasoDeGiro(a, v);
    a = paso.angulo;
    v = paso.velocidad;
    frames++;
    if (paso.parado) break;
  }
  return { plan, anguloReal: a, frames };
}

const GIROS = 10000;
const resumen = [];
for (const n of [2, 3, 6, 7, 13]) {
  const cuentas = new Array(n).fill(0);
  let fuera = 0;
  let vueltasMin = Infinity;
  let vueltasMax = 0;
  let angulo = 0;
  for (let i = 0; i < GIROS; i++) {
    const { plan, anguloReal } = girar(n, angulo, u32Semilla);
    cuentas[plan.ganador]++;
    if (indiceEnPuntero(anguloReal, n) !== plan.ganador) fuera++;
    // El ganador no puede quedar pegado a la línea entre dos gajos.
    const arco = (2 * Math.PI) / n;
    const enRueda = ((1.5 * Math.PI - anguloReal) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const pos = (enRueda / arco) % 1;
    check(pos > 0.1 && pos < 0.9, `N=${n}: giro ${i} para a ${pos.toFixed(3)} del gajo`);
    const vueltas = (anguloReal - angulo) / (2 * Math.PI);
    vueltasMin = Math.min(vueltasMin, vueltas);
    vueltasMax = Math.max(vueltasMax, vueltas);
    angulo = anguloReal; // el siguiente giro sale de donde quedó la rueda
  }
  check(fuera === 0, `N=${n}: ${fuera}/${GIROS} giros no paran en el gajo elegido`);
  check(vueltasMin >= 3.45 && vueltasMax <= 6.05, `N=${n}: vueltas fuera de rango (${vueltasMin.toFixed(2)}–${vueltasMax.toFixed(2)})`);
  const esperado = GIROS / n;
  const chi2 = cuentas.reduce((s, c) => s + (c - esperado) ** 2 / esperado, 0);
  check(chi2 < CRITICO[n - 1], `N=${n}: χ² = ${chi2.toFixed(2)} rechaza uniformidad (crítico ${CRITICO[n - 1]})`);
  const pct = cuentas.map((c) => (100 * c) / GIROS);
  resumen.push(`N=${n}: χ²=${chi2.toFixed(2)} (<${CRITICO[n - 1]}), ${Math.min(...pct).toFixed(2)}–${Math.max(...pct).toFixed(2)} % (esperado ${(100 / n).toFixed(2)} %), vueltas ${vueltasMin.toFixed(2)}–${vueltasMax.toFixed(2)}`);
}

// Muestreo por rechazo: con n = 3, 2**32 no se reparte exacto y el último
// valor (2**32 - 1) sesgaría el módulo; tiene que descartarse y leer otro.
{
  const n = 3;
  const valores = [4294967295, 4294967295, 1];
  let i = 0;
  const x = enteroUniforme(n, () => valores[i++]);
  check(x === 1 && i === 3, `enteroUniforme no rechaza la cola (devolvió ${x} tras ${i} lecturas)`);
}

// Con crypto real (lo que corre en la página): sin semilla, solo que paren bien.
{
  let fuera = 0;
  let angulo = 0;
  for (let i = 0; i < GIROS; i++) {
    const n = 2 + (i % 12);
    const { plan, anguloReal } = girar(n, angulo, undefined);
    if (indiceEnPuntero(anguloReal, n) !== plan.ganador) fuera++;
    angulo = anguloReal;
  }
  check(fuera === 0, `con crypto: ${fuera}/${GIROS} giros no paran en el gajo elegido`);
  resumen.push(`crypto: ${GIROS - fuera}/${GIROS} giros paran en el gajo elegido`);
}

if (fallos.length) {
  console.error(`ruleta-giro-check: ${fallos.length} fallo(s)`);
  fallos.slice(0, 20).forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('ruleta-giro-check: OK');
resumen.forEach((r) => console.log('  ' + r));
