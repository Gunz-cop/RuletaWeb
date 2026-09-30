// ==========================================================
// PIEDRA, PAPEL O TIJERA — retos a distancia por enlace
// ==========================================================
// Sin servidor: todo el reto viaja en el enlace, en el fragmento (#), que el
// navegador nunca envía a ningún servidor. Dos enlaces:
//
//   #reto=…       ida: quien reta, a quién, qué se decide y su jugada sellada
//   #resultado=…  vuelta: lo mismo más la jugada de quien responde
//
// La jugada de quien reta va ofuscada, no cifrada: basta para que no se lea
// a simple vista en el enlace, no contra alguien que lea este código. Es la
// misma garantía que el amigo secreto. Un reto justo de verdad necesita un
// servidor o un tercer mensaje; la propuesta está en
// docs/propuesta-backend-retos.md.
//
// Funciones puras (sin DOM) para poder probarlas con node:
// scripts/ppt-reto-check.mjs.

export const FORMAS = ['piedra', 'papel', 'tijera'];
export const NAME_MAX = 20;
export const STAKE_MAX = 60;
const VERSION = 1;
const ID_LEN = 10;
const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789';

const VENCE = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' };

export function ganador(e1, e2) {
  if (e1 === e2) return 'empate';
  return VENCE[e1] === e2 ? 'j1' : 'j2';
}

export function nuevoId(random = defaultRandom) {
  let id = '';
  for (let i = 0; i < ID_LEN; i++) id += ALFABETO[random(ALFABETO.length)];
  return id;
}

function defaultRandom(n) {
  const v = new Uint32Array(1);
  globalThis.crypto.getRandomValues(v);
  return v[0] % n;
}

// Desplazamiento 0–2 que depende del id: la misma jugada se escribe distinta
// en cada reto, así no hay un código fijo para "piedra" que aprenderse
function desplazamiento(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 3;
}

export function sellar(forma, id) {
  const i = FORMAS.indexOf(forma);
  if (i < 0) throw new Error(`jugada desconocida: ${forma}`);
  return (i + desplazamiento(id)) % 3;
}

export function abrir(sello, id) {
  if (![0, 1, 2].includes(sello)) return null;
  return FORMAS[(sello - desplazamiento(id) + 3) % 3];
}

// base64url de un JSON en UTF-8 (nombres con tildes y eñes)
function codificar(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodificar(texto) {
  try {
    const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return null;
  }
}

// Los textos vienen de un enlace que cualquiera puede fabricar: se recortan
// y solo se escriben con textContent, nunca como HTML
const limpio = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validar(obj) {
  if (!obj || obj.v !== VERSION || typeof obj.id !== 'string') return null;
  if (!/^[a-z0-9]{6,16}$/.test(obj.id)) return null;
  const e1 = abrir(obj.s, obj.id);
  if (!e1) return null;
  return {
    id: obj.id,
    a: limpio(obj.a, NAME_MAX),
    b: limpio(obj.b, NAME_MAX),
    q: limpio(obj.q, STAKE_MAX),
    e1,
  };
}

// Ida: quien reta elige y comparte
export function crearReto({ id, a, b, q, e1 }) {
  return codificar({ v: VERSION, id, a: limpio(a, NAME_MAX), b: limpio(b, NAME_MAX), q: limpio(q, STAKE_MAX), s: sellar(e1, id) });
}

export function leerReto(token) {
  return validar(decodificar(token));
}

// Vuelta: quien responde añade su jugada (ya no hay nada que esconder)
export function crearResultado(reto, e2) {
  return codificar({ v: VERSION, id: reto.id, a: reto.a, b: reto.b, q: reto.q, s: sellar(reto.e1, reto.id), r: e2 });
}

export function leerResultado(token) {
  const obj = decodificar(token);
  const reto = validar(obj);
  if (!reto || !FORMAS.includes(obj.r)) return null;
  return { ...reto, e2: obj.r };
}

// Lee #reto=… o #resultado=… del fragmento de la URL
export function leerFragmento(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (p.get('resultado')) {
    const r = leerResultado(p.get('resultado'));
    return r ? { tipo: 'resultado', ...r } : { tipo: 'roto' };
  }
  if (p.get('reto')) {
    const r = leerReto(p.get('reto'));
    return r ? { tipo: 'reto', ...r } : { tipo: 'roto' };
  }
  return null;
}
