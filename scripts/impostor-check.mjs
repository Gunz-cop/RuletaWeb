#!/usr/bin/env node
/**
 * Comprueba las reglas del impostor (src/scripts/impostor-logica.js) sin
 * abrir un socket: una sala de 22 jugadores, partidas enteras hasta que
 * gana alguien, y lo que importa de verdad en este juego, que nadie vea lo
 * que no le toca.
 *
 * El servidor (worker/sala.js) solo guarda la sala y reenvía mensajes, así
 * que si una regla falla, falla aquí. La parte de red la cubre
 * scripts/impostor-sala-check.mjs contra un Worker de verdad.
 */
import {
  MAX_JUGADORES, MIN_JUGADORES, MAX_NOMBRE, LARGO_CODIGO, ALFABETO_CODIGO, SEGUNDOS_OPCIONES,
  entero, barajar, codigoAleatorio, normalizarCodigo, normalizarNombre, nombreUnico,
  impostoresSugeridos, impostoresMaximos, impostoresEfectivos,
  crearSala, unirse, jugadorPorToken, vivos, jugando,
  configurar, iniciar, controlarTurno, turnoDe, totalTurnos, abrirVotacion, votar, cerrarVotacion,
  continuar, nuevaPartida, quitar, ceder, salir, quienGana, vistaPara,
} from '../src/scripts/impostor-logica.js';
import { CATEGORIAS, CLAVES_CATEGORIAS } from '../src/scripts/impostor-palabras.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };

// Azar determinista (xorshift32) para que un fallo se pueda repetir
function semilla(s) {
  let x = s >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
}

/* ---------- palabras ---------- */
for (const [clave, cat] of Object.entries(CATEGORIAS)) {
  check(cat.palabras.length >= 30, `${clave}: muy pocas palabras (${cat.palabras.length})`);
  check(new Set(cat.palabras).size === cat.palabras.length, `${clave}: palabra repetida`);
  check(cat.palabras.every((p) => p === p.trim() && p.length >= 3 && p.length <= 24), `${clave}: palabra rara`);
  check(Boolean(cat.etiqueta), `${clave}: sin etiqueta`);
}

/* ---------- azar ---------- */
{
  const r = semilla(7);
  const cuentas = Array(7).fill(0);
  for (let i = 0; i < 70000; i++) cuentas[entero(7, r)]++;
  check(cuentas.every((c) => c > 9400 && c < 10600), `entero() con sesgo: ${cuentas}`);
  const b = barajar([1, 2, 3, 4, 5, 6, 7, 8], semilla(3));
  check(b.length === 8 && new Set(b).size === 8, 'barajar pierde elementos');
  const tope = entero(1000, () => 4294967295);
  check(tope >= 0 && tope < 1000, 'entero() con el máximo de 32 bits se sale de rango');
  for (let i = 0; i < 200; i++) {
    const c = codigoAleatorio();
    check(c.length === LARGO_CODIGO && [...c].every((x) => ALFABETO_CODIGO.includes(x)), `código raro: ${c}`);
    check(normalizarCodigo(c.toLowerCase() + ' ') === c, 'normalizarCodigo no lo reconoce');
  }
  check(normalizarCodigo('ABC') === '' && normalizarCodigo('ABCDI') === '' && normalizarCodigo('AB-CD') === '', 'acepta códigos no válidos');
}

/* ---------- nombres ---------- */
check(normalizarNombre('  Ana   María ') === 'Ana María', 'espacios sin colapsar');
check(normalizarNombre('A‮B​C\n') === 'A B C', 'caracteres de control o inversión sin limpiar');
check(Array.from(normalizarNombre('x'.repeat(80))).length === MAX_NOMBRE, 'nombre sin recortar');
check(normalizarNombre('👨‍👩‍👧'.repeat(30)).length > 0, 'los emojis rompen el recorte');
check(nombreUnico('Ana', ['ana']) === 'Ana 2', 'duplicado no distinguido');
check(nombreUnico('Ana', ['Ana', 'Ana 2']) === 'Ana 3', 'duplicado triple');
check(nombreUnico('Ángel', ['angel']) === 'Ángel 2', 'las tildes no cuentan como diferencia');
check(Array.from(nombreUnico('x'.repeat(20), ['x'.repeat(20)])).length <= MAX_NOMBRE, 'sufijo se pasa del límite');

/* ---------- reparto ---------- */
check(impostoresSugeridos(3) === 1 && impostoresSugeridos(11) === 1 && impostoresSugeridos(12) === 2 && impostoresSugeridos(22) === 3, 'impostores sugeridos');
check(impostoresMaximos(3) === 1 && impostoresMaximos(4) === 1 && impostoresMaximos(22) === 10, 'impostores máximos');
check(impostoresEfectivos({ impostores: 9 }, 5) === 2, 'impostores sin recortar al máximo');

/* ---------- una sala de 22 ---------- */
function montarSala(n, opciones = {}, rand = semilla(99)) {
  const { sala, anfitrion } = crearSala('KQMRT', 'Anfitrión', 1000);
  const todos = [anfitrion];
  for (let i = 2; i <= n; i++) {
    const r = unirse(sala, `Persona ${i}`);
    check(r.ok, `no entra el jugador ${i}: ${r.mensaje}`);
    todos.push(r.jugador);
  }
  if (Object.keys(opciones).length) check(configurar(sala, anfitrion, opciones).ok, 'config rechazada');
  return { sala, anfitrion, todos, rand };
}

{
  const { sala, anfitrion, todos, rand } = montarSala(22);
  check(sala.jugadores.length === 22, 'no caben los 22');
  const extra = [];
  for (let i = 23; i <= MAX_JUGADORES + 3; i++) extra.push(unirse(sala, `Extra ${i}`));
  check(extra.filter((r) => r.ok).length === MAX_JUGADORES - 22, 'el límite de jugadores no se respeta');
  check(extra.at(-1).error === 'llena', 'no avisa de sala llena');
  for (const j of sala.jugadores.slice(22)) quitar(sala, anfitrion, j.id);
  check(sala.jugadores.length === 22, 'quitar no funciona en el lobby');
  check(unirse(sala, '   ').error === 'nombre', 'acepta un nombre vacío');
  check(new Set(sala.jugadores.map((j) => j.id)).size === 22, 'ids repetidos');
  check(new Set(sala.jugadores.map((j) => j.token)).size === 22, 'tokens repetidos');

  // Solo manda el anfitrión
  const otro = todos[5];
  check(iniciar(sala, otro, rand).error === 'permiso', 'un jugador pudo iniciar la partida');
  check(configurar(sala, otro, { segundos: 20 }).error === 'permiso', 'un jugador pudo cambiar la configuración');
  check(configurar(sala, anfitrion, { segundos: 7, vueltas: 9, categoria: 'inventada', impostores: -3 }).ok, 'config con valores sueltos falla');
  check(SEGUNDOS_OPCIONES.includes(sala.config.segundos) && sala.config.vueltas <= 3 && sala.config.categoria === 'azar' && sala.config.impostores >= 0, 'la configuración acepta valores fuera de las opciones');
  check(configurar(sala, anfitrion, { categoria: 'colombia', segundos: 30, vueltas: 2 }).ok && sala.config.categoria === 'colombia', 'config válida no se aplica');

  check(iniciar(sala, anfitrion, rand).ok, 'no empieza con 22');
  check(sala.fase === 'ronda', 'no pasa a la ronda');
  check(jugando(sala).length === 22, 'no juegan los 22');
  const impostores = sala.jugadores.filter((j) => j.impostor);
  check(impostores.length === 3, `con 22 debería haber 3 impostores y hay ${impostores.length}`);
  check(sala.categoria === CATEGORIAS.colombia.etiqueta && CATEGORIAS.colombia.palabras.includes(sala.palabra), 'palabra fuera de la categoría elegida');
  check(unirse(sala, 'Tarde').error === 'empezada', 'entra alguien con la partida en marcha');
  check(configurar(sala, anfitrion, { segundos: 20 }).error === 'fase', 'se puede cambiar la config en plena partida');

  // Privacidad: lo que ve cada uno
  const conectados = new Set(sala.jugadores.map((j) => j.id));
  for (const j of sala.jugadores) {
    const v = vistaPara(sala, j, 5000, conectados);
    const texto = JSON.stringify(v);
    check(!/token/i.test(texto) && !texto.includes(j.token), `la vista de ${j.nombre} lleva tokens`);
    for (const otroJ of sala.jugadores) if (otroJ.id !== j.id) check(!texto.includes(otroJ.token), 'la vista lleva el token de otro');
    check(v.jugadores.every((x) => x.impostor === undefined), `la vista de ${j.nombre} deja ver quién es impostor`);
    check(v.rol.impostor === j.impostor, `rol equivocado para ${j.nombre}`);
    if (j.impostor) {
      check(v.rol.palabra === null && !texto.includes(sala.palabra), `el impostor ${j.nombre} puede ver la palabra`);
      check(v.rol.categoria === sala.categoria, 'el impostor no ve la categoría');
    } else {
      check(v.rol.palabra === sala.palabra, 'un inocente no ve la palabra');
    }
  }
  configurar(sala, anfitrion, {}); // sin efecto en partida
  nuevaPartida(sala, anfitrion);
  configurar(sala, anfitrion, { impostorVeCategoria: false });
  iniciar(sala, anfitrion, rand);
  const vImp = vistaPara(sala, sala.jugadores.find((j) => j.impostor), 0, new Set());
  check(vImp.rol.categoria === null, 'el impostor ve la categoría aunque se desactivó');
  check(!JSON.stringify(vImp).includes(sala.categoria), 'la categoría se cuela por otro campo');
}

/* ---------- turnos con reloj ---------- */
{
  const { sala, anfitrion, todos, rand } = montarSala(6, { segundos: 30, vueltas: 2 });
  iniciar(sala, anfitrion, rand);
  const r = sala.ronda;
  check(r.orden.length === 6 && new Set(r.orden).size === 6, 'el orden de turnos no incluye a todos una vez');
  check(totalTurnos(sala) === 12, 'dos vueltas de seis son doce turnos');
  check(r.turnoFin === null && r.pausaRestante === 30000, 'el reloj corre antes de empezar el primer turno');
  check(controlarTurno(sala, todos[2], 'siguiente', 0).error === 'permiso', 'un jugador pudo pasar el turno');
  controlarTurno(sala, anfitrion, 'empezar', 10000);
  check(r.turnoFin === 40000 && r.pausaRestante === null, 'empezar no fija el fin del turno');
  controlarTurno(sala, anfitrion, 'mas', 12000);
  check(r.turnoFin === 55000, '+15 s no suma');
  controlarTurno(sala, anfitrion, 'pausar', 20000);
  check(r.turnoFin === null && r.pausaRestante === 35000, 'pausar no guarda lo que queda');
  controlarTurno(sala, anfitrion, 'mas', 21000);
  check(r.pausaRestante === 50000, '+15 s en pausa no suma');
  controlarTurno(sala, anfitrion, 'empezar', 100000);
  check(r.turnoFin === 150000, 'reanudar no usa lo que quedaba');
  const primero = turnoDe(sala);
  controlarTurno(sala, anfitrion, 'siguiente', 130000);
  check(r.turno === 1 && r.turnoFin === 160000 && turnoDe(sala) !== primero, 'siguiente no pasa al siguiente con su tiempo');
  check(turnoDe(sala) === r.orden[1], 'turno equivocado');
  for (let i = 0; i < 10; i++) controlarTurno(sala, anfitrion, 'siguiente', 200000 + i);
  check(r.turno === 11 && turnoDe(sala) === r.orden[5], 'la segunda vuelta repite el orden');
  controlarTurno(sala, anfitrion, 'siguiente', 300000);
  check(r.turno === 12 && turnoDe(sala) === null && r.turnoFin === null, 'al acabar los turnos el reloj sigue vivo');
  controlarTurno(sala, anfitrion, 'siguiente', 300001);
  check(r.turno === 12, 'el turno se pasa del final');
  const v = vistaPara(sala, anfitrion, 300002, new Set());
  check(v.ronda.terminada && v.ronda.de === null, 'la vista no avisa de que todos hablaron');
}

/* ---------- partidas enteras ---------- */
// Un grupo que vota siempre por un impostor vivo gana; uno que siempre
// vota por un inocente pierde; y todos acaban sin atascarse.
function jugar(n, estrategia, semi) {
  const rand = semilla(semi);
  const { sala, anfitrion, todos } = montarSala(n, {}, rand);
  iniciar(sala, anfitrion, rand);
  let rondas = 0;
  while (true) {
    rondas++;
    if (rondas > n + 2) { check(false, `partida de ${n} sin terminar tras ${rondas} rondas`); return null; }
    const hablan = vivos(sala).length;
    for (let i = 0; i < hablan; i++) controlarTurno(sala, anfitrion, 'siguiente', 1000 + i);
    check(abrirVotacion(sala, anfitrion).ok, 'no abre la votación');
    const vivosAhora = vivos(sala);
    for (const j of vivosAhora) {
      const posibles = vivosAhora.filter((x) => x.id !== j.id);
      const objetivo = estrategia(posibles, j);
      const res = votar(sala, j, objetivo.id, rand);
      check(res.ok, `voto rechazado: ${res.mensaje}`);
    }
    check(sala.fase === 'resultado', 'con todos los votos no se cierra sola');
    const ganan = sala.resultado.ganan;
    check(ganan === quienGana(sala), 'el ganador del resultado no coincide');
    if (ganan) return { sala, todos, ganan, rondas, anfitrion };
    check(continuar(sala, anfitrion, rand).ok, 'no continúa');
    check(sala.ronda.n === rondas + 1, 'el número de ronda no avanza');
  }
}

for (const n of [3, 4, 7, 12, 22, 24]) {
  for (let s = 1; s <= 6; s++) {
    const acierta = jugar(n, (p) => p.find((x) => x.impostor) || p[0], 1000 * n + s);
    if (acierta) {
      check(acierta.ganan === 'grupo', `${n} jugadores: un grupo que acierta siempre debería ganar`);
      check(acierta.sala.jugadores.filter((j) => j.impostor && j.vivo).length === 0, 'ganó el grupo con impostores vivos');
    }
    const falla = jugar(n, (p) => p.find((x) => !x.impostor) || p[0], 5000 * n + s);
    if (falla) {
      check(falla.ganan === 'impostores', `${n} jugadores: un grupo que falla siempre debería perder`);
      const v = vivos(falla.sala);
      check(v.filter((j) => j.impostor).length >= v.length / 2, 'ganaron los impostores sin ser mitad');
    }
  }
}

/* ---------- votos: empate, voto cambiado y a quién no se puede votar ---------- */
{
  const { sala, anfitrion, todos, rand } = montarSala(6, { impostores: 1 });
  iniciar(sala, anfitrion, rand);
  abrirVotacion(sala, anfitrion);
  const [a, b, c, d, e, f] = todos;
  check(votar(sala, a, a.id).error === 'datos', 'puede votar por sí mismo');
  check(votar(sala, a, 999).error === 'datos', 'vota por alguien que no existe');
  votar(sala, a, b.id); votar(sala, b, a.id); votar(sala, c, b.id); votar(sala, d, a.id);
  votar(sala, e, a.id); votar(sala, e, b.id); // cambia de voto: solo cuenta el último
  const v1 = vistaPara(sala, a, 0, new Set());
  check(v1.votacion.votaron === 5 && v1.votacion.total === 6 && v1.votacion.miVoto === b.id, 'el avance de la votación es incorrecto');
  check(v1.jugadores.find((x) => x.id === f.id).yaVoto === false && v1.jugadores.find((x) => x.id === a.id).yaVoto === true, 'yaVoto incorrecto');
  check(!JSON.stringify(v1).includes('"por"'), 'la vista enseña por quién votó cada uno');
  check(cerrarVotacion(sala, c).error === 'permiso', 'un jugador pudo cerrar la votación');
  check(cerrarVotacion(sala, anfitrion).ok, 'el anfitrión no pudo cerrar la votación');
  // a: b y d (2), b: a... → a=2 (b,d), b=3 (a,c,e) → b se va
  check(sala.resultado.expulsado === b.id && b.vivo === false, 'no expulsa al más votado');
  check(votar(sala, b, a.id).error === 'fase', 'se vota fuera de la votación');

  // Empate: nadie se va
  continuar(sala, anfitrion, rand);
  abrirVotacion(sala, anfitrion);
  check(votar(sala, b, a.id).error === 'permiso', 'un eliminado pudo votar');
  votar(sala, a, c.id); votar(sala, c, a.id); votar(sala, d, c.id); votar(sala, e, a.id);
  cerrarVotacion(sala, anfitrion); // f no votó: se cierra a mano
  check(sala.resultado.empate && sala.resultado.expulsado === null && vivos(sala).length === 5, 'un empate debería no expulsar a nadie');
  // Sin votos
  continuar(sala, anfitrion, rand);
  abrirVotacion(sala, anfitrion);
  cerrarVotacion(sala, anfitrion);
  check(sala.resultado.empate && vivos(sala).length === 5, 'cerrar sin votos debería ser un empate');
}

/* ---------- el resultado no enseña roles hasta que acaba ---------- */
{
  const { sala, anfitrion, todos, rand } = montarSala(7, {}, semilla(5));
  iniciar(sala, anfitrion, rand);
  const inocente = sala.jugadores.find((j) => !j.impostor);
  abrirVotacion(sala, anfitrion);
  for (const j of vivos(sala)) votar(sala, j, vivos(sala).find((x) => x.id !== j.id && x.id !== inocente.id)?.id ?? inocente.id);
  const v = vistaPara(sala, anfitrion, 0, new Set());
  if (!sala.resultado.ganan) {
    check(v.resultado.impostores === undefined && v.resultado.palabra === undefined, 'se revela la palabra antes de que acabe la partida');
    check(v.jugadores.every((x) => x.impostor === undefined), 'se revelan los roles antes de que acabe la partida');
  }
  check(typeof v.resultado.eraImpostor === 'boolean' || v.resultado.empate, 'no dice si el expulsado era impostor');
}

/* ---------- fin: se revela todo ---------- */
{
  const r = jugar(5, (p) => p.find((x) => x.impostor) || p[0], 42);
  const v = vistaPara(r.sala, r.todos[1], 0, new Set());
  check(v.resultado.ganan && v.resultado.palabra === r.sala.palabra, 'al final no se revela la palabra');
  check(v.resultado.impostores.length === r.sala.jugadores.filter((j) => j.impostor).length, 'al final no se revelan los impostores');
  check(v.jugadores.some((x) => x.impostor === true), 'al final la lista no marca a los impostores');
  check(continuar(r.sala, r.anfitrion).error === 'fase', 'se puede continuar una partida terminada');
  check(nuevaPartida(r.sala, r.todos[1]).error === 'permiso', 'un jugador pudo reiniciar la partida');
  check(nuevaPartida(r.sala, r.anfitrion).ok && r.sala.fase === 'lobby', 'no vuelve al lobby');
  check(r.sala.jugadores.every((j) => j.vivo && !j.impostor && j.juega), 'el lobby arrastra roles de la partida anterior');
  const w = vistaPara(r.sala, r.todos[1], 0, new Set());
  check(w.rol === undefined && w.resultado === undefined, 'el lobby enseña datos de la partida anterior');
  check(iniciar(r.sala, r.anfitrion).ok && r.sala.partidas === 2, 'no se puede jugar otra vez con la misma sala');
}

/* ---------- el anfitrión que modera ---------- */
{
  const { sala, anfitrion, todos, rand } = montarSala(5, { anfitrionJuega: false });
  check(iniciar(sala, anfitrion, rand).ok, 'no empieza con anfitrión moderador');
  check(jugando(sala).length === 4 && !anfitrion.juega && !anfitrion.impostor, 'el moderador cuenta como jugador');
  check(!sala.ronda.orden.includes(anfitrion.id), 'el moderador tiene turno');
  const v = vistaPara(sala, anfitrion, 0, new Set());
  check(v.rol.moderador && v.rol.impostores.length === sala.jugadores.filter((j) => j.impostor).length, 'el moderador no ve a los impostores');
  abrirVotacion(sala, anfitrion);
  check(votar(sala, anfitrion, todos[1].id).error === 'permiso', 'el moderador pudo votar');
  const inocentes = jugando(sala);
  for (const j of inocentes) votar(sala, j, inocentes.find((x) => x.id !== j.id).id);
  check(sala.fase === 'resultado', 'la votación no se cierra con los votos de quienes juegan');
  // Con 2 jugadores no se puede
  const chica = montarSala(3, { anfitrionJuega: false });
  check(iniciar(chica.sala, chica.anfitrion, chica.rand).error === 'pocos', 'empieza sin jugadores suficientes');
  check(MIN_JUGADORES === 3, 'el mínimo cambió: revisa los textos de la página');
}

/* ---------- anfitrión, reconexión y salidas ---------- */
{
  const { sala, anfitrion, todos } = montarSala(4);
  check(jugadorPorToken(sala, todos[2].token) === todos[2], 'el token no devuelve a su jugador');
  check(jugadorPorToken(sala, 'inventado') === null && jugadorPorToken(sala, undefined) === null && jugadorPorToken(sala, 12) === null, 'acepta un token inventado');
  check(ceder(sala, todos[1], todos[2].id).error === 'permiso', 'un jugador pudo ceder el mando');
  check(ceder(sala, anfitrion, todos[2].id).ok && todos[2].anfitrion && !anfitrion.anfitrion, 'ceder no cambia de anfitrión');
  check(sala.jugadores.filter((j) => j.anfitrion).length === 1, 'hay más de un anfitrión');
  check(quitar(sala, todos[2], todos[2].id).error === 'datos', 'el anfitrión puede quitarse a sí mismo');
  check(quitar(sala, todos[2], todos[3].id).ok && sala.jugadores.length === 3, 'no quita a un jugador en el lobby');
  const r = salir(sala, todos[2]);
  check(r.ok && !r.vacia && sala.jugadores.length === 2 && sala.jugadores.some((j) => j.anfitrion), 'si se va el anfitrión nadie hereda el mando');
  salir(sala, sala.jugadores[0]);
  const ultima = salir(sala, sala.jugadores[0]);
  check(sala.jugadores.length === 0 && ultima.vacia === true, 'la sala no se vacía');
}

if (fallos.length) {
  console.error(`impostor-check: ${fallos.length} fallo(s)`);
  for (const f of fallos.slice(0, 40)) console.error('  - ' + f);
  process.exit(1);
}
console.log('impostor-check: OK');
