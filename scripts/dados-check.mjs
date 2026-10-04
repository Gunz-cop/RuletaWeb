#!/usr/bin/env node
/**
 * Comprueba la física de los dados (src/scripts/dados-fisica.js) con muchas
 * tiradas al azar: que todos los dados se paran dentro de la mesa, planos
 * sobre una cara y apoyados, sin meterse uno dentro de otro, y que después
 * de renumerar la cara de arriba es siempre el valor elegido.
 */
import { simular, desdeLaMano, renumerar, caraArriba, Q } from '../src/scripts/dados-fisica.js';
import { forma, valorArriba, renumerarForma, LADOS } from '../src/scripts/dados-poliedros.js';

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

// --- Dados de rol ------------------------------------------------------------
const POR_TIPO = 300;
const resumen = [];
for (const lados of LADOS.filter((l) => l !== 6)) {
  const f = forma(lados);
  check(f.caras.length === (lados === 4 ? 4 : lados), `D${lados}: ${f.caras.length} caras`);
  check(Object.keys(f.dir).length === lados, `D${lados}: ${Object.keys(f.dir).length} valores`);
  let maxD = 0;
  for (let t = 0; t < POR_TIPO; t++) {
    const n = 1 + (t % 6);
    const s = n >= 4 ? 50 : n === 3 ? 62 : 70;
    const caja = { izquierda: -170 + s * 0.2, derecha: 170 - s * 0.2, fondo: -104, frente: 70 };
    const muestras = simular(desdeLaMano(n, caja, s, aleatorio), caja, s, f);
    maxD = Math.max(maxD, muestras[0].length / 60);
    const finales = muestras.map((m) => m[m.length - 1]);
    finales.forEach((fin, i) => {
      const h = s / 2;
      check(Math.abs(fin.x[2] - h * f.apoyo) < 0.5, `D${lados} tirada ${t}: dado ${i} no queda apoyado`);
      check(valorArriba(f, fin.q).z > 0.9999, `D${lados} tirada ${t}: dado ${i} no queda plano`);
      check(fin.x[0] > caja.izquierda && fin.x[0] < caja.derecha && fin.x[1] > caja.fondo && fin.x[1] < caja.frente,
        `D${lados} tirada ${t}: dado ${i} acaba fuera de la mesa`);
      for (let j = i + 1; j < finales.length; j++) {
        const d = Math.hypot(fin.x[0] - finales[j].x[0], fin.x[1] - finales[j].x[1]);
        check(d > s, `D${lados} tirada ${t}: dados ${i} y ${j} quedan montados`);
      }
      const v = 1 + Math.floor(aleatorio() * lados);
      const P = renumerarForma(f, fin.q, v, aleatorio);
      check(P && valorArriba(f, Q.mul(fin.q, P)).valor === v, `D${lados} tirada ${t}: renumerar a ${v} no lo deja arriba`);
    });
  }
  resumen.push(`D${lados} máx ${maxD.toFixed(1)} s`);
}

// --- Mesas mixtas (1d20+1d6+1d4…): cada dado con su forma -------------------------
const MIXTAS = 200;
for (let t = 0; t < MIXTAS; t++) {
  const n = 2 + (t % 5);
  const s = n >= 4 ? 50 : n === 3 ? 62 : 70;
  const caja = { izquierda: -170 + s * 0.2, derecha: 170 - s * 0.2, fondo: -104, frente: 70 };
  const tipos = Array.from({ length: n }, () => LADOS[Math.floor(aleatorio() * LADOS.length)]);
  const cuerpos = desdeLaMano(n, caja, s, aleatorio).map((c, i) => ({ ...c, forma: tipos[i] === 6 ? null : forma(tipos[i]) }));
  const muestras = simular(cuerpos, caja, s);
  const finales = muestras.map((m) => m[m.length - 1]);
  finales.forEach((fin, i) => {
    const f = cuerpos[i].forma;
    const plano = f ? valorArriba(f, fin.q).z : caraArriba(fin.q).z;
    check(plano > 0.9999, `mixta ${t}: el D${tipos[i]} no queda plano`);
    check(Math.abs(fin.x[2] - (s / 2) * (f ? f.apoyo : 1)) < 0.5, `mixta ${t}: el D${tipos[i]} no queda apoyado`);
    for (let j = i + 1; j < finales.length; j++) {
      check(Math.hypot(fin.x[0] - finales[j].x[0], fin.x[1] - finales[j].x[1]) > s, `mixta ${t}: dados ${i} y ${j} quedan montados`);
    }
  });
}

// --- Dado de opciones: uno solo y más grande (88 px en móvil, 104 en escritorio) ------
// Con las medidas de mesa que calcula caja() en dados.js para una bandeja de
// 360 px y otra de 672 px
// También que ruede: un dado que aterriza y se arrastra sin cambiar de cara
// arriba se ve como una caja de cartón. Antes de darle giro de verdad al
// salir de la mano pasaba en 4 de cada 10 tiradas del dado de opciones.
const OPCIONES = 200;
let arrastrados = 0;
for (let t = 0; t < OPCIONES; t++) {
  const movil = t % 2 === 0;
  const s = movil ? 88 : 104;
  const mitad = (movil ? 180 : 320) - s * 0.6;
  const caja = { izquierda: -mitad, derecha: mitad, fondo: movil ? -104 : -124, frente: s * 0.9 + 20 };
  const [lista] = simular(desdeLaMano(1, caja, s, aleatorio), caja, s);
  const f = lista[lista.length - 1];
  let cambios = 0;
  let arriba = caraArriba(lista[0].q).cara;
  for (const m of lista) {
    const c = caraArriba(m.q).cara;
    if (c !== arriba) { cambios++; arriba = c; }
  }
  if (cambios <= 1) arrastrados++;
  check(Math.abs(f.x[2] - s / 2) < 0.5, `opciones ${t} (${s} px): no queda apoyado`);
  check(caraArriba(f.q).z > 0.9999, `opciones ${t} (${s} px): no queda plano`);
  check(f.x[0] > caja.izquierda && f.x[0] < caja.derecha && f.x[1] > caja.fondo && f.x[1] < caja.frente,
    `opciones ${t} (${s} px): acaba fuera de la mesa (${f.x[0].toFixed(0)}, ${f.x[1].toFixed(0)})`);
}

check(arrastrados / OPCIONES < 0.2, `dado de opciones: ${arrastrados} de ${OPCIONES} tiradas se arrastran sin volcar (cambian de cara arriba una vez o ninguna)`);

if (fallos.length) {
  console.error(`FALLA  física de los dados: ${fallos.length} fallo(s)`);
  for (const f of fallos.slice(0, 15)) console.error('  ' + f);
  process.exit(1);
}
console.log(`ok     física de los dados (${TIRADAS} tiradas: se paran planos, dentro de la mesa, sin montarse; duración media ${(duracionTotal / TIRADAS).toFixed(2)} s, máx ${duracionMax.toFixed(2)} s; y ${POR_TIPO} por tipo de dado de rol: ${resumen.join(', ')}; y ${MIXTAS} mesas con tipos mezclados; y ${OPCIONES} dados de opciones grandes, ${Math.round((arrastrados / OPCIONES) * 100)}% sin volcar)`);
