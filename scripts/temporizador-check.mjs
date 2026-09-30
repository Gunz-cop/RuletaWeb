#!/usr/bin/env node
/**
 * Comprueba la lógica pura del temporizador (src/scripts/temporizador-logica.js):
 * que la duración cae siempre dentro del rango y reparte bien, que el
 * nombre del juego sale del país correcto y que el historial viejo se
 * convierte sin perder rondas.
 */
import { webcrypto } from 'node:crypto';
import {
  MODOS, JUEGOS, juegoPorDefecto, juegoValido, modoValido, normalizarRango,
  duracionAleatoria, formatoDuracion, formatoRango, configDeUrl, convertirHistorialViejo,
} from '../src/scripts/temporizador-logica.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

const rnd = () => webcrypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Dentro del rango, con los dos extremos alcanzables y reparto parejo
const cuenta = new Map();
const N = 30000;
for (let i = 0; i < N; i++) {
  const d = duracionAleatoria([10, 14], rnd());
  check(Number.isInteger(d) && d >= 10 && d <= 14, `duración fuera de rango: ${d}`);
  cuenta.set(d, (cuenta.get(d) || 0) + 1);
}
for (let s = 10; s <= 14; s++) {
  const p = (cuenta.get(s) || 0) / N;
  check(p > 0.18 && p < 0.22, `el segundo ${s} sale el ${(p * 100).toFixed(1)}% (esperado ~20%)`);
}
check(duracionAleatoria([5, 5], 0.999) === 5, 'rango de un solo valor');
check(duracionAleatoria([1, 3], 0.9999999) === 3, 'el extremo superior no se sale');

for (const [modo, def] of Object.entries(MODOS)) {
  check(def.porDefecto < def.presets.length, `${modo}: preset por defecto inexistente`);
  for (const r of def.presets) check(r[0] < r[1], `${modo}: preset ${r} al revés`);
}

// Nombre del juego por país
check(juegoPorDefecto({ zona: 'America/Bogota' }) === 'tingo', 'Colombia → tingo tango');
check(juegoPorDefecto({ zona: 'America/Mexico_City' }) === 'sequema', 'México → la papa se quema');
check(juegoPorDefecto({ zona: 'Europe/Madrid' }) === 'patata', 'España → patata caliente');
check(juegoPorDefecto({ zona: 'America/Lima' }) === 'papa', 'Perú → papa caliente');
check(juegoPorDefecto({ zona: 'Asia/Tokyo', idioma: 'es-CO' }) === 'tingo', 'idioma es-CO sin zona conocida');
check(juegoPorDefecto({}) === 'papa', 'sin datos → papa caliente');
check(juegoValido('__proto__') === null && juegoValido('tingo') === 'tingo', 'juegoValido');
check(modoValido('constructor') === null && modoValido('avisos') === 'avisos', 'modoValido');
for (const [k, j] of Object.entries(JUEGOS)) {
  check(j.nombre && j.corto && j.final && j.perder, `${k}: faltan textos`);
}

// Rangos y enlaces
check(JSON.stringify(normalizarRango(30, 10)) === '[10,30]', 'rango al revés se ordena');
check(JSON.stringify(normalizarRango(0, 99999)) === '[1,3600]', 'rango se recorta a los límites');
check(normalizarRango('x', 3) === null, 'rango no numérico');
const url = configDeUrl('?modo=papa&min=1&max=2&juego=tingo');
check(url.modo === 'papa' && url.juego === 'tingo' && url.rango.join() === '1,2', 'config de URL');
check(configDeUrl('?modo=bomba').modo === null, 'modo inválido en URL');

check(formatoDuracion(45) === '45 s' && formatoDuracion(60) === '1 min' && formatoDuracion(372) === '6 min 12 s', 'formatoDuracion');
check(formatoRango([10, 30]) === '10–30 s', 'formatoRango segundos');
check(formatoRango([120, 300]) === '2–5 min', 'formatoRango minutos');
check(formatoRango([20, 60]) === '20 s – 1 min', 'formatoRango mixto');

// Historial de la versión anterior
const viejo = convertirHistorialViejo([
  { timestamp: '10:00:00', mode: '💣 Bomba Secreta', range: '10s - 1m', result: '💥 Exploto en 23s', duration: 23 },
  { timestamp: '10:05:00', mode: '👁️ Cuenta Visible', range: '10s - 1m', result: '¡Tiempo cumplido! (40s)', duration: 40 },
  null,
]);
check(viejo.length === 2, 'historial viejo: filas');
check(viejo[0].modo === 'papa' && viejo[0].lado === 'Duró 23 s', 'historial viejo: bomba');
check(viejo[1].modo === 'visible' && !/[💣💥👁]/u.test(viejo[1].texto), 'historial viejo: sin emojis');
check(convertirHistorialViejo('basura').length === 0, 'historial viejo corrupto');

if (fallos.length) {
  console.error(`temporizador: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('ok     lógica del temporizador (rangos, azar, nombres por país, historial viejo)');
