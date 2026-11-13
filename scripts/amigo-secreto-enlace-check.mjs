#!/usr/bin/env node
/**
 * Comprueba los enlaces y el sorteo guardado de amigo secreto
 * (src/scripts/amigo-secreto-enlace.js, SDD de amigo secreto §5 y RF-13):
 * - todo enlace v1 de tests/fixtures/amigo-secreto-enlaces-v1.json (generados
 *   con el encryptName de 2026) abre el nombre correcto, y cualquiera que el
 *   lector viejo abría lo sigue abriendo igual;
 * - v2 de ida y vuelta, con tildes, emoji y detalles; dañado o truncado se
 *   detecta; longitud por debajo del objetivo;
 * - el sorteo guardado con el formato viejo se migra sin tocar sus URLs.
 */
import fs from 'node:fs';
import {
  leerV1, crearV2, leerV2, leerEnlace, urlV2, migrarGuardado, cargarGuardado, guardar, borrarGuardado,
  CLAVE_GUARDADO, CLAVE_GUARDADO_V1, CLAVE_BORRADOR, cargarBorrador, guardarBorrador, borrarBorrador,
} from '../src/scripts/amigo-secreto-enlace.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };
const BASE = 'https://decidelo.app/amigo-secreto';

// El lector de antes, copiado tal cual (amigo-secreto.js, commit 016d8d9).
function lectorViejo(href) {
  const u = new URL(href);
  const enc = new URLSearchParams(u.hash.slice(1)).get('revelar') || u.searchParams.get('revelar');
  try {
    const key = 'decidelo';
    const decodedB64 = atob(decodeURIComponent(enc));
    let xor = '';
    for (let i = 0; i < decodedB64.length; i++) xor += String.fromCharCode(decodedB64.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return decodeURIComponent(escape(xor));
  } catch { return null; }
}

/* --- v1 --- */
const { casos } = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/amigo-secreto-enlaces-v1.json', import.meta.url)));
let abiertos = 0, arreglados = 0;
for (const c of casos) {
  const r = await leerEnlace(c.url);
  const viejo = lectorViejo(c.url);
  check(r && r.formato === 'v1' && r.datos?.nombre === c.nombre, `v1 ${c.forma} «${c.nombre}»: dio ${JSON.stringify(r)}`);
  if (viejo !== null) check(r?.datos?.nombre === viejo, `v1 ${c.forma} «${c.nombre}»: el lector viejo daba «${viejo}» y el nuevo otra cosa`);
  if (r?.datos?.nombre === c.nombre) abiertos++;
  if (viejo !== c.nombre && r?.datos?.nombre === c.nombre) arreglados++;
}
check(leerV1('%%%') === null && leerV1('') === null, 'leerV1 debería dar null con basura');
const roto = await leerEnlace(`${BASE}#revelar=no-es-base64!!`);
check(roto && roto.error === 'dañado', 'Un v1 roto debería dar error «dañado»');
check(await leerEnlace(BASE) === null, 'Sin enlace debería dar null');
check(await leerEnlace(`${BASE}#acerca`) === null, 'Un ancla normal no es un enlace');

/* --- v2 --- */
const completo = { nombre: 'Ñandú José 🎁', grupo: 'Oficina', presupuesto: '50000', fecha: '2026-12-19', lugar: 'Casa de Ana', mensaje: 'Nada de medias', pista: 'Le gusta el café' };
const d = await crearV2(completo);
const leido = await leerV2(d);
check(JSON.stringify(leido) === JSON.stringify(completo), `v2 ida y vuelta falla: ${JSON.stringify(leido)}`);
const r2 = await leerEnlace(urlV2(BASE, d));
check(r2?.formato === 'v2' && r2.datos.nombre === completo.nombre, 'leerEnlace no reconoce un v2');
check(/^[A-Za-z0-9_-]+$/.test(d), 'v2 debe ser base64url sin relleno');

// «de» (a quién va dirigido) viaja en el enlace, y un enlace sin él se sigue leyendo.
const conDe = await leerV2(await crearV2({ ...completo, de: 'Ana' }));
check(conDe?.de === 'Ana' && conDe.nombre === completo.nombre, `v2 con destinatario: ${JSON.stringify(conDe)}`);
check(leido.de === undefined, 'Un v2 sin destinatario no debería inventarlo');

const corto = urlV2(BASE, await crearV2({ nombre: 'María José Rodríguez', de: 'Juan Sebastián Gómez' }));
check(corto.length < 200, `Enlace v2 sin detalles de ${corto.length} caracteres (objetivo < 200)`);

const truncado = await leerEnlace(urlV2(BASE, d.slice(0, -6)));
check(truncado?.error === 'dañado', 'Un v2 truncado debería detectarse');
const alterado = d.slice(0, 40) + (d[40] === 'A' ? 'B' : 'A') + d.slice(41);
check((await leerV2(alterado)) === null, 'Un v2 con un carácter cambiado debería detectarse');
check((await leerEnlace(`${BASE}#v=9&d=abc`))?.error === 'desconocido', 'Versión desconocida debería dar error');
check((await leerV2(d)) !== null && (await leerV2('')) === null, 'leerV2 vacío debería dar null');
let lanzo = false;
try { await crearV2({ nombre: '  ' }); } catch { lanzo = true; }
check(lanzo, 'crearV2 sin nombre debería lanzar');

/* --- Sorteo guardado (RF-13) --- */
const viejo = {
  date: 1764000000000, text: 'Ana\nBruno, 3001234567\nCarla', exclusions: 'Ana, Bruno',
  matrixRows: [{ giverAnon: 'Participante #2', receiverAnon: 'Participante #1' }],
  links: [
    { name: 'Ana', contact: '', url: casos[0].url, sent: true },
    { name: 'Bruno', contact: '3001234567', url: casos[2].url, sent: false },
  ],
};
const m = migrarGuardado(viejo);
check(m && m.version === 2 && m.enlaces.length === 2, 'migrarGuardado no migra el formato viejo');
check(m.enlaces[0].url === viejo.links[0].url && m.enlaces[1].url === viejo.links[1].url, 'La migración cambió una URL ya enviada');
check(m.enlaces[0].enviado === true && m.enlaces[1].enviado === false, 'La migración perdió el estado «enviado»');
check(m.texto === viejo.text && m.exclusiones === viejo.exclusions, 'La migración perdió texto o exclusiones');
check(migrarGuardado({ links: 'x' }) === null && migrarGuardado(null) === null, 'Basura debería dar null');
check(migrarGuardado({ date: 1, text: 'a', matrixRows: [], links: [] })?.exclusiones === '', 'Sin exclusiones (sorteos muy viejos) debería dar cadena vacía');

const mem = new Map();
const almacen = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
mem.set(CLAVE_GUARDADO_V1, JSON.stringify(viejo));
check(cargarGuardado(almacen)?.enlaces[0].url === viejo.links[0].url, 'cargarGuardado no lee la clave vieja');
guardar(almacen, { ...m, enlaces: [{ ...m.enlaces[0], enviado: false }] });
check(cargarGuardado(almacen)?.enlaces[0].enviado === false, 'La clave nueva debería mandar sobre la vieja');
borrarGuardado(almacen);
check(!mem.has(CLAVE_GUARDADO) && !mem.has(CLAVE_GUARDADO_V1), 'borrarGuardado debería borrar las dos claves');

/* --- Borrador --- */
check(cargarBorrador(almacen) === null, 'Sin borrador debería dar null');
guardarBorrador(almacen, { texto: 'Ana\nBruno', exclusiones: 'Ana, Bruno', detalles: { grupo: 'Oficina', fecha: 7 }, deseos: { ana: 'café' } });
const b = cargarBorrador(almacen);
check(b?.texto === 'Ana\nBruno' && b.exclusiones === 'Ana, Bruno' && b.detalles.grupo === 'Oficina' && !('fecha' in b.detalles) && b.deseos.ana === 'café',
  `cargarBorrador: ${JSON.stringify(b)}`);
mem.set(CLAVE_BORRADOR, '{"texto":5,"detalles":"x"}');
const raro = cargarBorrador(almacen);
check(raro?.texto === '' && raro.exclusiones === '' && JSON.stringify(raro.detalles) === '{}' && JSON.stringify(raro.deseos) === '{}', `Un borrador con tipos raros debería normalizarse: ${JSON.stringify(raro)}`);
mem.set(CLAVE_BORRADOR, '{roto');
check(cargarBorrador(almacen) === null, 'Un borrador corrupto debería dar null');
borrarBorrador(almacen);
check(!mem.has(CLAVE_BORRADOR), 'borrarBorrador no borra');
const roto2 = { getItem: () => { throw new Error('bloqueado'); } };
check(cargarGuardado(roto2) === null, 'Sin almacenamiento debería dar null, no lanzar');

console.log(`  v1: ${abiertos}/${casos.length} enlaces fijos abren el nombre correcto (${arreglados} que el lector viejo no abría)`);
console.log(`  v2: ida y vuelta, truncado y alterado detectados; enlace sin detalles de ${corto.length} caracteres`);
console.log('  sorteo guardado viejo: migrado con sus URLs y su estado «enviado»');
if (fallos.length) {
  console.error(`\namigo-secreto-enlace-check: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('amigo-secreto-enlace-check: todo en orden');
