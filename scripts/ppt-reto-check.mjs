#!/usr/bin/env node
/**
 * Comprueba la lógica pura de los retos a distancia de piedra, papel o
 * tijera (src/scripts/ppt-reto.js): que un reto va y vuelve por el enlace
 * sin perder nada, que la jugada sellada no se lee tal cual y que un enlace
 * roto o fabricado no rompe la página.
 */
import {
  FORMAS, ganador, nuevoId, sellar, abrir, crearReto, leerReto, crearResultado, leerResultado, leerFragmento,
} from '../src/scripts/ppt-reto.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

// Reglas
check(ganador('piedra', 'tijera') === 'j1', 'piedra gana a tijera');
check(ganador('tijera', 'papel') === 'j1', 'tijera gana a papel');
check(ganador('papel', 'piedra') === 'j1', 'papel gana a piedra');
check(ganador('piedra', 'papel') === 'j2', 'piedra pierde con papel');
check(ganador('tijera', 'tijera') === 'empate', 'empate');

// Ida y vuelta, con tildes, eñes y emojis en los textos
for (let i = 0; i < 300; i++) {
  const id = nuevoId();
  check(/^[a-z0-9]{10}$/.test(id), `id raro: ${id}`);
  for (const e1 of FORMAS) {
    check(abrir(sellar(e1, id), id) === e1, `sellar/abrir ${e1}`);
    const reto = { id, a: 'Ñoño Pérez', b: 'Lucía 🦊', q: 'lava los platos', e1 };
    const ida = leerReto(crearReto(reto));
    check(ida && ida.e1 === e1 && ida.a === reto.a && ida.b === reto.b && ida.q === reto.q, 'el reto no sobrevive al enlace');
    for (const e2 of FORMAS) {
      const vuelta = leerResultado(crearResultado(ida, e2));
      check(vuelta && vuelta.e1 === e1 && vuelta.e2 === e2 && vuelta.id === id, 'el resultado no sobrevive al enlace');
    }
  }
}

// La jugada sellada no es un código fijo: la misma jugada cambia de sello
// según el reto
const sellos = new Set(Array.from({ length: 200 }, () => sellar('piedra', nuevoId())));
check(sellos.size === 3, `piedra solo usa los sellos ${[...sellos]}`);
// Y el enlace no lleva la palabra en claro
check(!/piedra|papel|tijera/.test(crearReto({ id: nuevoId(), a: 'A', b: '', q: '', e1: 'tijera' })), 'la jugada se lee en el enlace');

// Textos recortados
const largo = leerReto(crearReto({ id: nuevoId(), a: 'x'.repeat(99), b: '', q: 'y'.repeat(500), e1: 'papel' }));
check(largo.a.length === 20 && largo.q.length === 60, 'los textos no se recortan');

// Enlaces rotos o fabricados: null, nunca una excepción
for (const malo of ['', 'xxx', '%%%', 'eyJ2IjoxfQ', btoa('{"v":1,"id":"<script>","s":0}'), btoa('{"v":1,"id":"abcdefgh","s":7}'), btoa('{"v":2,"id":"abcdefgh","s":0}')]) {
  check(leerReto(malo) === null, `reto malo aceptado: ${malo}`);
  check(leerResultado(malo) === null, `resultado malo aceptado: ${malo}`);
}
const sinRespuesta = crearReto({ id: nuevoId(), a: 'A', b: '', q: '', e1: 'papel' });
check(leerResultado(sinRespuesta) === null, 'un reto sin respuesta no vale como resultado');

// Fragmento de la URL
const id = nuevoId();
const r = crearReto({ id, a: 'Ana', b: 'Luis', q: '', e1: 'piedra' });
check(leerFragmento(`#reto=${r}`)?.tipo === 'reto', 'fragmento de reto');
check(leerFragmento(`#resultado=${crearResultado(leerReto(r), 'papel')}`)?.tipo === 'resultado', 'fragmento de resultado');
check(leerFragmento('#reto=roto')?.tipo === 'roto', 'fragmento roto');
check(leerFragmento('') === null && leerFragmento('#otra=1') === null, 'sin fragmento');

if (fallos.length) {
  for (const f of [...new Set(fallos)].slice(0, 20)) console.error(`FALLA  ${f}`);
  process.exit(1);
}
console.log('ok     retos a distancia de piedra, papel o tijera (enlaces de ida y vuelta)');
