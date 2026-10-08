// ==========================================================
// AMIGO SECRETO — lógica pura del sorteo (sin DOM)
// ==========================================================
// El sorteo es una sola cadena cerrada: order[0] regala a order[1], …, y el
// último a order[0]. Así no hay «islas» (A↔B) y todos quedan conectados.
//
// Método (SDD de amigo secreto, §2.1), en este orden:
//   1. Barajar y descartar: uniforme por construcción. Sin exclusiones acierta
//      a la primera.
//   2. Si no acierta y n ≤ MAX_EXACTO: contar las cadenas válidas por
//      programación dinámica sobre subconjuntos y elegir una paso a paso con
//      probabilidad proporcional a las que la completan. Uniforme exacto.
//   3. Si n > MAX_EXACTO: búsqueda con vuelta atrás (la de antes). No es
//      uniforme y se informa con `uniforme: false`.
// «No hay sorteo» solo se devuelve cuando está demostrado.
//
// La fuente de azar se inyecta (`rnd`, enteros de 32 bits): crypto en la
// página y un generador con semilla en scripts/amigo-secreto-check.mjs.

const U32 = 4294967296;

// Sin Web Crypto no se sortea: lanza y la página lo explica (criterio 6 de
// la SDD: ningún azar que no sea criptográfico).
export function u32Crypto() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Real uniforme en [0, 1) con 53 bits: los pesos del paso 2 llegan a 10^14.
export function unidad53(rnd = u32Crypto) {
  return ((rnd() >>> 5) * 67108864 + (rnd() >>> 6)) / 9007199254740992;
}

// Entero uniforme en [0, n) sin sesgo de módulo.
export function indiceAlAzar(n, rnd = u32Crypto) {
  const lim = U32 - (U32 % n);
  let x;
  do { x = rnd(); } while (x >= lim);
  return x % n;
}

// Fisher–Yates sobre una copia.
export function barajar(lista, rnd = u32Crypto) {
  const out = [...lista];
  for (let i = out.length - 1; i > 0; i--) {
    const j = indiceAlAzar(i + 1, rnd);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Matriz n×n: permitido[a][b] dice si a puede regalarle a b. Cada grupo
// prohíbe todas las parejas internas en los dos sentidos; `unSentido` es una
// lista de [a, b] en la que solo a no puede regalarle a b.
export function matrizPermitidos(n, grupos = [], unSentido = []) {
  const m = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => a !== b));
  for (const g of grupos) for (const a of g) for (const b of g) m[a][b] = false;
  for (const [a, b] of unSentido) m[a][b] = false;
  return m;
}

export function cadenaValida(orden, permitido) {
  const n = orden.length;
  if (n < 2 || new Set(orden).size !== n) return false;
  return orden.every((a, i) => permitido[a][orden[(i + 1) % n]]);
}

export const INTENTOS_RECHAZO = 2000;
// 16 y no 18: con 18 el conteo reserva ~19 MB y tarda segundos en un
// teléfono de gama baja; con 16, ~4 MB y cuatro veces menos trabajo.
export const MAX_EXACTO = 16;

// Paso 2. f[mask][v]: cuántas maneras hay de terminar la cadena estando en v
// con `mask` ya usado (bit i = persona i+1; la persona 0 abre siempre).
// Devuelve { total, f } o null si no cabe en memoria.
export function contarCadenas(permitido) {
  const n = permitido.length;
  const resto = n - 1;
  const lleno = (1 << resto) - 1;
  let f;
  try { f = new Float64Array((lleno + 1) * n); }
  catch { return null; }
  const idx = (mask, v) => mask * n + v;
  for (let v = 1; v < n; v++) f[idx(lleno, v)] = permitido[v][0] ? 1 : 0;
  for (let mask = lleno - 1; mask >= 0; mask--) {
    for (let v = 0; v < n; v++) {
      if (v === 0 ? mask !== 0 : !(mask & (1 << (v - 1)))) continue;
      let s = 0;
      for (let u = 1; u < n; u++) {
        const bit = 1 << (u - 1);
        if (!(mask & bit) && permitido[v][u]) s += f[idx(mask | bit, u)];
      }
      f[idx(mask, v)] = s;
    }
  }
  return { total: f[idx(0, 0)], f };
}

function muestrearExacto(permitido, conteo, rnd) {
  const n = permitido.length;
  const { f } = conteo;
  const orden = [0];
  let mask = 0, v = 0;
  while (orden.length < n) {
    let r = unidad53(rnd) * f[mask * n + v];
    let elegido = -1;
    for (let u = 1; u < n; u++) {
      const bit = 1 << (u - 1);
      if (mask & bit || !permitido[v][u]) continue;
      const w = f[(mask | bit) * n + u];
      if (w === 0) continue;
      elegido = u;
      if (r < w) break;
      r -= w;
    }
    mask |= 1 << (elegido - 1);
    v = elegido;
    orden.push(v);
  }
  // Se abre en la persona 0; rotar al azar no cambia la cadena pero evita que
  // la primera fila de la lista sea siempre la misma.
  const k = indiceAlAzar(n, rnd);
  return [...orden.slice(k), ...orden.slice(0, k)];
}

// Paso 3: vuelta atrás probando primero a quien le quedan menos opciones.
function buscar(permitido, rnd, ahora, limiteMs) {
  const n = permitido.length;
  const orden = [indiceAlAzar(n, rnd)];
  const usado = new Set(orden);
  const fin = ahora() + limiteMs;
  let agotado = false;
  const extender = () => {
    if (ahora() > fin) { agotado = true; return false; }
    const ultimo = orden[orden.length - 1];
    if (orden.length === n) return permitido[ultimo][orden[0]];
    const libres = [];
    for (let p = 0; p < n; p++) if (!usado.has(p)) libres.push(p);
    const opciones = barajar(libres.filter((p) => permitido[ultimo][p]), rnd)
      .map((p) => ({ p, grado: libres.filter((o) => o !== p && permitido[p][o]).length }))
      .sort((x, y) => x.grado - y.grado);
    for (const { p } of opciones) {
      orden.push(p); usado.add(p);
      if (extender()) return true;
      orden.pop(); usado.delete(p);
      if (agotado) return false;
    }
    return false;
  };
  if (extender()) return { orden, agotado: false };
  return { orden: null, agotado };
}

/**
 * Sortea una cadena cerrada sobre las personas 0..n-1.
 * Devuelve { orden, metodo, uniforme } o { orden: null, demostrado }.
 * `demostrado: false` significa que se agotó el tiempo sin poder probarlo.
 */
export function sortearCadena(permitido, {
  rnd = u32Crypto, intentos = INTENTOS_RECHAZO, maxExacto = MAX_EXACTO,
  ahora = () => Date.now(), limiteMs = 1000,
} = {}) {
  const n = permitido.length;
  if (n < 2) return { orden: null, demostrado: true };
  const personas = Array.from({ length: n }, (_, i) => i);

  for (let i = 0; i < intentos; i++) {
    const orden = barajar(personas, rnd);
    if (cadenaValida(orden, permitido)) return { orden, metodo: 'rechazo', uniforme: true };
  }

  if (n <= maxExacto) {
    const conteo = contarCadenas(permitido);
    if (conteo) {
      if (conteo.total === 0) return { orden: null, demostrado: true };
      return { orden: muestrearExacto(permitido, conteo, rnd), metodo: 'exacto', uniforme: true };
    }
  }

  const r = buscar(permitido, rnd, ahora, limiteMs);
  if (r.orden) return { orden: r.orden, metodo: 'busqueda', uniforme: false };
  return { orden: null, demostrado: !r.agotado };
}

/* ==========================================================
   Lectura de lo que escribe el organizador
   ========================================================== */

// «José» y «jose» → «jose»: para avisar de parecidos. Sin tildes ni mayúsculas.
export function claveParecida(nombre) {
  return String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}
// «Ana» y «ana» → iguales: estos sí bloquean, como antes.
export function claveExacta(nombre) {
  return String(nombre).toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

// Un celular (7+ dígitos) o un correo: es el contacto de la persona de al
// lado, no otra persona.
const pareceContacto = (t) => /@/.test(t) || (t.replace(/\D/g, '').length >= 7 && !/[a-zñáéíóú]{2}/i.test(t));

/**
 * Lo que la gente escribe de verdad: «Ana, Bruno, Carla» o una por línea.
 * Las comas y los punto y coma separan personas; un celular o correo se pega
 * a la persona anterior («Bruno, 3001234567» o «Bruno 3001234567»); lo que va
 * tras «|» es la pista de la última persona de la línea.
 */
export function leerParticipantes(texto) {
  const out = [];
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const [antes, ...resto] = linea.split('|');
    const pista = resto.join('|').trim();
    let ultima = null;
    for (const trozo of antes.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
      if (pareceContacto(trozo)) {
        if (ultima && !ultima.contacto) ultima.contacto = trozo;
        continue;
      }
      // «Ana 3001234567» o «Ana ana@correo.com» en el mismo trozo
      const m = /^(.*?)\s+(\+?[\d\s().-]{7,}|\S+@\S+)$/.exec(trozo);
      ultima = m && pareceContacto(m[2])
        ? { nombre: m[1].trim(), contacto: m[2].trim(), pista: '' }
        : { nombre: trozo, contacto: '', pista: '' };
      out.push(ultima);
    }
    if (ultima && pista) ultima.pista = pista;
  }
  return out;
}

export function escribirParticipantes(lista) {
  return lista.map((p) => p.nombre + (p.contacto ? `, ${p.contacto}` : '') + (p.pista ? ` | ${p.pista}` : '')).join('\n');
}

/** Repetidos exactos (bloquean) y parecidos por tildes (solo aviso). */
export function duplicados(lista) {
  const agrupar = (f) => {
    const m = new Map();
    for (const p of lista) {
      const k = f(p.nombre);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p.nombre);
    }
    return [...m.values()].filter((g) => g.length > 1);
  };
  const exactos = agrupar(claveExacta);
  const conExacto = new Set(exactos.flat().map(claveExacta));
  const parecidos = agrupar(claveParecida).filter((g) => !g.some((n) => conExacto.has(claveExacta(n))));
  return { exactos, parecidos };
}

/**
 * Exclusiones: «Ana, Luis» (grupo, los dos sentidos) o «Ana > Luis, Sofía»
 * (Ana no le regala a Luis ni a Sofía). Devuelve índices sobre `lista`.
 */
export function leerExclusiones(texto, lista) {
  const indice = new Map(lista.map((p, i) => [claveExacta(p.nombre), i]));
  const grupos = [], unSentido = [], desconocidos = [], sueltos = [];
  const buscar = (n) => {
    const i = indice.get(claveExacta(n));
    if (i === undefined && !desconocidos.includes(n)) desconocidos.push(n);
    return i;
  };
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    if (linea.includes('>')) {
      const [izq, der] = linea.split('>');
      const a = buscar(izq.trim());
      for (const n of der.split(',').map((x) => x.trim()).filter(Boolean)) {
        const b = buscar(n);
        if (a !== undefined && b !== undefined && a !== b) unSentido.push([a, b]);
      }
      continue;
    }
    const nombres = linea.split(',').map((x) => x.trim()).filter(Boolean);
    if (nombres.length === 1) { sueltos.push(nombres[0]); continue; }
    const g = [...new Set(nombres.map(buscar).filter((i) => i !== undefined))];
    if (g.length >= 2) grupos.push(g);
  }
  return { grupos, unSentido, desconocidos, sueltos };
}

/** Imposibles evidentes antes de sortear. Devuelve un mensaje o ''. */
export function problemaEvidente(lista, { grupos, unSentido }) {
  const n = lista.length;
  if (n < 2) return '';
  const max = Math.floor(n / 2);
  const grande = grupos.find((g) => g.length > max);
  if (grande) {
    return `El grupo «${grande.map((i) => lista[i].nombre).join(', ')}» tiene ${grande.length} de ${n} personas. Así no hay sorteo posible: cada grupo puede tener como mucho ${max}. Agrega participantes o parte el grupo.`;
  }
  const permitido = matrizPermitidos(n, grupos, unSentido);
  for (let a = 0; a < n; a++) {
    const salen = permitido[a].filter(Boolean).length;
    const entran = permitido.filter((fila) => fila[a]).length;
    if (salen === 0 || entran === 0) {
      return `Con estas exclusiones no hay sorteo posible: «${lista[a].nombre}» no tiene ${salen === 0 ? 'a quién regalarle' : 'quién le regale'}. Quita alguna exclusión o agrega participantes.`;
    }
  }
  return '';
}

/** CSV simple: tres primeras columnas (nombre, celular, deseo), con comillas, sin cabecera. */
export function leerCSV(texto) {
  const filas = [];
  const sep = /;/.test(String(texto).split(/\r?\n/)[0] ?? '') && !/,/.test(String(texto).split(/\r?\n/)[0] ?? '') ? ';' : ',';
  for (const linea of String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const celdas = [];
    let actual = '', comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (comillas && linea[i + 1] === '"') { actual += '"'; i++; }
        else comillas = !comillas;
      } else if (c === sep && !comillas) { celdas.push(actual.trim()); actual = ''; }
      else actual += c;
    }
    celdas.push(actual.trim());
    filas.push([celdas[0] ?? '', celdas[1] ?? '', celdas[2] ?? '']);
  }
  return quitarCabecera(filas);
}

export function quitarCabecera(filas) {
  const cab = ['nombre', 'nombres', 'name', 'participante', 'participantes', 'participant', 'contacto', 'email', 'correo', 'celular'];
  const out = filas.filter((f) => f[0]);
  if (out.length && cab.includes(claveParecida(out[0][0]))) out.shift();
  // Columna A: nombre · B: celular o correo (opcional) · C: deseo (opcional)
  return out.map(([nombre, contacto, pista]) => ({ nombre, contacto: contacto ?? '', pista: pista ?? '' }));
}

// wa.me necesita el indicativo: un celular colombiano escrito tal cual (10
// dígitos que empiezan por 3) recibe el 57. Un correo no es número.
export function numeroWhatsapp(contacto) {
  if (!contacto || contacto.includes('@')) return '';
  const d = contacto.replace(/\D/g, '');
  if (!d) return '';
  if (!contacto.trim().startsWith('+') && /^3\d{9}$/.test(d)) return `57${d}`;
  return d.length >= 8 ? d : '';
}

// Sin símbolo de moneda por ahora (el grupo sabe en qué moneda habla):
// solo el número con separador de miles, «50.000».
export function formatoPresupuesto(valor, { locale = 'es-CO' } = {}) {
  const limpio = String(valor ?? '').replace(/[^\d]/g, '');
  if (!limpio) return String(valor ?? '').trim();
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(limpio));
  } catch { return limpio; }
}

// RFC 5545 §3.3.11: se escapan «\», «;», «,» y los saltos de línea; los
// demás caracteres de control se quitan. Sin esto, un enlace fabricado con
// un «\r» en el mensaje inyectaba propiedades o eventos en el .ics.
const escIcs = (s) => String(s)
  .replace(/\r\n|\r|\n/g, '\n')
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/[;,]/g, (c) => `\\${c}`)
  .replace(/\n/g, '\\n');

// Líneas de 75 octetos como máximo, continuadas con un espacio (§3.1).
const octetos = (s) => new TextEncoder().encode(s).length;
function plegar(linea) {
  if (octetos(linea) <= 75) return linea;
  const partes = [];
  let actual = '', tam = 0;
  for (const ch of linea) {
    const n = octetos(ch);
    if (tam + n > (partes.length ? 74 : 75)) { partes.push(actual); actual = ''; tam = 0; }
    actual += ch; tam += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

/** Evento de día completo (RFC 5545) para el intercambio. */
export function generarIcs({ fecha, grupo, lugar, mensaje, nombre }, { ahora = new Date(), uid = '' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) return null;
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, '');
  const ini = new Date(Date.UTC(y, m - 1, d));
  const fin = new Date(Date.UTC(y, m - 1, d + 1));
  const sello = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const titulo = `Amigo secreto${grupo ? ` · ${grupo}` : ''}`;
  const desc = [`Le regalas a: ${nombre}`, mensaje].filter(Boolean).join('\n');
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Decidelo.app//Amigo secreto//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid || `${dia(ini)}-${Math.abs(hash(titulo + nombre))}`}@decidelo.app`,
    `DTSTAMP:${sello}`,
    `DTSTART;VALUE=DATE:${dia(ini)}`,
    `DTEND;VALUE=DATE:${dia(fin)}`,
    `SUMMARY:${escIcs(titulo)}`,
    `DESCRIPTION:${escIcs(desc)}`,
    ...(lugar ? [`LOCATION:${escIcs(lugar)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lineas.map(plegar).join('\r\n') + '\r\n';
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0; return h; }
