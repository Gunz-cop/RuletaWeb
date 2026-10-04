// ==========================================================
// DADOS DE ROL — geometría de los poliedros (lógica pura, sin DOM)
// ==========================================================
// D4, D8, D10, D12 y D20 como sólidos de verdad: vértices, caras, qué número
// lleva cada cara y las simetrías de giro de cada sólido. dados-fisica.js
// los simula con la misma física que el cubo (choca con sus vértices) y
// Dice.astro dibuja cada cara como un polígono en CSS 3D con clip-path.
//
// El truco del cubo se generaliza: el valor sale de crypto.getRandomValues
// antes de tirar, la física decide cómo cae el sólido, y renumerarForma()
// busca una simetría del sólido (un giro que lo deja con la misma forma)
// que lleva el número elegido a la cara que quedó arriba. Todos estos
// sólidos tienen simetrías que llevan cualquier cara a cualquier otra, así
// que siempre existe.
//
// Lectura: en D8, D10, D12 y D20 vale la cara de arriba (sus caras opuestas
// son paralelas, así que apoyado en una cara siempre hay otra plana arriba).
// En el D4 no hay cara arriba: vale el vértice de arriba, y cada cara lleva
// tres números, uno junto a cada esquina, que es como se leen los D4.
//
// Unidades: los vértices van en medios lados del dado (h = s / 2), igual
// que las esquinas del cubo en dados-fisica.js. Probado en
// scripts/dados-check.mjs.

import { Q, NORMAL, rot, dot, norm } from './dados-fisica.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const largo = (a) => Math.hypot(a[0], a[1], a[2]);

// --- Los sólidos ---------------------------------------------------------------
// tamano: radio de la esfera que pasa por los vértices, en medios lados. Se
// eligió a ojo para que, a igual --s, cada dado ocupe más o menos lo que el
// cubo (cuyas esquinas están a √3 ≈ 1,73).
// Altura de los vértices del anillo del D10: con ella cada cara (una
// cometa) es plana. Sale de pedir que la punta, dos vértices de arriba y
// el de abajo entre ellos estén en el mismo plano.
const C36 = Math.cos(Math.PI / 5);
const D10_ANILLO = (1 - C36) / (1 + C36);

const SOLIDOS = {
  4: {
    tamano: 1.75,
    vertices: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  },
  6: {
    tamano: Math.sqrt(3),
    vertices: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c]))),
  },
  8: {
    tamano: 1.5,
    vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  },
  10: {
    tamano: 1.32,
    vertices: [
      [0, 0, 1], [0, 0, -1],
      ...Array.from({ length: 10 }, (_, k) => {
        const a = (k * Math.PI) / 5;
        return [Math.cos(a), Math.sin(a), k % 2 ? -D10_ANILLO : D10_ANILLO];
      }),
    ],
  },
  12: {
    tamano: 1.32,
    vertices: [
      ...[-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c]))),
      ...[-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [
        [0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI],
      ])),
    ],
  },
  20: {
    tamano: 1.34,
    vertices: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [
      [0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b],
    ])),
  },
};

export const LADOS = [4, 6, 8, 10, 12, 20];

// --- Envolvente convexa (pocos vértices: fuerza bruta) -------------------------
// Cada terna de vértices define un plano; es una cara si todos los demás
// vértices quedan detrás. Las ternas del mismo plano se juntan en un
// polígono (pentágonos del D12, cometas del D10) ordenado alrededor de su
// centro, en sentido antihorario visto desde fuera.
function envolvente(V) {
  const planos = [];
  for (let i = 0; i < V.length; i++) {
    for (let j = i + 1; j < V.length; j++) {
      for (let k = j + 1; k < V.length; k++) {
        let n = cross(sub(V[j], V[i]), sub(V[k], V[i]));
        if (largo(n) < EPS) continue;
        n = norm(n);
        let d = dot(n, V[i]);
        if (d < 0) { n = mul(n, -1); d = -d; }
        if (V.some((p) => dot(n, p) > d + 1e-7)) continue;
        if (planos.some((p) => largo(sub(p.n, n)) < 1e-6)) continue;
        planos.push({ n, d });
      }
    }
  }
  return planos.map(({ n, d }) => {
    const idx = V.map((p, i) => i).filter((i) => Math.abs(dot(n, V[i]) - d) < 1e-7);
    const c = mul(idx.reduce((a, i) => add(a, V[i]), [0, 0, 0]), 1 / idx.length);
    const e1 = norm(sub(V[idx[0]], c));
    const e2 = cross(n, e1);
    idx.sort((a, b) => {
      const pa = sub(V[a], c);
      const pb = sub(V[b], c);
      return Math.atan2(dot(pa, e2), dot(pa, e1)) - Math.atan2(dot(pb, e2), dot(pb, e1));
    });
    return { idx, n, d, centro: c };
  });
}

// --- Simetrías de giro -----------------------------------------------------------
// Todos los giros que dejan el conjunto de vértices igual (12 en el D4, 24 en
// el D6 y el D8, 10 en el D10, 60 en el D12 y el D20). Se buscan llevando dos
// vértices fijos a cualquier par con las mismas longitudes y el mismo ángulo,
// y quedándose con los giros que llevan cada vértice a otro vértice.
function simetrias(V) {
  const a = V[0];
  const b = V.find((p) => largo(cross(a, p)) > 1e-3);
  const marco = (x, y) => {
    const z = cross(x, y);
    return [x, y, z];
  };
  const F = marco(a, b);
  // Inversa de la matriz con columnas F: se resuelve con la adjunta
  const inv = (cols) => {
    const [c0, c1, c2] = cols;
    const det = dot(c0, cross(c1, c2));
    return [cross(c1, c2), cross(c2, c0), cross(c0, c1)].map((r) => mul(r, 1 / det));
  };
  const Fi = inv(F);
  const giros = [];
  for (const p of V) {
    if (Math.abs(largo(p) - largo(a)) > 1e-6) continue;
    for (const r of V) {
      if (Math.abs(largo(r) - largo(b)) > 1e-6 || Math.abs(dot(p, r) - dot(a, b)) > 1e-6) continue;
      const G = marco(p, r);
      // M = G · F⁻¹ (por filas)
      const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => G[0][i] * Fi[0][j] + G[1][i] * Fi[1][j] + G[2][i] * Fi[2][j]));
      if (Math.abs(dot(M[0], cross(M[1], M[2])) - 1) > 1e-6) continue;
      const imagen = V.map((v) => rot(M, v));
      if (!imagen.every((v) => V.some((w) => largo(sub(v, w)) < 1e-6))) continue;
      giros.push(cuaternion(M));
    }
  }
  return giros;
}

// Matriz de giro (por filas, como Q.mat) a cuaternión
function cuaternion(M) {
  const t = M[0][0] + M[1][1] + M[2][2];
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [s / 4, (M[2][1] - M[1][2]) / s, (M[0][2] - M[2][0]) / s, (M[1][0] - M[0][1]) / s];
  } else if (M[0][0] > M[1][1] && M[0][0] > M[2][2]) {
    const s = Math.sqrt(1 + M[0][0] - M[1][1] - M[2][2]) * 2;
    q = [(M[2][1] - M[1][2]) / s, s / 4, (M[0][1] + M[1][0]) / s, (M[0][2] + M[2][0]) / s];
  } else if (M[1][1] > M[2][2]) {
    const s = Math.sqrt(1 + M[1][1] - M[0][0] - M[2][2]) * 2;
    q = [(M[0][2] - M[2][0]) / s, (M[0][1] + M[1][0]) / s, s / 4, (M[1][2] + M[2][1]) / s];
  } else {
    const s = Math.sqrt(1 + M[2][2] - M[0][0] - M[1][1]) * 2;
    q = [(M[1][0] - M[0][1]) / s, (M[0][2] + M[2][0]) / s, (M[1][2] + M[2][1]) / s, s / 4];
  }
  return Q.normalizar(q);
}

// --- Números ------------------------------------------------------------------------
// Como en los dados de verdad, las caras opuestas suman N + 1 (en el D20, 1
// frente a 20, 2 frente a 19…). El D6 usa la misma numeración que Dice.astro.
// Los pares se reparten alternando arriba y abajo para que los números
// altos no queden todos juntos.
function numerar(lados, caras) {
  if (lados === 6) {
    return caras.map((c) => Number(Object.entries(NORMAL).find(([, n]) => largo(sub(n, c.n)) < 1e-6)[0]));
  }
  const valores = new Array(caras.length).fill(0);
  // Caras de la mitad de arriba (o, en el ecuador, la mitad que gira primero),
  // ordenadas por altura y ángulo; cada una con su opuesta
  const clave = (c) => [Math.round(-c.n[2] * 1e4), Math.atan2(c.n[1], c.n[0])];
  const arriba = caras
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.n[2] > 1e-6 || (Math.abs(c.n[2]) < 1e-6 && Math.atan2(c.n[1], c.n[0]) >= -1e-6 && Math.atan2(c.n[1], c.n[0]) < Math.PI - 1e-6))
    .sort((a, b) => { const ka = clave(a.c); const kb = clave(b.c); return ka[0] - kb[0] || ka[1] - kb[1]; });
  arriba.forEach(({ c, i }, k) => {
    const v = k % 2 === 0 ? k + 1 : lados - k;
    const opuesta = caras.findIndex((o) => largo(add(o.n, c.n)) < 1e-6);
    valores[i] = v;
    valores[opuesta] = lados + 1 - v;
  });
  return valores;
}

function haciaLaPunta(P, C) {
  const lejos = P.reduce((m, p) => (largo(sub(p, C)) > largo(sub(m, C)) + 1e-6 ? p : m), P[0]);
  return norm(sub(lejos, C));
}

// --- La forma que usan la física y el dibujo -------------------------------------
const cache = {};

export function forma(lados) {
  if (cache[lados]) return cache[lados];
  const base = SOLIDOS[lados];
  if (!base) throw new Error(`No hay dado de ${lados} caras`);
  const r = Math.max(...base.vertices.map(largo));
  const V = base.vertices.map((v) => mul(v, base.tamano / r));
  const caras = envolvente(V);

  // Dirección que tiene que apuntar hacia arriba para que salga cada valor:
  // la normal de su cara o, en el D4, su vértice
  const dir = {};
  let etiquetas;
  if (lados === 4) {
    V.forEach((v, i) => { dir[i + 1] = norm(v); });
    etiquetas = caras.map((c) => c.idx.map((i) => i + 1));
  } else {
    const valores = numerar(lados, caras);
    caras.forEach((c, i) => { dir[valores[i]] = c.n; });
    etiquetas = valores.map((v) => [v]);
  }

  // Hacia dónde mira la cabeza del número de cada valor (no en el D4): hacia
  // el vértice más lejano de su cara (la punta en la cometa del D10; en
  // caras regulares, el primero). Lo usan dibujo() y renumerarForma().
  const cabeza = {};
  caras.forEach((c) => { c.arriba = haciaLaPunta(c.idx.map((i) => V[i]), c.centro); });
  if (lados !== 4) caras.forEach((c, i) => { cabeza[etiquetas[i][0]] = c.arriba; });

  const giros = simetrias(V);
  const f = {
    lados,
    vertices: V,
    caras,
    etiquetas,
    dir,
    cabeza,
    simetrias: giros,
    // Altura del centro con el dado apoyado en una cara (en medios lados)
    apoyo: Math.min(...caras.map((c) => c.d)),
    // Radio de choque entre dados: entre la esfera inscrita y la circunscrita
    radio: 0.74 * (Math.min(...caras.map((c) => c.d)) + base.tamano) / (1 + Math.sqrt(3)),
    aplanar: (q) => aplanarForma(f, q),
    // Apoyado en una cara (y no de canto): lo usa la física para desatascar
    plana: (q) => valorArriba(f, q).z > 0.99,
    // Eje (y fuerza, el seno del ángulo) hacia el que vuelca para quedar
    // sobre la cara más cercana
    vuelco: (q) => cross(rot(Q.mat(q), f.dir[valorArriba(f, q).valor]), [0, 0, 1]),
  };
  cache[lados] = f;
  return f;
}

// Valor que se lee con la orientación q: el de la dirección más alta
export function valorArriba(f, q) {
  const R = Q.mat(q);
  let valor = 1;
  let max = -2;
  for (const [v, n] of Object.entries(f.dir)) {
    const z = rot(R, n)[2];
    if (z > max) { max = z; valor = Number(v); }
  }
  return { valor, z: max };
}

// Gira q lo mínimo para que la dirección del valor que sale apunte
// exactamente hacia arriba: el dado queda apoyado en una cara
export function aplanarForma(f, q) {
  const { valor } = valorArriba(f, q);
  const n = rot(Q.mat(q), f.dir[valor]);
  const eje = cross(n, [0, 0, 1]);
  const s = largo(eje);
  if (s < 1e-9) return q;
  return Q.normalizar(Q.mul(Q.eje(eje[0], eje[1], eje[2], Math.atan2(s, n[2])), q));
}

// Simetría P del sólido que lleva `valor` a donde quedó el que salió: la
// animación usa q · P en cada muestra, igual que renumerar() con el cubo.
// Casi siempre hay varias (tantas como lados tiene la cara): se elige la
// que deja el número de arriba derecho para quien mira, con la cabeza hacia
// el fondo de la mesa. Un número boca abajo se lee mal. En el D4 los tres
// números de la punta ya miran hacia arriba, así que da igual cuál.
export function renumerarForma(f, qFinal, valor, aleatorio = Math.random) {
  const sale = valorArriba(f, qFinal).valor;
  const destino = f.dir[sale];
  const validas = f.simetrias.filter((P) => largo(sub(rot(Q.mat(P), f.dir[valor]), destino)) < 1e-6);
  if (f.lados === 4) return validas[Math.floor(aleatorio() * validas.length)];
  const R = Q.mat(qFinal);
  const fondo = (P) => -rot(R, rot(Q.mat(P), f.cabeza[valor]))[1];
  return validas.reduce((m, P) => (fondo(P) > fondo(m) ? P : m));
}

// Altura del centro para que el vértice más bajo toque la mesa (en medios
// lados): para colocar un dado sin tirada
export function alturaApoyo(f, q) {
  const R = Q.mat(q);
  return -Math.min(...f.vertices.map((v) => rot(R, v)[2]));
}

// --- Dibujo: cada cara como un polígono en CSS 3D ----------------------------------
// Para un dado de lado `ref` px. Devuelve por cara la matrix3d que lleva el
// elemento (origen arriba a la izquierda) a su sitio en el sólido, su
// tamaño, su recorte (clip-path) y dónde va cada número. Lo usa Dice.astro
// al construir la página: el marcado sale hecho, el JS no dibuja.
//
// `holgura`: la cara se dibuja un poco más grande que el polígono exacto,
// como el medio píxel de más de las caras del cubo, para que no asome el
// fondo por las aristas.
export function dibujo(lados, ref = 100, holgura = 0.6) {
  const f = forma(lados);
  const h = ref / 2;
  const subrayar = lados >= 9;
  return f.caras.map((c, ci) => {
    const P = c.idx.map((i) => mul(f.vertices[i], h));
    const C = mul(c.centro, h);
    const vAbajo = mul(c.arriba, -1);
    const u = cross(vAbajo, c.n);
    const local = (p) => [dot(sub(p, C), u), dot(sub(p, C), vAbajo)];
    const pts = P.map(local).map(([x, y]) => {
      const l = Math.hypot(x, y);
      return [x + (x / l) * holgura, y + (y / l) * holgura];
    });
    const minX = Math.min(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1]));
    const w = Math.max(...pts.map((p) => p[0])) - minX;
    const alto = Math.max(...pts.map((p) => p[1])) - minY;
    const O = add(C, add(mul(u, minX), mul(vAbajo, minY)));
    const r3 = (x) => +x.toFixed(4);
    const matriz = `matrix3d(${[...u, 0, ...vAbajo, 0, ...c.n, 0, ...O, 1].map(r3).join(',')})`;
    const recorte = pts.map(([x, y]) => `${r3(x - minX)}px ${r3(y - minY)}px`).join(',');
    // Radio de la circunferencia inscrita en la cara: da el tamaño del número
    const inscrito = Math.min(...pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const e = [q[0] - p[0], q[1] - p[1]];
      return Math.abs(e[0] * p[1] - e[1] * p[0]) / Math.hypot(...e);
    }));
    let numeros;
    if (lados === 4) {
      // Uno junto a cada esquina, con la cabeza hacia ella
      numeros = c.idx.map((vi, k) => {
        const [x, y] = local(P[k]);
        return {
          valor: vi + 1,
          x: r3(x * 0.56 - minX), y: r3(y * 0.56 - minY),
          giro: r3((Math.atan2(x, -y) * 180) / Math.PI),
          tam: r3(inscrito * 0.62),
        };
      });
    } else {
      // El número, en el centro de la cara; en la cometa del D10, un poco
      // hacia la punta, donde hay más sitio
      const valor = f.etiquetas[ci][0];
      const desplazar = lados === 10 ? -inscrito * 0.25 : 0;
      numeros = [{
        valor,
        x: r3(-minX), y: r3(desplazar - minY),
        giro: 0,
        tam: r3(inscrito * (lados === 8 ? 1.15 : lados === 10 ? 1.25 : 1.1)),
        subrayado: subrayar && (valor === 6 || valor === 9),
      }];
    }
    // Centro de la cara en el elemento: el relleno se encoge hacia él
    return { n: c.n, matriz, w: r3(w), h: r3(alto), recorte, centro: [r3(-minX), r3(-minY)], numeros };
  });
}
