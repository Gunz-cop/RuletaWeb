// ==========================================================
// MONEDA — lógica pura (sin DOM)
// ==========================================================
// Nombres regionales, series "mejor de N" y lanzamientos de varias monedas.
// No toca el documento para poder comprobarla con Node
// (scripts/moneda-serie-check.mjs, dentro de `npm test`).
//
// Los lados se modelan siempre como 'heads' / 'tails'; el nombre que ve el
// visitante sale del juego de nombres elegido.

// Juegos de nombres. La correspondencia país → expresión la confirmó el
// propietario del sitio (tabla en DESIGN.md, "Variantes regionales").
export const NOMBRES = {
  cruz: { etiqueta: 'Cara o cruz', heads: 'Cara', tails: 'Cruz', glifos: ['C', 'X'], headsPl: 'caras', tailsPl: 'cruces' },
  sello: { etiqueta: 'Cara o sello', heads: 'Cara', tails: 'Sello', headsPl: 'caras', tailsPl: 'sellos' },
  escudo: { etiqueta: 'Cara o escudo', heads: 'Cara', tails: 'Escudo', headsPl: 'caras', tailsPl: 'escudos' },
  corona: { etiqueta: 'Escudo o corona', heads: 'Escudo', tails: 'Corona', headsPl: 'escudos', tailsPl: 'coronas' },
  caracorona: { etiqueta: 'Cara o corona', heads: 'Cara', tails: 'Corona', headsPl: 'caras', tailsPl: 'coronas' },
  aguila: { etiqueta: 'Águila o sol', heads: 'Águila', tails: 'Sol', headsPl: 'águilas', tailsPl: 'soles' },
  ceca: { etiqueta: 'Cara o ceca', heads: 'Cara', tails: 'Ceca', headsPl: 'caras', tailsPl: 'cecas' },
  coroa: { etiqueta: 'Cara ou coroa', heads: 'Cara', tails: 'Coroa', headsPl: 'caras', tailsPl: 'coroas' },
};

// País → juego de nombres por defecto. Lo que no está aquí (España, Puerto
// Rico, Paraguay, Venezuela y cualquier otro país) usa "cara o cruz".
const POR_PAIS = {
  CO: 'sello', CL: 'sello', PE: 'sello', EC: 'sello', PA: 'sello',
  GT: 'escudo', BO: 'escudo', HN: 'escudo',
  CR: 'corona',
  SV: 'caracorona',
  MX: 'aguila',
  AR: 'ceca', UY: 'ceca',
  BR: 'coroa',
};

// Zona horaria del sistema → país. Es la forma de saber la región sin pedir
// ubicación: no dispara ningún permiso, no sale del navegador y funciona
// aunque el navegador esté en inglés o en "es" a secas. El sitio es
// estático, así que no hay servidor que pueda leer el país de la petición.
const ZONAS = {
  'America/Bogota': 'CO',
  'America/Santiago': 'CL', 'America/Punta_Arenas': 'CL', 'Pacific/Easter': 'CL',
  'America/Lima': 'PE',
  'America/Guayaquil': 'EC', 'Pacific/Galapagos': 'EC',
  'America/Panama': 'PA',
  'America/Guatemala': 'GT',
  'America/La_Paz': 'BO',
  'America/Tegucigalpa': 'HN',
  'America/Costa_Rica': 'CR',
  'America/El_Salvador': 'SV',
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX',
  'America/Cancun': 'MX', 'America/Merida': 'MX', 'America/Chihuahua': 'MX',
  'America/Hermosillo': 'MX', 'America/Mazatlan': 'MX', 'America/Matamoros': 'MX',
  'America/Bahia_Banderas': 'MX', 'America/Ojinaga': 'MX', 'America/Ciudad_Juarez': 'MX',
  'America/Buenos_Aires': 'AR', 'America/Cordoba': 'AR', 'America/Mendoza': 'AR',
  'America/Montevideo': 'UY',
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR',
  'America/Recife': 'BR', 'America/Belem': 'BR', 'America/Manaus': 'BR',
  'America/Cuiaba': 'BR', 'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR',
  'America/Boa_Vista': 'BR', 'America/Rio_Branco': 'BR', 'America/Maceio': 'BR',
  'America/Araguaina': 'BR', 'America/Santarem': 'BR', 'America/Noronha': 'BR',
  'America/Eirunepe': 'BR',
  'America/Caracas': 'VE',
  'America/Asuncion': 'PY',
  'America/Puerto_Rico': 'PR',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES',
};

export function paisPorZona(zona) {
  const z = String(zona || '');
  if (z.startsWith('America/Argentina/')) return 'AR';
  return Object.hasOwn(ZONAS, z) ? ZONAS[z] : null;
}

function paisPorIdioma(idioma) {
  return String(idioma || '').split('-')[1]?.toUpperCase() || null;
}

// Zona horaria primero (dice dónde está el visitante), región del idioma
// después (dice de dónde es su navegador), "cara o cruz" si nada coincide.
export function nombresPorDefecto({ zona, idioma } = {}) {
  for (const pais of [paisPorZona(zona), paisPorIdioma(idioma)]) {
    if (pais && Object.hasOwn(POR_PAIS, pais)) return POR_PAIS[pais];
  }
  return 'cruz';
}

export function nombresPorIdioma(idioma) {
  return nombresPorDefecto({ idioma });
}

// Object.hasOwn y no NOMBRES[clave]: la clave puede venir de un enlace, y
// '__proto__' o 'constructor' existen en cualquier objeto y romperían la página.
export function juegoDeNombres(clave) {
  return typeof clave === 'string' && Object.hasOwn(NOMBRES, clave) ? clave : 'cruz';
}

// Letra de cada cara: la inicial, salvo que el juego declare las suyas
// (la cruz se marca con una X, no con "Cr"). Si las dos iniciales coinciden
// (Cara / Ceca) la cruz lleva dos letras para que las caras no sean iguales.
export function glifos(clave) {
  const n = NOMBRES[juegoDeNombres(clave)];
  if (n.glifos) return { heads: n.glifos[0], tails: n.glifos[1] };
  const h = n.heads[0];
  const t = n.tails[0] === h ? n.tails.slice(0, 2) : n.tails[0];
  return { heads: h, tails: t };
}

export const MODOS = ['una', 'mejor3', 'mejor5', 'varias'];

export function modoValido(modo) {
  return MODOS.includes(modo) ? modo : 'una';
}

function lado(rnd) {
  return rnd() < 0.5 ? 'heads' : 'tails';
}

// Mejor de N: se lanza hasta que un lado llega a la mayoría. Devuelve la
// secuencia completa para que la animación la reproduzca tiro a tiro.
export function jugarSerie(n, rnd) {
  const meta = Math.floor(n / 2) + 1;
  const tiros = [];
  const marcador = { heads: 0, tails: 0 };
  while (marcador.heads < meta && marcador.tails < meta) {
    const s = lado(rnd);
    tiros.push(s);
    marcador[s] += 1;
  }
  return { tiros, marcador, ganador: marcador.heads === meta ? 'heads' : 'tails' };
}

export function lanzarVarias(n, rnd) {
  return Array.from({ length: n }, () => lado(rnd));
}

export function resumenVarias(lados, clave) {
  const nm = NOMBRES[juegoDeNombres(clave)];
  const h = lados.filter((s) => s === 'heads').length;
  const t = lados.length - h;
  const parte = (k, sing, pl) => `${k} ${k === 1 ? sing.toLowerCase() : pl}`;
  return `${parte(h, nm.heads, nm.headsPl)} · ${parte(t, nm.tails, nm.tailsPl)}`;
}
