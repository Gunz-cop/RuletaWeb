// ==========================================================
// AMIGO SECRETO — enlaces y sorteo guardado (sin DOM)
// ==========================================================
// SDD de amigo secreto §5 y RF-13.
//
// v1 (2023–2026): #revelar=<XOR con «decidelo» + Base64>, y antes ?revelar=.
//   Hay miles repartidos por WhatsApp: se leen SIEMPRE, reproduciendo la
//   cadena exacta del lector viejo, más un arreglo para el «+» que algunos
//   clientes entregan como espacio. Probado con enlaces generados por el
//   código viejo en tests/fixtures/amigo-secreto-enlaces-v1.json.
//
// v2: #v=2&d=<base64url( banderas ‖ clave AES-GCM 128 ‖ IV 12 ‖ cifrado )>.
//   La clave va dentro del enlace: NO impide fabricar un enlace. Sirve para
//   que el nombre no se lea a simple vista y para detectar un enlace cortado
//   (la etiqueta GCM falla). Sin compresión: con textos cortos alarga.
//
// Todo lo que sale de aquí es texto del usuario: quien lo pinte debe usar
// textContent, nunca innerHTML.

const CLAVE_V1 = 'decidelo';
const VERSION_V2 = 2;

/* ---------- utilidades ---------- */

function aBase64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const utf8 = new TextEncoder();
const deUtf8 = new TextDecoder('utf-8', { fatal: true });

/* ---------- v1 ---------- */

// Igual que decryptName de antes: el valor llega ya decodificado por
// URLSearchParams, que convierte «+» en espacio; en Base64 no hay espacios,
// así que un espacio solo puede ser un «+» perdido y se repone.
export function leerV1(valor) {
  try {
    const b64 = decodeURIComponent(String(valor).replace(/ /g, '+'));
    const xor = atob(b64);
    const bytes = new Uint8Array(xor.length);
    for (let i = 0; i < xor.length; i++) {
      bytes[i] = xor.charCodeAt(i) ^ CLAVE_V1.charCodeAt(i % CLAVE_V1.length);
    }
    const nombre = deUtf8.decode(bytes);
    return nombre.trim() ? nombre : null;
  } catch {
    return null;
  }
}

/* ---------- v2 ---------- */

const CAMPOS = { n: 'nombre', g: 'grupo', p: 'presupuesto', f: 'fecha', l: 'lugar', m: 'mensaje', h: 'pista' };

function compactar(datos) {
  const o = {};
  for (const [corto, largo] of Object.entries(CAMPOS)) {
    const v = datos[largo];
    if (v !== undefined && v !== null && String(v).trim() !== '') o[corto] = String(v).trim();
  }
  return o;
}

function expandir(o) {
  const datos = {};
  for (const [corto, largo] of Object.entries(CAMPOS)) if (typeof o[corto] === 'string') datos[largo] = o[corto];
  return datos;
}

/** Devuelve el valor de `d` para `#v=2&d=…` con los datos de una persona. */
export async function crearV2(datos, { aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n)) } = {}) {
  if (!datos || !String(datos.nombre ?? '').trim()) throw new Error('crearV2: falta el nombre');
  const claveBruta = aleatorio(16);
  const iv = aleatorio(12);
  const clave = await crypto.subtle.importKey('raw', claveBruta, 'AES-GCM', false, ['encrypt']);
  const claro = utf8.encode(JSON.stringify(compactar(datos)));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, claro));
  const out = new Uint8Array(1 + 16 + 12 + cifrado.length);
  out[0] = VERSION_V2 << 4; // bit 0 = comprimido: nunca, de momento
  out.set(claveBruta, 1);
  out.set(iv, 17);
  out.set(cifrado, 29);
  return aBase64url(out);
}

/** Lee el valor de `d`. Devuelve los datos o null si está dañado. */
export async function leerV2(d) {
  try {
    const bytes = deBase64url(String(d).trim());
    if (bytes.length < 1 + 16 + 12 + 16 + 2) return null;
    if (bytes[0] >> 4 !== VERSION_V2 || bytes[0] & 1) return null;
    const clave = await crypto.subtle.importKey('raw', bytes.slice(1, 17), 'AES-GCM', false, ['decrypt']);
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(17, 29) }, clave, bytes.slice(29));
    const datos = expandir(JSON.parse(deUtf8.decode(new Uint8Array(claro))));
    return datos.nombre && datos.nombre.trim() ? datos : null;
  } catch {
    return null;
  }
}

/* ---------- lectura de la dirección ---------- */

/**
 * Mira hash y query de una URL. Devuelve:
 *   null                                   si no es un enlace de revelación
 *   { formato: 'v1'|'v2', datos }          si se pudo leer
 *   { formato, error: 'dañado'|'desconocido' }
 */
export async function leerEnlace(href) {
  const url = new URL(href, 'https://decidelo.app');
  const hash = new URLSearchParams(url.hash.slice(1));
  const query = url.searchParams;

  const v1 = hash.get('revelar') ?? query.get('revelar');
  if (v1 !== null) {
    const nombre = leerV1(v1);
    return nombre ? { formato: 'v1', datos: { nombre } } : { formato: 'v1', error: 'dañado' };
  }

  const v = hash.get('v');
  if (v === null) return null;
  if (v !== String(VERSION_V2)) return { formato: `v${v}`, error: 'desconocido' };
  const datos = await leerV2(hash.get('d') ?? '');
  return datos ? { formato: 'v2', datos } : { formato: 'v2', error: 'dañado' };
}

export function urlV2(base, d) {
  return `${base}#v=${VERSION_V2}&d=${d}`;
}

/* ---------- sorteo guardado ---------- */

export const CLAVE_GUARDADO = 'decidelo_amigo_sorteo';
export const CLAVE_GUARDADO_V1 = 'amigo-secreto:ultimo-sorteo';

/**
 * Normaliza un sorteo guardado, del formato viejo o del nuevo, al nuevo.
 * Las URLs se conservan TAL CUAL (RF-13): ya se enviaron y regenerarlas
 * dejaría de coincidir con lo que tiene cada participante.
 * Viejo: { date, text, exclusions, matrixRows:[{giverAnon, receiverAnon}],
 *          links:[{ name, contact, url, sent }] }
 */
export function migrarGuardado(dato) {
  if (!dato || typeof dato !== 'object') return null;
  if (dato.version === 2) {
    return Array.isArray(dato.enlaces) && Array.isArray(dato.matriz) ? dato : null;
  }
  if (!Array.isArray(dato.links) || !Array.isArray(dato.matrixRows)) return null;
  return {
    version: 2,
    fecha: typeof dato.date === 'number' ? dato.date : Date.now(),
    texto: typeof dato.text === 'string' ? dato.text : '',
    exclusiones: typeof dato.exclusions === 'string' ? dato.exclusions : '',
    detalles: {},
    matriz: dato.matrixRows.map((r) => ({ da: String(r.giverAnon ?? ''), recibe: String(r.receiverAnon ?? '') })),
    enlaces: dato.links.map((l) => ({
      nombre: String(l.name ?? ''),
      contacto: String(l.contact ?? ''),
      url: String(l.url ?? ''),
      enviado: Boolean(l.sent),
    })),
  };
}

/** Lee el sorteo guardado con un `almacen` tipo localStorage. */
export function cargarGuardado(almacen) {
  for (const clave of [CLAVE_GUARDADO, CLAVE_GUARDADO_V1]) {
    try {
      const raw = almacen.getItem(clave);
      if (!raw) continue;
      const dato = migrarGuardado(JSON.parse(raw));
      if (dato) return dato;
    } catch { /* sin almacenamiento o dato corrupto */ }
  }
  return null;
}

export function guardar(almacen, sorteo) {
  try { almacen.setItem(CLAVE_GUARDADO, JSON.stringify(sorteo)); return true; }
  catch { return false; }
}

export function borrarGuardado(almacen) {
  for (const clave of [CLAVE_GUARDADO, CLAVE_GUARDADO_V1]) {
    try { almacen.removeItem(clave); } catch { /* nada */ }
  }
}
