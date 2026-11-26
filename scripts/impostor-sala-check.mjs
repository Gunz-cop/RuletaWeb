#!/usr/bin/env node
/**
 * Prueba el impostor de punta a punta contra un Worker de verdad: arranca
 * `wrangler dev` (workerd local, el mismo runtime que producción), crea una
 * sala y mete 22 sockets reales a jugar una partida entera. Lo que mira, y
 * que scripts/impostor-check.mjs no puede ver porque no hay red:
 *
 *  - que cada socket recibe SOLO su rol (el impostor no recibe la palabra,
 *    nadie recibe el token de otro) en los bytes que de verdad cruzan,
 *  - que la sala sobrevive a que Cloudflare duerma el objeto y a una
 *    reconexión con el token (el estado está en storage, no en memoria),
 *  - que los límites (sala llena, partida empezada, sala inexistente,
 *    mensajes basura) se aplican en el servidor y no solo en la página.
 *
 * Necesita `dist/` construido (npm test ya lo hace antes). Usa el WebSocket
 * global de Node 22.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as dormir } from 'node:timers/promises';

if (!existsSync('dist')) {
  console.error('impostor-sala-check: falta dist/ (ejecuta `npm run build` antes)');
  process.exit(1);
}

const PUERTO = 8790 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PUERTO}`;
const persistencia = mkdtempSync(join(tmpdir(), 'impostor-wrangler-'));
const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

const wrangler = spawn(
  'npx',
  ['wrangler', 'dev', '--local', '--port', String(PUERTO), '--ip', '127.0.0.1', '--persist-to', persistencia],
  {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let salidaWrangler = '';
wrangler.stdout.on('data', (d) => { salidaWrangler += d; });
wrangler.stderr.on('data', (d) => { salidaWrangler += d; });

function terminar(codigo) {
  try { wrangler.kill('SIGTERM'); } catch { /* ya había terminado */ }
  setTimeout(() => { try { wrangler.kill('SIGKILL'); } catch { /* idem */ } rmSync(persistencia, { recursive: true, force: true }); process.exit(codigo); }, 400);
}
process.on('SIGINT', () => terminar(130));

async function esperarServidor() {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`${BASE}/api/impostor/nada`);
      if (r.status === 404) return true;
    } catch { /* aún arrancando */ }
    if (wrangler.exitCode !== null) return false;
    await dormir(400);
  }
  return false;
}

/* ---------- un jugador ---------- */
class Jugador {
  constructor(codigo, { nombre, token } = {}) {
    this.nombre = nombre;
    this.token = token;
    this.codigo = codigo;
    this.mensajes = [];
    this.bytes = '';
    this.cierre = null;
    this.estado = null;
    this.errores = [];
    this.avisos = [];
    this.chat = [];
    this.chatBytes = '';
  }

  abrir() {
    return new Promise((resolver, rechazar) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/api/impostor/salas/${this.codigo}/ws`);
      this.ws.addEventListener('open', () => {
        this.enviar({ t: 'hola', nombre: this.nombre, token: this.token });
        resolver(this);
      });
      this.ws.addEventListener('error', () => rechazar(new Error('socket')));
      this.ws.addEventListener('message', (e) => {
        this.bytes += e.data;
        const m = JSON.parse(e.data);
        this.mensajes.push(m);
        if (m.t === 'estado') this.estado = m;
        if (m.t === 'bienvenida') { this.token = m.token; this.id = m.id; }
        if (m.t === 'error') this.errores.push(m);
        if (m.t === 'chat') { this.chat.push(...(m.historial || [m.mensaje])); this.chatBytes += e.data; }
        for (const a of this.avisos.slice()) a(m);
      });
      this.ws.addEventListener('close', (e) => { this.cierre = e.code; for (const a of this.avisos.slice()) a(null); });
    });
  }

  enviar(m) { this.ws.send(JSON.stringify(m)); }

  esperar(pred, ms = 8000) {
    return new Promise((resolver, rechazar) => {
      const quien = this.nombre || this.id;
      if (pred(this)) return resolver(this);
      const t = setTimeout(() => { this.avisos = this.avisos.filter((x) => x !== a); rechazar(new Error(`${quien}: tiempo agotado esperando`)); }, ms);
      const a = () => { if (pred(this)) { clearTimeout(t); this.avisos = this.avisos.filter((x) => x !== a); resolver(this); } };
      this.avisos.push(a);
    });
  }

  cerrar() { try { this.ws.close(); } catch { /* ya cerrado */ } }
}

async function principal() {
  if (!(await esperarServidor())) {
    console.error('impostor-sala-check: wrangler dev no arrancó\n' + salidaWrangler.slice(-1500));
    return 1;
  }

  // La sala y los límites del endpoint
  const mala = await fetch(`${BASE}/api/impostor/salas`, { method: 'POST', body: JSON.stringify({ nombre: '   ' }) });
  check(mala.status === 400, 'crear sala sin nombre debería dar 400');
  check((await fetch(`${BASE}/api/impostor/salas`)).status === 405, 'GET a /salas debería dar 405');
  const noWs = await fetch(`${BASE}/api/impostor/salas/ABCDE/ws`);
  check(noWs.status === 426, 'sin Upgrade debería dar 426');

  const creada = await (await fetch(`${BASE}/api/impostor/salas`, { method: 'POST', body: JSON.stringify({ nombre: 'Anfitriona' }) })).json();
  check(/^[A-Z]{5}$/.test(creada.codigo) && typeof creada.token === 'string' && creada.token.length === 32, 'respuesta de crear sala rara');
  const { codigo } = creada;

  // Una sala que no existe: el socket se abre y se cierra con 4004
  const fantasma = new Jugador('QQQQQ', { nombre: 'Nadie' });
  await fantasma.abrir();
  await fantasma.esperar((j) => j.cierre !== null);
  check(fantasma.cierre === 4004 && fantasma.errores[0]?.error === 'sala', 'una sala inexistente no se cierra con 4004');

  // El anfitrión entra con su token y los otros 21 con su nombre
  const anfitriona = new Jugador(codigo, { nombre: 'Anfitriona', token: creada.token });
  await anfitriona.abrir();
  await anfitriona.esperar((j) => j.estado);
  check(anfitriona.estado.yo.anfitrion === true && anfitriona.estado.jugadores.length === 1, 'el anfitrión no entra como anfitrión');

  const resto = [];
  for (let i = 2; i <= 22; i++) {
    const j = new Jugador(codigo, { nombre: `Jugador ${i}` });
    await j.abrir();
    resto.push(j);
  }
  const todos = [anfitriona, ...resto];
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado && x.estado.jugadores.length === 22 && x.token)));
  check(todos.every((j) => j.estado.fase === 'lobby'), 'no están todos en el lobby');
  check(todos.every((j) => j.estado.jugadores.every((x) => x.conectado)), 'alguien aparece desconectado');
  check(resto.every((j) => j.estado.yo.anfitrion === false), 'hay más de un anfitrión');
  check(new Set(todos.map((j) => j.token)).size === 22, 'tokens repetidos entre jugadores');

  // Un jugador no puede mandar
  resto[0].enviar({ t: 'iniciar' });
  await resto[0].esperar((j) => j.errores.length > 0);
  check(resto[0].errores[0].error === 'permiso', 'un jugador pudo iniciar');

  // Mensajes basura: no tumban nada
  anfitriona.ws.send('esto no es json');
  anfitriona.ws.send(JSON.stringify({ t: 'inventado' }));
  anfitriona.ws.send(JSON.stringify({ x: 1 }));
  anfitriona.ws.send('x'.repeat(5000));

  // Configuración y reparto
  anfitriona.enviar({ t: 'config', cambios: { categoria: 'animales', segundos: 30, vueltas: 1, anfitrionJuega: true } });
  await anfitriona.esperar((j) => j.estado.config.categoria === 'animales');
  anfitriona.enviar({ t: 'iniciar' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'ronda')));

  const roles = todos.map((j) => j.estado.rol);
  check(roles.every(Boolean), 'alguien no recibió rol');
  const impostores = todos.filter((j) => j.estado.rol.impostor);
  check(impostores.length === 3, `con 22 debería haber 3 impostores y hay ${impostores.length}`);
  const palabras = new Set(todos.filter((j) => !j.estado.rol.impostor).map((j) => j.estado.rol.palabra));
  check(palabras.size === 1, 'los inocentes no comparten la misma palabra');
  const palabra = [...palabras][0];
  for (const j of todos) {
    if (j.estado.rol.impostor) {
      check(!j.bytes.includes(`"${palabra}"`), `el impostor ${j.nombre} recibió la palabra por el cable`);
    }
    for (const otro of todos) if (otro !== j) check(!j.bytes.includes(otro.token), `${j.nombre} recibió el token de ${otro.nombre}`);
    check(!/"impostor":true/.test(JSON.stringify(j.estado.jugadores)), `${j.nombre} ve quién es impostor en la lista`);
  }

  // Un jugador nuevo no entra con la partida en marcha
  const tarde = new Jugador(codigo, { nombre: 'Tarde' });
  await tarde.abrir();
  await tarde.esperar((j) => j.cierre !== null);
  check(tarde.cierre === 4003 && tarde.errores[0]?.error === 'empezada', 'entró alguien con la partida empezada');

  // Turnos: el anfitrión empieza, pasa, y todos ven lo mismo
  const ronda1 = anfitriona.estado.ronda;
  check(ronda1.total === 22 && ronda1.turnoFin === null && ronda1.pausaRestante === 30000, 'la ronda no arranca en pausa');
  anfitriona.enviar({ t: 'turno', op: 'empezar' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.ronda.turnoFin !== null)));
  const finPrimero = anfitriona.estado.ronda.turnoFin;
  check(todos.every((j) => j.estado.ronda.turnoFin === finPrimero && j.estado.ronda.de === ronda1.orden[0]), 'los móviles no ven el mismo turno');
  check(Math.abs(anfitriona.estado.ahora + 30000 - finPrimero) < 3000, 'el reloj del turno no son 30 s');

  // Dormir al objeto: con la API de hibernación, tras unos segundos sin
  // mensajes el DO se descarga de memoria y la sala debe seguir ahí.
  await dormir(11000);
  anfitriona.enviar({ t: 'turno', op: 'mas' });
  await anfitriona.esperar((j) => j.estado.ronda.turnoFin === finPrimero + 15000);
  check(true, '');

  for (let i = 1; i <= 22; i++) {
    anfitriona.enviar({ t: 'turno', op: 'siguiente' });
    await anfitriona.esperar((j) => j.estado.ronda.turno === i);
  }
  await todos[3].esperar((j) => j.estado.ronda.terminada);
  check(anfitriona.estado.ronda.de === null && anfitriona.estado.ronda.turnoFin === null, 'al acabar los turnos el reloj sigue');

  // Reconexión: el móvil de alguien se apaga y vuelve con su token
  const quien = resto[7];
  const miRol = JSON.stringify(quien.estado.rol);
  quien.cerrar();
  await anfitriona.esperar((j) => j.estado.jugadores.find((x) => x.nombre === quien.nombre)?.conectado === false);
  const vuelve = new Jugador(codigo, { nombre: quien.nombre, token: quien.token });
  await vuelve.abrir();
  await vuelve.esperar((j) => j.estado);
  check(JSON.stringify(vuelve.estado.rol) === miRol && vuelve.id === quien.id, 'al reconectar no recupera el mismo rol');
  await anfitriona.esperar((j) => j.estado.jugadores.every((x) => x.conectado));
  const indice = todos.indexOf(quien);
  todos[indice] = vuelve;

  // Un token inventado en partida empezada no entra
  const intruso = new Jugador(codigo, { nombre: 'Intruso', token: '0'.repeat(32) });
  await intruso.abrir();
  await intruso.esperar((j) => j.cierre !== null);
  check(intruso.cierre === 4003, 'un token inventado entró en una partida empezada');

  // Votación: todos votan menos uno por un impostor, salvo los impostores
  const idsImpostores = new Set(impostores.map((j) => j.id));
  const objetivo = impostores[0].id;
  anfitriona.enviar({ t: 'votacion' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'votacion')));
  for (const j of todos) {
    const por = j.id === objetivo ? impostores[1].id : objetivo;
    j.enviar({ t: 'votar', por });
  }
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'resultado')));
  const res = anfitriona.estado.resultado;
  check(res.expulsado === objetivo && res.eraImpostor === true && res.ganan === null, 'no expulsa al impostor votado');
  check(!anfitriona.bytes.includes('"impostores":['), 'se enseñan los impostores antes del final');
  void idsImpostores;

  // Siguiente ronda y final: el resto del grupo acierta con los otros dos
  let restantes = new Set(impostores.slice(1).map((j) => j.id));
  while (restantes.size > 0) {
    anfitriona.enviar({ t: 'continuar' });
    await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'ronda')));
    anfitriona.enviar({ t: 'votacion' });
    await anfitriona.esperar((j) => j.estado.fase === 'votacion');
    const siguiente = [...restantes][0];
    const vivos = anfitriona.estado.jugadores.filter((x) => x.vivo);
    for (const j of todos) {
      const yo = anfitriona.estado.jugadores.find((x) => x.id === j.id);
      if (!yo.vivo) continue;
      j.enviar({ t: 'votar', por: j.id === siguiente ? vivos.find((x) => x.id !== j.id).id : siguiente });
    }
    await anfitriona.esperar((j) => j.estado.fase === 'resultado' && j.estado.resultado.expulsado !== null && !restantes.has(j.estado.resultado.expulsado) === false || j.estado.resultado?.ganan);
    restantes = new Set([...restantes].filter((id) => anfitriona.estado.jugadores.find((x) => x.id === id).vivo));
    if (anfitriona.estado.resultado.ganan) break;
  }
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.resultado?.ganan)));
  const fin = anfitriona.estado.resultado;
  check(fin.ganan === 'grupo' && fin.palabra === palabra, 'la partida no termina con la victoria del grupo');
  check(fin.impostores.length === 3, 'al final no se revelan los tres impostores');
  check(todos[5].estado.resultado.impostores.length === 3, 'al final un jugador no recibe la revelación');

  // Otra partida con la misma sala
  anfitriona.enviar({ t: 'nueva' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'lobby' && x.estado.rol === undefined)));
  check(todos.every((j) => j.estado.jugadores.length === 22), 'el lobby perdió jugadores');
  anfitriona.enviar({ t: 'iniciar' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'ronda' && x.estado.ronda.n === 1)));

  // El anfitrión pasa el mando y quien lo recibe lleva la partida
  anfitriona.enviar({ t: 'ceder', id: todos[1].id });
  await todos[1].esperar((j) => j.estado.yo.anfitrion === true);
  await anfitriona.esperar((j) => j.estado.yo.anfitrion === false).catch(() => {});
  check(anfitriona.estado.yo.anfitrion === false, 'tras ceder sigue siendo anfitrión');
  anfitriona.enviar({ t: 'votacion' });
  await anfitriona.esperar((j) => j.errores.some((e) => e.error === 'permiso'));
  todos[1].enviar({ t: 'votacion' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'votacion')));

  // Sala llena: con 22 dentro, entran solo 2 más (máximo 24)
  todos[1].enviar({ t: 'nueva' });
  await Promise.all(todos.map((j) => j.esperar((x) => x.estado.fase === 'lobby')));
  const extra = [];
  for (let i = 23; i <= 26; i++) {
    const j = new Jugador(codigo, { nombre: `Extra ${i}` });
    await j.abrir();
    extra.push(j);
  }
  await dormir(1500);
  const entraron = extra.filter((j) => j.estado && j.cierre === null);
  const rechazados = extra.filter((j) => j.cierre === 4003 && j.errores[0]?.error === 'llena');
  check(entraron.length === 2 && rechazados.length === 2, `límite de sala: entraron ${entraron.length}, rechazados ${rechazados.length}`);


  /* ---------- modo a distancia: pistas escritas y chat ---------- */
  {
    const sala2 = await (await fetch(`${BASE}/api/impostor/salas`, { method: 'POST', body: JSON.stringify({ nombre: 'Moderadora' }) })).json();
    const ju = [new Jugador(sala2.codigo, { nombre: 'Moderadora', token: sala2.token })];
    for (let i = 1; i <= 5; i++) ju.push(new Jugador(sala2.codigo, { nombre: `Remoto ${i}` }));
    for (const j of ju) await j.abrir();
    await Promise.all(ju.map((j) => j.esperar((x) => x.estado && x.estado.jugadores.length === 6)));
    const mod = ju[0];

    mod.enviar({ t: 'config', cambios: { aDistancia: true, segundos: 20, vueltas: 1, anfitrionJuega: true } });
    await Promise.all(ju.map((j) => j.esperar((x) => x.estado.config.aDistancia === true)));
    mod.enviar({ t: 'iniciar' });
    await Promise.all(ju.map((j) => j.esperar((x) => x.estado.fase === 'ronda')));

    // Cada uno escribe su pista en su turno; los demás reciben un error si lo intentan
    const porId = new Map(ju.map((j) => [j.id, j]));
    const orden = mod.estado.ronda.orden;
    for (let i = 0; i < orden.length; i++) {
      const toca = porId.get(orden[i]);
      const intruso = ju.find((j) => j.id !== toca.id);
      const erroresAntes = intruso.errores.length;
      intruso.enviar({ t: 'pista', texto: 'fuera de turno' });
      await intruso.esperar((j) => j.errores.length > erroresAntes);
      check(intruso.errores.at(-1).error === 'turno', 'una pista fuera de turno no se rechaza');
      toca.enviar({ t: 'pista', texto: `pista ${i + 1}` });
      await Promise.all(ju.map((j) => j.esperar((x) => x.estado.pistas && x.estado.pistas.length === i + 1)));
      check(ju.every((j) => j.estado.pistas.at(-1).texto === `pista ${i + 1}` && j.estado.pistas.at(-1).id === toca.id), 'los móviles no ven la misma pista');
      toca.enviar({ t: 'pista', texto: 'otra' });
      await toca.esperar((j) => j.errores.some((e) => e.mensaje === 'Ya enviaste tu pista.'));
      mod.enviar({ t: 'turno', op: i === 0 ? 'empezar' : 'siguiente' });
      if (i === 0) { await mod.esperar((j) => j.estado.ronda.turnoFin !== null); mod.enviar({ t: 'turno', op: 'siguiente' }); }
      await mod.esperar((j) => j.estado.ronda.turno >= (i === 0 ? 1 : i + 1));
    }
    check(mod.estado.ronda.terminada, 'las pistas no completaron la ronda');

    // Sin chat durante la ronda
    ju[1].enviar({ t: 'chat', texto: 'hola' });
    await ju[1].esperar((j) => j.errores.some((e) => e.error === 'fase'));

    // Chat en la votación: lo reciben todos, y solo ese mensaje (no el estado entero)
    mod.enviar({ t: 'votacion' });
    await Promise.all(ju.map((j) => j.esperar((x) => x.estado.fase === 'votacion' && x.estado.chat?.abierto)));
    ju[2].enviar({ t: 'chat', texto: 'sospecho de Remoto 4' });
    await Promise.all(ju.map((j) => j.esperar((x) => x.chat.length === 1)));
    check(ju.every((j) => j.chat[0].texto === 'sospecho de Remoto 4' && j.chat[0].de === ju[2].id), 'el chat no llega igual a todos');
    check(!ju[4].bytes.replace(ju[4].chatBytes, '').includes('sospecho de Remoto 4'), 'el chat viaja dentro del estado');
    ju[2].enviar({ t: 'chat', texto: 'rápido' });
    await ju[2].esperar((j) => j.errores.some((e) => e.error === 'ritmo'));

    // Silenciar
    mod.enviar({ t: 'silenciar', id: ju[3].id, valor: true });
    await ju[3].esperar((j) => j.estado.chat?.puedeEscribir === false);
    ju[3].enviar({ t: 'chat', texto: 'no debería salir' });
    await ju[3].esperar((j) => j.errores.some((e) => e.error === 'permiso'));
    check(ju.every((j) => !j.chat.some((m) => m.texto === 'no debería salir')), 'un silenciado habló');
    ju[3].enviar({ t: 'silenciar', id: ju[4].id, valor: true });
    await ju[3].esperar((j) => j.errores.filter((e) => e.error === 'permiso').length >= 2);

    // Reconexión: quien vuelve recibe el historial del chat
    const vuelve = new Jugador(sala2.codigo, { nombre: ju[5].nombre, token: ju[5].token });
    ju[5].cerrar();
    await vuelve.abrir();
    await vuelve.esperar((j) => j.chat.length === 1);
    check(vuelve.chat[0].texto === 'sospecho de Remoto 4', 'al volver no recibe el historial del chat');
    check(vuelve.estado.pistas.length === orden.length, 'al volver no recibe las pistas');

    // Apagado, no hay pistas ni chat: nueva partida y modo normal
    mod.enviar({ t: 'nueva' });
    await mod.esperar((j) => j.estado.fase === 'lobby');
    mod.enviar({ t: 'config', cambios: { aDistancia: false } });
    await mod.esperar((j) => j.estado.config.aDistancia === false);
    mod.enviar({ t: 'iniciar' });
    await mod.esperar((j) => j.estado.fase === 'ronda');
    check(mod.estado.pistas === undefined && mod.estado.chat === undefined, 'con el modo apagado la vista trae pistas o chat');
    for (const j of [...ju, vuelve]) j.cerrar();
  }

  for (const j of [...todos, ...extra]) j.cerrar();
  return 0;
}

let codigoSalida = 1;
try {
  codigoSalida = await principal();
  if (fallos.length) {
    console.error(`impostor-sala-check: ${fallos.length} fallo(s)`);
    for (const f of fallos.slice(0, 30)) console.error('  - ' + f);
    codigoSalida = 1;
  } else if (codigoSalida === 0) {
    console.log('impostor-sala-check: OK (22 sockets, partida completa, hibernación y reconexión)');
  }
} catch (e) {
  console.error('impostor-sala-check: ' + (e && e.message ? e.message : e));
  console.error(salidaWrangler.slice(-1200));
  codigoSalida = 1;
}
terminar(codigoSalida);
