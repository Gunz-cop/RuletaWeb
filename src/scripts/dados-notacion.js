// ==========================================================
// DADOS — notación de rol (lógica pura, sin DOM)
// ==========================================================
// Lee tiradas escritas como en los juegos de rol: «2d6+3», «1d20+5»,
// «3d8-1», «d20», «1d8+1d6+2». Devuelve los grupos de dados y el
// modificador, o un mensaje que dice qué está mal y cómo arreglarlo.
// También el desglose («12 + 5») y las reglas de ventaja y de crear
// personaje. Probado con Node en scripts/dados-notacion-check.mjs.
//
// Límites: solo los dados que la mesa sabe dibujar (d4 a d20) y como
// mucho MAX_DADOS a la vez, porque lo que enseña la mesa tiene que
// coincidir con el texto: no se tira un dado que no se ve.

export const LADOS_VALIDOS = [4, 6, 8, 10, 12, 20];
export const MAX_DADOS = 6;
const MAX_MOD = 100;
const MAX_LARGO = 40;

const lista = LADOS_VALIDOS.map((l) => `d${l}`);
const DISPONIBLES = `${lista.slice(0, -1).join(', ')} o ${lista[lista.length - 1]}`;

// texto → { ok: true, grupos: [{ signo, cantidad, lados }], mod, texto }
//       | { ok: false, error }
// `texto` es la tirada escrita de forma normal («1d20+5»), para mostrarla
// y guardarla.
export function parsear(entrada) {
  const crudo = String(entrada ?? '');
  // Se aceptan espacios, D mayúscula y el signo menos tipográfico
  const s = crudo.replace(/\s+/g, '').replace(/[−–]/g, '-').toLowerCase();
  if (!s) return { ok: false, error: 'Escribe una tirada, por ejemplo 1d20+5.' };
  if (s.length > MAX_LARGO) return { ok: false, error: 'La tirada es demasiado larga.' };

  const raro = s.match(/[^0-9d+-]/);
  if (raro) return { ok: false, error: `No entiendo «${raro[0]}». Usa números, la letra d, + y -, como en 2d6+3.` };

  const grupos = [];
  let mod = 0;
  let i = 0;
  while (i < s.length) {
    let signo = 1;
    if (s[i] === '+' || s[i] === '-') {
      signo = s[i] === '-' ? -1 : 1;
      i++;
    } else if (i > 0) {
      return { ok: false, error: 'Separa cada parte con + o -.' };
    }
    const m = s.slice(i).match(/^(\d*)d(\d*)|^(\d+)/);
    if (!m) {
      const op = s[i - 1];
      if (i >= s.length) return { ok: false, error: `Falta algo después del ${op}.` };
      return { ok: false, error: `Sobra un signo: «${op}${s[i]}». Escribe la tirada como 2d6+3.` };
    }
    if (m[3] !== undefined) {
      const n = Number(m[3]);
      if (n > MAX_MOD) return { ok: false, error: `El modificador ${n} es demasiado grande (máximo ${MAX_MOD}).` };
      mod += signo * n;
    } else {
      const cantidad = m[1] === '' ? 1 : Number(m[1]);
      if (m[2] === '') return { ok: false, error: `Falta el número de caras después de la d: ${DISPONIBLES}.` };
      const lados = Number(m[2]);
      if (cantidad === 0) return { ok: false, error: 'Hace falta al menos un dado: 1d20, no 0d20.' };
      if (!LADOS_VALIDOS.includes(lados)) {
        return { ok: false, error: `No hay dado de ${lados} caras. Usa ${DISPONIBLES}.` };
      }
      grupos.push({ signo, cantidad, lados });
    }
    i += m[0].length;
  }

  if (!grupos.length) return { ok: false, error: 'Falta el dado: escribe algo como 1d20+5.' };
  const total = grupos.reduce((a, g) => a + g.cantidad, 0);
  if (total > MAX_DADOS) {
    return { ok: false, error: `Como mucho ${MAX_DADOS} dados por tirada: en la mesa no caben más.` };
  }
  if (Math.abs(mod) > MAX_MOD) return { ok: false, error: `El modificador es demasiado grande (máximo ${MAX_MOD}).` };
  return { ok: true, grupos, mod, texto: escribir(grupos, mod) };
}

// Grupos y modificador → «1d20+5», «2d6-1», «1d8+1d6»
export function escribir(grupos, mod = 0) {
  let t = grupos.map((g, i) => `${g.signo < 0 ? '-' : i ? '+' : ''}${g.cantidad}d${g.lados}`).join('');
  if (mod) t += `${mod < 0 ? '-' : '+'}${Math.abs(mod)}`;
  return t;
}

// Resultado de una tirada: valores[i] son los dados del grupo i, en el
// orden en que se muestran. Devuelve el total y el desglose «12 + 4 − 1».
export function resolver(tirada, valores) {
  let total = tirada.mod;
  const partes = [];
  tirada.grupos.forEach((g, i) => {
    for (const v of valores[i]) {
      total += g.signo * v;
      partes.push({ signo: g.signo, v });
    }
  });
  if (tirada.mod) partes.push({ signo: Math.sign(tirada.mod), v: Math.abs(tirada.mod) });
  const desglose = partes
    .map((p, i) => (i === 0 ? (p.signo < 0 ? `−${p.v}` : `${p.v}`) : `${p.signo < 0 ? '−' : '+'} ${p.v}`))
    .join(' ');
  return { total, desglose };
}

// Ventaja: dos d20 y vale el mayor; desventaja, el menor. Devuelve el
// valor y qué dado (0 o 1) se descarta.
export function ventaja(a, b, modo) {
  const quedaPrimero = modo === 'desventaja' ? a <= b : a >= b;
  return { valor: quedaPrimero ? a : b, descartado: quedaPrimero ? 1 : 0 };
}

// Crear personaje: 4d6 y se descarta el menor (si hay empate, uno solo)
export function sinElMenor(valores) {
  let descartado = 0;
  valores.forEach((v, i) => { if (v < valores[descartado]) descartado = i; });
  const total = valores.reduce((a, v, i) => (i === descartado ? a : a + v), 0);
  return { total, descartado };
}
