#!/usr/bin/env node
/**
 * Comprueba la lógica pura del sorteo de amigo secreto
 * (src/scripts/amigo-secreto-logica.js, SDD de amigo secreto §2.1, §8 y §9):
 * cadena cerrada que respeta las exclusiones, uniformidad por los tres
 * caminos (rechazo, conteo exacto y con exclusiones de un solo sentido),
 * grupos grandes que siguen saliendo e imposibles demostrados.
 * Las pruebas estadísticas usan un generador con semilla: con crypto, un α de
 * 0,001 haría fallar el CI de vez en cuando sin que nada se hubiera roto.
 */
import {
  sortearCadena, matrizPermitidos, cadenaValida, contarCadenas, barajar, indiceAlAzar,
} from '../src/scripts/amigo-secreto-logica.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };
const resumen = [];

// mulberry32
let semilla = 20261008;
const rnd = () => {
  semilla = (semilla + 0x6d2b79f5) >>> 0;
  let t = semilla;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
};

// Valor crítico de χ² a α = 0,001 (Wilson–Hilferty, z = 3,0902).
const critico = (gl) => gl * (1 - 2 / (9 * gl) + 3.0902 * Math.sqrt(2 / (9 * gl))) ** 3;

// Cadena como texto, rotada para empezar en la persona 0.
const clave = (orden) => {
  const k = orden.indexOf(0);
  return [...orden.slice(k), ...orden.slice(0, k)].join(',');
};

// Todas las cadenas válidas (n pequeño): permutaciones de 1..n-1 tras el 0.
function todas(permitido) {
  const n = permitido.length;
  const out = [];
  const rec = (orden, libres) => {
    if (!libres.length) { if (cadenaValida(orden, permitido)) out.push(orden.join(',')); return; }
    for (const p of libres) rec([...orden, p], libres.filter((x) => x !== p));
  };
  rec([0], Array.from({ length: n - 1 }, (_, i) => i + 1));
  return out;
}

/* --- Utilidades de azar --- */
{
  const cuentas = new Array(7).fill(0);
  for (let i = 0; i < 70000; i++) cuentas[indiceAlAzar(7, rnd)]++;
  const x2 = cuentas.reduce((s, o) => s + (o - 10000) ** 2 / 10000, 0);
  check(x2 < critico(6), `indiceAlAzar(7) no es uniforme: χ² = ${x2.toFixed(1)}`);
  const b = barajar([1, 2, 3, 4], rnd);
  check(b.length === 4 && [1, 2, 3, 4].every((x) => b.includes(x)), 'barajar pierde o repite elementos');
}

/* --- Uniformidad por caso (SDD §2.1 y §8) --- */
const CASOS = [
  { nombre: '5 sin exclusiones', n: 5, grupos: [] },
  { nombre: '6 con 2 parejas', n: 6, grupos: [[0, 1], [2, 3]] },
  { nombre: '6 con grupo de 3', n: 6, grupos: [[0, 1, 2]] },
  { nombre: '8 con grupo de 4 y pareja', n: 8, grupos: [[0, 1, 2, 3], [4, 5]] },
  { nombre: '6 con exclusiones de un sentido', n: 6, grupos: [], unSentido: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { nombre: '9 con grupo de 4 y pareja (camino exacto)', n: 9, grupos: [[0, 1, 2, 3], [4, 5]], intentos: 0 },
];

for (const c of CASOS) {
  const permitido = matrizPermitidos(c.n, c.grupos, c.unSentido);
  const validas = todas(permitido);
  const K = validas.length;
  const conteo = contarCadenas(permitido);
  check(conteo.total === K, `${c.nombre}: el conteo exacto da ${conteo.total} y hay ${K} cadenas`);
  const muestras = K * 40; // ≥ 20 esperadas por cadena
  const obs = new Map(validas.map((v) => [v, 0]));
  let metodo = '';
  for (let i = 0; i < muestras; i++) {
    const r = sortearCadena(permitido, { rnd, intentos: c.intentos ?? undefined });
    metodo = r.metodo;
    const k = r.orden ? clave(r.orden) : 'nulo';
    if (!obs.has(k)) { check(false, `${c.nombre}: salió una cadena no válida (${k})`); break; }
    obs.set(k, obs.get(k) + 1);
  }
  const esp = muestras / K;
  const x2 = [...obs.values()].reduce((s, o) => s + (o - esp) ** 2 / esp, 0);
  const lim = critico(K - 1);
  check(x2 < lim, `${c.nombre}: χ² = ${x2.toFixed(1)} supera ${lim.toFixed(1)} (gl ${K - 1})`);
  resumen.push(`${c.nombre}: ${K} cadenas, ${muestras} sorteos (${metodo}), χ² ${x2.toFixed(1)} < ${lim.toFixed(1)}`);
}

/* --- El caso que antes salía sesgado: 10 con grupo de 5 y pareja --- */
{
  const permitido = matrizPermitidos(10, [[0, 1, 2, 3, 4], [5, 6]]);
  const K = contarCadenas(permitido).total;
  const muestras = K * 25;
  const obs = new Map();
  let metodos = new Set();
  for (let i = 0; i < muestras; i++) {
    // intentos: 0 fuerza el camino exacto, que es el que sustituye a la
    // búsqueda sesgada de antes.
    const r = sortearCadena(permitido, { rnd, intentos: 0 });
    metodos.add(r.metodo);
    check(r.orden && cadenaValida(r.orden, permitido), '10 con grupo de 5: cadena no válida');
    const k = clave(r.orden);
    obs.set(k, (obs.get(k) || 0) + 1);
  }
  const esp = muestras / K;
  let x2 = (K - obs.size) * esp; // cadenas que no salieron nunca
  for (const o of obs.values()) x2 += (o - esp) ** 2 / esp;
  const lim = critico(K - 1);
  check(x2 < lim, `10 con grupo de 5 y pareja: χ² = ${x2.toFixed(1)} supera ${lim.toFixed(1)}`);
  resumen.push(`10 con grupo de 5 y pareja: ${K} cadenas, ${muestras} sorteos (${[...metodos].join('+')}), χ² ${x2.toFixed(1)} < ${lim.toFixed(1)}`);
}

/* --- Cadena cerrada y exclusiones respetadas en sorteos aleatorios --- */
{
  let malos = 0;
  for (let i = 0; i < 10000; i++) {
    const n = 2 + indiceAlAzar(20, rnd);
    const grupos = [];
    const libres = barajar([...Array(n).keys()], rnd);
    while (libres.length >= 2 && indiceAlAzar(3, rnd) > 0) {
      const tam = 2 + indiceAlAzar(Math.min(3, libres.length - 1), rnd);
      grupos.push(libres.splice(0, tam));
    }
    const permitido = matrizPermitidos(n, grupos);
    const r = sortearCadena(permitido, { rnd, limiteMs: 200 });
    if (r.orden ? !cadenaValida(r.orden, permitido) : r.demostrado && todasPosibles(permitido)) malos++;
  }
  check(malos === 0, `${malos} de 10 000 sorteos aleatorios dieron una cadena no válida o un falso «imposible»`);
  resumen.push('10 000 sorteos aleatorios (2–21 personas, grupos de 2–4): cadenas cerradas y exclusiones respetadas');
}
function todasPosibles(permitido) {
  const c = permitido.length <= 18 ? contarCadenas(permitido) : null;
  return c ? c.total > 0 : false;
}

/* --- Grupos grandes con exclusiones apretadas siguen saliendo (SDD §9.8) --- */
for (const [n, grupos] of [
  [15, [[0, 1, 2, 3, 4, 5, 6], [7, 8, 9], [10, 11]]],
  [20, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14]]],
  [30, [[...Array(15).keys()], [15, 16, 17, 18, 19, 20, 21], [22, 23]]],
]) {
  const permitido = matrizPermitidos(n, grupos);
  const t = Date.now();
  const r = sortearCadena(permitido, { rnd });
  check(r.orden && cadenaValida(r.orden, permitido), `${n} personas con grupos apretados: no salió sorteo`);
  resumen.push(`${n} personas, grupo de ${grupos[0].length}: sale por ${r.metodo} en ${Date.now() - t} ms`);
}

/* --- Imposibles demostrados --- */
{
  const dos = sortearCadena(matrizPermitidos(4, [[0, 1, 2]]), { rnd });
  check(dos.orden === null && dos.demostrado, 'Grupo de 3 en 4 personas debería ser imposible demostrado');
  const sentido = sortearCadena(matrizPermitidos(3, [], [[0, 1], [0, 2]]), { rnd });
  check(sentido.orden === null && sentido.demostrado, 'Quien no puede regalar a nadie debería dar imposible demostrado');
  const uno = sortearCadena(matrizPermitidos(1), { rnd });
  check(uno.orden === null, 'Una sola persona no puede sortear');
  const parejaN2 = sortearCadena(matrizPermitidos(2), { rnd });
  check(parejaN2.orden && cadenaValida(parejaN2.orden, matrizPermitidos(2)), 'Dos personas se regalan entre sí');
}

/* --- Por encima del conteo exacto: la búsqueda se marca como no uniforme --- */
{
  const permitido = matrizPermitidos(20, [[...Array(10).keys()]]);
  const r = sortearCadena(permitido, { rnd, intentos: 0 });
  check(r.metodo === 'busqueda' && r.uniforme === false && cadenaValida(r.orden, permitido),
    'Con 20 personas y sin intentos de rechazo debería usar la búsqueda y marcarla no uniforme');
}

for (const l of resumen) console.log('  ' + l);
if (fallos.length) {
  console.error(`\namigo-secreto-check: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('amigo-secreto-check: todo en orden');
