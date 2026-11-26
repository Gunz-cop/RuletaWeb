// ==========================================================
// SalaImpostor — una sala de El Impostor = un Durable Object
// ==========================================================
// Este archivo no decide nada del juego: guarda la sala, atiende los
// sockets y reenvía a cada jugador su vista. Las reglas están en
// src/scripts/impostor-logica.js y se prueban sin red (scripts/impostor-check.mjs).
//
// Por qué así, porque cada decisión cambia la factura:
//
//  - API de hibernación (`ctx.acceptWebSocket`), no `ws.accept()`. Con la
//    segunda, Cloudflare cobra tiempo de ejecución mientras haya un socket
//    abierto, es decir, durante toda la partida con 22 personas mirando el
//    móvil. Con la primera, el objeto duerme entre mensajes y solo se cobra
//    cuando alguien toca algo. Una consecuencia: la memoria se pierde al
//    dormir, así que la sala se guarda en `storage` tras cada cambio y el
//    jugador de cada socket va en su attachment, no en una variable.
//  - Los ping los contesta la plataforma sin despertar al objeto
//    (`setWebSocketAutoResponse`).
//  - Los tiempos del turno no son temporizadores del servidor: son marcas
//    absolutas que el móvil resta de su reloj. El objeto no necesita estar
//    despierto mientras corre un turno.
//  - La sala se borra sola a las 6 horas sin actividad (alarma). No queda
//    nada guardado de nadie más allá de eso.

import { DurableObject } from 'cloudflare:workers';
import {
  crearSala, unirse, jugadorPorToken, configurar, iniciar, controlarTurno, abrirVotacion,
  votar, cerrarVotacion, continuar, nuevaPartida, quitar, ceder, salir, vistaPara,
  enviarPista, enviarChat, silenciar, ultimosMensajes,
} from '../src/scripts/impostor-logica.js';

const INACTIVIDAD_MS = 6 * 60 * 60 * 1000;
const MAX_MENSAJE = 2048;
// Un jugador legítimo no toca más de un par de veces por segundo.
const MAX_MENSAJES = 40;
const VENTANA_MS = 10_000;
// Dos veces el máximo de jugadores: cubre reconexiones que aún no se han
// cerrado y pestañas duplicadas, pero no un bucle de sockets abiertos.
const MAX_SOCKETS = 64;

const CIERRE = {
  REEMPLAZADA: 4001,
  QUITADO: 4002,
  RECHAZADO: 4003,
  NO_EXISTE: 4004,
  EXCESO: 1008,
};

export class SalaImpostor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sala = null;
    this.ritmo = new Map();
    ctx.blockConcurrencyWhile(async () => {
      this.sala = (await ctx.storage.get('sala')) ?? null;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/crear' && request.method === 'POST') {
      if (this.sala) return new Response('ya existe', { status: 409 });
      const { codigo, nombre } = await request.json();
      const { sala, anfitrion } = crearSala(codigo, nombre, Date.now());
      this.sala = sala;
      await this.guardar();
      return Response.json({ codigo, token: anfitrion.token });
    }

    if (url.pathname === '/ws' && request.headers.get('upgrade') === 'websocket') {
      const par = new WebSocketPair();
      const [cliente, servidor] = Object.values(par);
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
        servidor.accept();
        servidor.close(CIERRE.EXCESO, 'sala llena de conexiones');
        return new Response(null, { status: 101, webSocket: cliente });
      }
      this.ctx.acceptWebSocket(servidor);
      servidor.serializeAttachment({ id: null });
      if (!this.sala) {
        // Un WebSocket que falla al abrirse no deja leer el motivo, así que
        // se acepta y se cierra con un código propio que la página entiende.
        servidor.send(JSON.stringify({ t: 'error', error: 'sala', mensaje: 'Esa sala no existe o ya terminó.' }));
        servidor.close(CIERRE.NO_EXISTE, 'sala inexistente');
      }
      return new Response(null, { status: 101, webSocket: cliente });
    }

    return new Response('no encontrado', { status: 404 });
  }

  /* ---------- mensajes ---------- */

  async webSocketMessage(ws, mensaje) {
    if (typeof mensaje !== 'string' || mensaje.length > MAX_MENSAJE) return;
    if (this.demasiado(ws)) { ws.close(CIERRE.EXCESO, 'demasiados mensajes'); return; }
    if (!this.sala) { ws.close(CIERRE.NO_EXISTE, 'sala inexistente'); return; }

    let datos;
    try { datos = JSON.parse(mensaje); } catch { return; }
    if (!datos || typeof datos.t !== 'string') return;

    const adjunto = ws.deserializeAttachment() || { id: null };

    if (datos.t === 'hola') {
      await this.saludar(ws, adjunto, datos);
      return;
    }

    const jugador = this.sala.jugadores.find((j) => j.id === adjunto.id);
    if (!jugador) { ws.close(CIERRE.RECHAZADO, 'sin identificar'); return; }

    const ahora = Date.now();

    // El chat no pasa por `difundir()`: reenviar el estado completo de 22
    // jugadores por cada mensaje de chat sería mucho más tráfico que el
    // mensaje. Se guarda y se manda solo el mensaje nuevo.
    if (datos.t === 'chat') {
      const r = enviarChat(this.sala, jugador, datos.texto, ahora);
      if (r.error) { ws.send(JSON.stringify({ t: 'error', error: r.error, mensaje: r.mensaje })); return; }
      await this.guardar();
      this.difundirChat({ t: 'chat', mensaje: r.mensaje });
      return;
    }

    let res;
    switch (datos.t) {
      case 'config': res = configurar(this.sala, jugador, datos.cambios); break;
      case 'iniciar': res = iniciar(this.sala, jugador); break;
      case 'turno': res = controlarTurno(this.sala, jugador, datos.op, ahora); break;
      case 'votacion': res = abrirVotacion(this.sala, jugador); break;
      case 'votar': res = votar(this.sala, jugador, Number(datos.por)); break;
      case 'pista': res = enviarPista(this.sala, jugador, datos.texto); break;
      case 'silenciar': res = silenciar(this.sala, jugador, Number(datos.id), datos.valor === true); break;
      case 'cerrar': res = cerrarVotacion(this.sala, jugador); break;
      case 'continuar': res = continuar(this.sala, jugador); break;
      case 'nueva': res = nuevaPartida(this.sala, jugador); break;
      case 'ceder': res = ceder(this.sala, jugador, Number(datos.id)); break;
      case 'quitar':
        res = quitar(this.sala, jugador, Number(datos.id));
        if (res.ok) this.cerrarDe(res.quitado.id, CIERRE.QUITADO, 'te quitaron de la sala');
        break;
      case 'salir': {
        res = salir(this.sala, jugador);
        this.cerrarDe(jugador.id, 1000, 'saliste');
        if (res.vacia) { await this.borrar(); return; }
        break;
      }
      default: return;
    }

    if (res.error) {
      ws.send(JSON.stringify({ t: 'error', error: res.error, mensaje: res.mensaje }));
      return;
    }
    await this.guardar();
    this.difundir();
  }

  async saludar(ws, adjunto, datos) {
    if (adjunto.id) return;
    let jugador = jugadorPorToken(this.sala, datos.token);
    if (!jugador) {
      const r = unirse(this.sala, datos.nombre);
      if (r.error) {
        // Un token viejo en una partida ya empezada es alguien que perdió su
        // sesión: se le dice que no puede volver a entrar a mitad.
        ws.send(JSON.stringify({ t: 'error', error: r.error, mensaje: r.mensaje }));
        ws.close(CIERRE.RECHAZADO, r.error);
        return;
      }
      jugador = r.jugador;
      await this.guardar();
    }
    // Una sola pestaña por jugador: la vieja suele ser un socket muerto que
    // el navegador aún no ha cerrado tras perder la cobertura.
    this.cerrarDe(jugador.id, CIERRE.REEMPLAZADA, 'otra pestaña');
    ws.serializeAttachment({ id: jugador.id });
    ws.send(JSON.stringify({ t: 'bienvenida', id: jugador.id, token: jugador.token }));
    this.difundir();
    // Quien vuelve (o llega a mitad de la votación) recibe lo último que se dijo
    const historial = ultimosMensajes(this.sala);
    if (historial.length) ws.send(JSON.stringify({ t: 'chat', historial }));
  }

  async webSocketClose(ws) { this.alCerrar(ws); }
  async webSocketError(ws) { this.alCerrar(ws); }

  alCerrar(ws) {
    this.ritmo.delete(ws);
    try { ws.close(1000, 'adiós'); } catch { /* ya estaba cerrado */ }
    // Los demás ven al jugador como desconectado, sin tocar la partida.
    if (this.sala) this.difundir();
  }

  /* ---------- utilidades ---------- */

  demasiado(ws) {
    const ahora = Date.now();
    const r = this.ritmo.get(ws) || { desde: ahora, n: 0 };
    if (ahora - r.desde > VENTANA_MS) { r.desde = ahora; r.n = 0; }
    r.n += 1;
    this.ritmo.set(ws, r);
    return r.n > MAX_MENSAJES;
  }

  socketsAbiertos() {
    return this.ctx.getWebSockets().filter((w) => w.readyState === WebSocket.OPEN || w.readyState === undefined);
  }

  conectados() {
    const ids = new Set();
    for (const w of this.socketsAbiertos()) {
      const a = w.deserializeAttachment();
      if (a && a.id) ids.add(a.id);
    }
    return ids;
  }

  cerrarDe(id, codigo, motivo) {
    for (const w of this.ctx.getWebSockets()) {
      const a = w.deserializeAttachment();
      if (a && a.id === id) {
        try { w.close(codigo, motivo); } catch { /* ya estaba cerrado */ }
      }
    }
  }

  /** A cada jugador, solo lo suyo (vistaPara). */
  difundir() {
    const ahora = Date.now();
    const conectados = this.conectados();
    for (const w of this.socketsAbiertos()) {
      const a = w.deserializeAttachment();
      if (!a || !a.id) continue;
      const j = this.sala.jugadores.find((x) => x.id === a.id);
      if (!j) continue;
      try { w.send(JSON.stringify(vistaPara(this.sala, j, ahora, conectados))); } catch { /* se cerró entre medias */ }
    }
  }

  difundirChat(mensaje) {
    const texto = JSON.stringify(mensaje);
    for (const w of this.socketsAbiertos()) {
      const a = w.deserializeAttachment();
      if (!a || !a.id) continue;
      try { w.send(texto); } catch { /* se cerró entre medias */ }
    }
  }

  async guardar() {
    await this.ctx.storage.put('sala', this.sala);
    await this.ctx.storage.setAlarm(Date.now() + INACTIVIDAD_MS);
  }

  async borrar() {
    for (const w of this.ctx.getWebSockets()) {
      try { w.close(CIERRE.NO_EXISTE, 'sala cerrada'); } catch { /* ya estaba cerrado */ }
    }
    this.sala = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm() {
    await this.borrar();
  }
}
