// ==========================================================
// Worker de Decídelo.app — solo atiende /api/*
// ==========================================================
// El resto del sitio sigue siendo HTML estático servido por Cloudflare sin
// pasar por aquí (wrangler.jsonc: `run_worker_first: ["/api/*"]`). Este
// archivo existe únicamente para el impostor en línea; ver AGENTS.md,
// regla 3 bis, y docs/sdd-impostor.md.
//
//   POST /api/impostor/salas              crea una sala → { codigo, token }
//   GET  /api/impostor/salas/:codigo/ws   WebSocket de la sala
//
// Todo lo que decide el juego vive en src/scripts/impostor-logica.js y todo
// lo que se guarda, en la sala (worker/sala.js).

import { codigoAleatorio, normalizarCodigo, normalizarNombre } from '../src/scripts/impostor-logica.js';

export { SalaImpostor } from './sala.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: JSON_HEADERS });
}

function salaDe(env, codigo) {
  return env.SALAS.get(env.SALAS.idFromName(codigo));
}

// Sin cuentas, la IP es lo único con lo que frenar a quien llene el
// almacenamiento de salas vacías. El binding es opcional para que el Worker
// arranque igual donde no esté definido (por ejemplo en un `wrangler dev`
// antiguo).
async function pasaLimite(env, request, nombre) {
  const limitador = env[nombre];
  if (!limitador) return true;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const { success } = await limitador.limit({ key: ip });
  return success;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const partes = url.pathname.split('/').filter(Boolean);

    if (partes[0] !== 'api' || partes[1] !== 'impostor' || partes[2] !== 'salas') {
      return json({ error: 'no_encontrado' }, 404);
    }

    // Crear sala
    if (partes.length === 3) {
      if (request.method !== 'POST') return json({ error: 'metodo' }, 405);
      if (!(await pasaLimite(env, request, 'LIMITE_SALAS'))) {
        return json({ error: 'limite', mensaje: 'Demasiadas salas creadas desde tu red. Prueba en un minuto.' }, 429);
      }
      let datos = {};
      try { datos = await request.json(); } catch { /* cuerpo vacío */ }
      const nombre = normalizarNombre(datos.nombre);
      if (!nombre) return json({ error: 'nombre', mensaje: 'Escribe tu nombre.' }, 400);

      // El código lo elige el servidor; si ya existe, se prueba otro.
      for (let intento = 0; intento < 8; intento++) {
        const codigo = codigoAleatorio();
        const respuesta = await salaDe(env, codigo).fetch('https://sala/crear', {
          method: 'POST',
          body: JSON.stringify({ codigo, nombre }),
        });
        if (respuesta.status === 409) continue;
        if (!respuesta.ok) return json({ error: 'servidor' }, 500);
        return new Response(respuesta.body, { status: 201, headers: JSON_HEADERS });
      }
      return json({ error: 'servidor', mensaje: 'No se pudo crear la sala. Inténtalo otra vez.' }, 503);
    }

    // WebSocket de una sala
    if (partes.length === 5 && partes[4] === 'ws') {
      if (request.headers.get('upgrade') !== 'websocket') return json({ error: 'upgrade' }, 426);
      const codigo = normalizarCodigo(partes[3]);
      if (!codigo) return json({ error: 'codigo', mensaje: 'Código de sala no válido.' }, 400);
      if (!(await pasaLimite(env, request, 'LIMITE_CONEXIONES'))) {
        return json({ error: 'limite', mensaje: 'Demasiados intentos. Espera un momento.' }, 429);
      }
      return salaDe(env, codigo).fetch(new Request('https://sala/ws', request));
    }

    return json({ error: 'no_encontrado' }, 404);
  },
};
