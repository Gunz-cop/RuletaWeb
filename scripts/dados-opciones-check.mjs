#!/usr/bin/env node
/**
 * Comprueba el dado de opciones (src/scripts/dados-opciones.js): que valida
 * lo que escribe el visitante, que reparte las caras sin favorecer a
 * ninguna opción y que el enlace para compartir va y vuelve intacto.
 */
import { validar, carasDe, enlace, leerEnlace, leerGuardado, OPCION_MAX, PARA_MAX } from '../src/scripts/dados-opciones.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Validar ------------------------------------------------------------------------
check(!validar('', []).ok, 'sin opciones debería fallar');
check(!validar('', ['', '  ']).ok, 'casillas vacías no cuentan');
check(/una sola/.test(validar('', ['Pizza', '']).error ?? ''), 'una opción: el mensaje dice que hacen falta dos');
{
  const r = validar('  ¿Qué   cenamos? ', ['  Pizza ', '', 'Sushi  de  salmón', '']);
  check(r.ok && igual(r.opciones, ['Pizza', 'Sushi de salmón']), `limpia y salta huecos: ${JSON.stringify(r)}`);
  check(r.para === '¿Qué cenamos?', `para limpio: «${r.para}»`);
}
{
  const r = validar('x'.repeat(100), ['a'.repeat(100), 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  check(r.ok && r.opciones.length === 6, 'como mucho seis opciones');
  check(r.opciones[0].length === OPCION_MAX, `opción recortada a ${OPCION_MAX}`);
  check(r.para.length === PARA_MAX, `para recortado a ${PARA_MAX}`);
}
// Repetidas se permiten: es el visitante quien decide darle dos caras a una
check(validar('', ['Sí', 'Sí', 'No']).ok, 'opciones repetidas valen');

// --- Caras: ninguna opción pesa más que otra ----------------------------------------
for (let n = 2; n <= 6; n++) {
  const ops = Array.from({ length: n }, (_, i) => `op${i + 1}`);
  const caras = carasDe(ops);
  check(caras.length === 6, `${n} opciones: ${caras.length} caras`);
  const cuenta = ops.map((o) => caras.filter((c) => c === o).length);
  check(cuenta.every((c) => c === cuenta[0] && c >= 1), `${n} opciones: reparto desigual ${cuenta}`);
  const vacias = caras.filter((c) => c === null).length;
  check(vacias === (6 % n === 0 ? 0 : 6 - n), `${n} opciones: ${vacias} caras «otra vez»`);
}
// Caras opuestas (suman 7): distintas con dos opciones; con tres, cada
// opción ocupa un par opuesto y nunca se ve dos veces a la vez
const OPUESTAS = [[0, 5], [1, 4], [2, 3]];
{
  const c = carasDe(['A', 'B']);
  check(OPUESTAS.every(([i, j]) => c[i] !== c[j]), `2 opciones: caras opuestas iguales ${c}`);
  const t = carasDe(['A', 'B', 'C']);
  check(OPUESTAS.every(([i, j]) => t[i] === t[j]), `3 opciones: no van en caras opuestas ${t}`);
}

// --- Enlace: ida y vuelta -------------------------------------------------------------
{
  const dado = { para: '¿Qué cenamos? & más', opciones: ['Pizza', 'Sushi | maki', 'Arepas con queso', 'Ñoquis 100%'] };
  const url = enlace('https://decidelo.app/dados?viejo=1#x', dado);
  check(url.startsWith('https://decidelo.app/dados#'), `base del enlace: ${url}`);
  check(!url.includes('viejo') && !url.includes('#x') && !url.includes('?'), `todo va en el fragmento, sin la query ni el fragmento viejos: ${url}`);
  const vuelta = leerEnlace(new URL(url).hash);
  check(igual(vuelta, dado), `ida y vuelta: ${JSON.stringify(vuelta)}`);
  const sinPara = leerEnlace(new URL(enlace('https://decidelo.app/dados', { para: '', opciones: ['a', 'b'] })).hash);
  check(igual(sinPara, { para: '', opciones: ['a', 'b'] }), `sin para: ${JSON.stringify(sinPara)}`);
}
check(leerEnlace('') === null, 'sin fragmento: null');
check(leerEnlace('#reto=abc') === null, 'fragmento ajeno: null');
check(leerEnlace('#opcion=solo') === null, 'una opción en el enlace: null');
{
  const largo = '#' + Array.from({ length: 9 }, (_, i) => `opcion=${'z'.repeat(60)}${i}`).join('&');
  const r = leerEnlace(largo);
  check(r && r.opciones.length === 6 && r.opciones.every((o) => o.length === OPCION_MAX), 'enlace manipulado: recortado a 6 opciones de 24');
}

// --- Guardado ---------------------------------------------------------------------------
check(leerGuardado(null) === null, 'guardado vacío');
check(leerGuardado({ opciones: 'x' }) === null, 'guardado roto');
{
  const g = leerGuardado({ para: 'Plan', opciones: ['Cine', '', 'Parque'] });
  check(g && g.opciones.length === 6 && g.opciones[1] === '' && g.opciones[2] === 'Parque', `conserva los huecos: ${JSON.stringify(g)}`);
}

if (fallos.length) {
  console.error(`FALLA  dado de opciones: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error('  ' + f);
  process.exit(1);
}
console.log('ok     dado de opciones (validar, reparto de caras sin favorecer a ninguna, enlace de ida y vuelta, guardado)');
