// ==========================================================
// DADOS — física de la tirada (lógica pura, sin DOM)
// ==========================================================
// Una simulación pequeña de cubos rígidos: caen con gravedad, chocan con la
// mesa, con una pared al fondo y con los lados, y se empujan entre ellos.
// dados.js la ejecuta ENTERA antes de animar, toma una muestra cada 1/60 s
// y la reproduce con la Web Animations API. Así la tirada se ve como una de
// verdad (el dado vuela, pega en la pared, rebota y rueda hasta pararse) sin
// cargar un motor de física ni un motor 3D: three.js y cannon pesan cientos
// de KB y el peso de página es requisito de producto (AGENTS.md).
//
// El valor NO lo decide la física: sale de crypto.getRandomValues antes de
// tirar. La física decide cómo cae el cubo; después renumerar() gira las
// etiquetas del dado (no su movimiento) para que la cara de arriba sea la
// elegida. Funciona porque un cubo es simétrico: girado 90° sobre sí mismo
// tiene exactamente la misma forma, así que la trayectoria simulada es igual
// de válida con las caras cambiadas de sitio.
//
// Ejes de la mesa: x a la derecha, y hacia quien mira, z hacia arriba.
// Unidades: píxeles y segundos. Probado con node en scripts/dados-check.mjs.

// --- Geometría del dado --------------------------------------------------------
// NORMAL: hacia dónde apunta cada cara con el dado sin girar (Dice.astro).
// Caras opuestas suman 7 y 1-2-3 giran en sentido antihorario en su esquina.
export const NORMAL = { 1: [0, 0, 1], 2: [1, 0, 0], 3: [0, -1, 0], 4: [0, 1, 0], 5: [-1, 0, 0], 6: [0, 0, -1] };

// --- Vectores y cuaterniones: lo justo para girar un cubo ---------------------
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const largo = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };

export const Q = {
  ID: [1, 0, 0, 0],
  eje(x, y, z, a) {
    const l = Math.hypot(x, y, z) || 1;
    const s = Math.sin(a / 2);
    return [Math.cos(a / 2), (x / l) * s, (y / l) * s, (z / l) * s];
  },
  mul([aw, ax, ay, az], [bw, bx, by, bz]) {
    return [
      aw * bw - ax * bx - ay * by - az * bz,
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
    ];
  },
  normalizar(q) {
    const l = Math.hypot(...q) || 1;
    return q.map((v) => v / l);
  },
  slerp(a, b, t) {
    let [bw, bx, by, bz] = b;
    let d = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
    if (d < 0) { d = -d; bw = -bw; bx = -bx; by = -by; bz = -bz; }
    let wa = 1 - t;
    let wb = t;
    if (d < 0.9995) {
      const th = Math.acos(d);
      const s = Math.sin(th);
      wa = Math.sin((1 - t) * th) / s;
      wb = Math.sin(t * th) / s;
    }
    return Q.normalizar([a[0] * wa + bw * wb, a[1] * wa + bx * wb, a[2] * wa + by * wb, a[3] * wa + bz * wb]);
  },
  // Misma matriz que rotate3d() de CSS, por filas
  mat([w, x, y, z]) {
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  },
};

export const rot = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];

// Cara que mira hacia arriba con la orientación q
export function caraArriba(q) {
  const R = Q.mat(q);
  let cara = 1;
  let max = -2;
  for (const [c, n] of Object.entries(NORMAL)) {
    const z = rot(R, n)[2];
    if (z > max) { max = z; cara = Number(c); }
  }
  return { cara, z: max };
}

// Gira q lo mínimo para que la cara de arriba quede exactamente plana
export function aplanar(q) {
  const { cara } = caraArriba(q);
  const n = rot(Q.mat(q), NORMAL[cara]);
  const eje = cross(n, [0, 0, 1]);
  const s = largo(eje);
  if (s < 1e-9) return q;
  const angulo = Math.atan2(s, n[2]);
  return Q.normalizar(Q.mul(Q.eje(eje[0], eje[1], eje[2], angulo), q));
}

// Giro del propio dado (una de las 24 simetrías del cubo) que hace que, con
// la orientación final qFinal, la cara de arriba sea `valor`. La animación
// usa q · P en cada muestra: el movimiento es el mismo, cambian las caras.
export function renumerar(qFinal, valor, aleatorio = Math.random) {
  const sale = caraArriba(qFinal).cara;
  const nV = NORMAL[valor];
  const nF = NORMAL[sale];
  // Primero un giro de k·90° sobre la cara elegida (variedad en los lados)
  const k = Math.floor(aleatorio() * 4);
  const vuelta = Q.eje(nV[0], nV[1], nV[2], (k * Math.PI) / 2);
  // Después el giro mínimo que lleva la cara elegida a la que salió
  let A = Q.ID;
  const d = dot(nV, nF);
  if (d < -0.5) {
    const eje = Math.abs(nV[2]) > 0.5 ? [1, 0, 0] : [0, 0, 1];
    A = Q.eje(eje[0], eje[1], eje[2], Math.PI);
  } else if (d < 0.5) {
    const eje = cross(nV, nF);
    A = Q.eje(eje[0], eje[1], eje[2], Math.PI / 2);
  }
  return Q.mul(A, vuelta);
}

// --- La simulación -------------------------------------------------------------
const PASO = 1 / 240;          // s: paso fijo, pequeño para que los botes no atraviesen
const POR_MUESTRA = 4;         // una muestra cada 4 pasos = 60 por segundo
export const MUESTRAS_POR_S = 1 / (PASO * POR_MUESTRA);
const MAX_S = 4;               // si algo no se ha parado en 4 s, se aplana igual
const ESQUINAS = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c])));

// cuerpos: [{ x: [x, y, z], v: [vx, vy, vz], q, w: [wx, wy, wz] }]  (en el centro)
// caja: { izquierda, derecha, fondo, frente } (coordenadas de las paredes)
// s: lado del dado. Devuelve, por dado, la lista de muestras { x, q }.
export function simular(cuerpos, caja, s) {
  const h = s / 2;
  const g = s * 46;                  // gravedad en lados por s²: se ve rápido pero legible
  const invI = 6 / (s * s);          // cubo macizo de masa 1: I = s²/6 (igual en todos los ejes)
  const radio = s * 0.74;            // los dados no se acercan más que esto entre sí
  const rebote = 0.42;
  const rozamiento = 0.42;
  const sinRebote = s * 1.6;         // por debajo de esta velocidad un golpe ya no bota

  const estado = cuerpos.map((c) => ({
    x: [...c.x], v: [...c.v], q: [...c.q], w: [...c.w], sale: c.sale ?? 0,
    quieto: 0, dormido: false, suelo: false,
    // La pared derecha solo cuenta cuando el dado ya entró: se lanza desde
    // fuera de la mesa, desde la mano
    dentroDer: false,
  }));
  const muestras = estado.map(() => []);

  function choque(b, r, n, e) {
    const vr = add(b.v, cross(b.w, r));
    const vn = dot(vr, n);
    if (vn >= 0) return 0;
    const rn = cross(r, n);
    const j = (-(1 + (vn < -sinRebote ? e : 0)) * vn) / (1 + invI * dot(rn, rn));
    b.v = add(b.v, mul(n, j));
    b.w = add(b.w, mul(rn, j * invI));
    // Rozamiento: frena el deslizamiento en el punto de contacto (Coulomb)
    const vr2 = add(b.v, cross(b.w, r));
    const vt = sub(vr2, mul(n, dot(vr2, n)));
    const lt = largo(vt);
    if (lt > 1e-6) {
      const t = mul(vt, 1 / lt);
      const rt = cross(r, t);
      const jt = Math.min(lt / (1 + invI * dot(rt, rt)), rozamiento * j);
      b.v = sub(b.v, mul(t, jt));
      b.w = sub(b.w, mul(rt, jt * invI));
    }
    return j;
  }

  function planos(b) {
    const lista = [
      { n: [0, 0, 1], d: 0, e: rebote },               // mesa
      { n: [0, 1, 0], d: caja.fondo, e: 0.5 },         // pared del fondo
      { n: [1, 0, 0], d: caja.izquierda, e: 0.5 },     // lado izquierdo
    ];
    lista.push({ n: [0, -1, 0], d: -caja.frente, e: 0.4 });  // delante: nunca sale hacia quien mira
    if (b.dentroDer) lista.push({ n: [-1, 0, 0], d: -caja.derecha, e: 0.5 });
    return lista;
  }

  let paso = 0;
  for (let t = 0; t < MAX_S; t += PASO, paso++) {
    for (const b of estado) {
      if (b.dormido || t < b.sale) continue;
      b.v[2] -= g * PASO;
      b.x = add(b.x, mul(b.v, PASO));
      const [wx, wy, wz] = b.w;
      const dq = Q.mul([0, wx, wy, wz], b.q);
      b.q = Q.normalizar(b.q.map((c, i) => c + 0.5 * PASO * dq[i]));
      if (b.x[0] < caja.derecha - h) b.dentroDer = true;
      // Red de seguridad: si otro dado lo frenó antes de entrar en la mesa,
      // sigue rodando hacia dentro en vez de quedarse fuera de la pantalla
      else if (t > b.sale + 0.4 && b.v[0] > -s * 3) b.v[0] = -s * 3;

      const R = Q.mat(b.q);
      const esquinas = ESQUINAS.map((c) => rot(R, mul(c, h)));
      b.suelo = false;
      for (const pl of planos(b)) {
        let hondo = 0;
        for (const r of esquinas) {
          const dentro = dot(add(b.x, r), pl.n) - pl.d;
          if (dentro < 0) {
            hondo = Math.max(hondo, -dentro);
            choque(b, r, pl.n, pl.e);
          }
        }
        if (hondo > 0) {
          b.x = add(b.x, mul(pl.n, hondo * 0.8));
          if (pl.n[2] === 1) b.suelo = true;
        }
      }
      // Rodando sobre la mesa pierde giro poco a poco, como un dado de verdad
      b.w = mul(b.w, b.suelo ? 0.985 : 0.999);
      b.v = mul(b.v, b.suelo ? 0.996 : 0.9995);
    }

    // Entre dados: esferas que no se atraviesan. No es un choque de cubos
    // exacto, pero evita que dos dados se metan uno dentro de otro.
    for (let i = 0; i < estado.length; i++) {
      for (let j = i + 1; j < estado.length; j++) {
        const a = estado[i];
        const b = estado[j];
        if (t < a.sale || t < b.sale) continue;
        const d = sub(b.x, a.x);
        const dist = largo(d);
        if (dist >= radio * 2 || dist < 1e-6) continue;
        const n = mul(d, 1 / dist);
        const meter = (radio * 2 - dist) / 2;
        a.x = sub(a.x, mul(n, meter));
        b.x = add(b.x, mul(n, meter));
        // Un dado quieto al que empujan vuelve a moverse
        if (meter > 0.05) {
          for (const c of [a, b]) if (c.dormido) { c.dormido = false; c.quieto = 0; }
        }
        const vn = dot(sub(b.v, a.v), n);
        if (vn < 0) {
          const imp = (-(1 + 0.3) * vn) / 2;
          a.v = sub(a.v, mul(n, imp));
          b.v = add(b.v, mul(n, imp));
          if (imp > s * 0.5) { a.dormido = false; b.dormido = false; a.quieto = 0; b.quieto = 0; }
        }
      }
    }

    // El empujón entre dados no puede sacar a ninguno de la mesa
    for (const b of estado) {
      if (t < b.sale) continue;
      b.x[0] = Math.max(b.x[0], caja.izquierda + h);
      b.x[1] = Math.max(b.x[1], caja.fondo + h);
      if (b.dentroDer) b.x[0] = Math.min(b.x[0], caja.derecha - h);
      b.x[1] = Math.min(b.x[1], caja.frente - h);
    }

    // Quieto: apoyado y casi sin moverse durante un cuarto de segundo
    for (const b of estado) {
      if (b.dormido || t < b.sale) continue;
      const lento = b.suelo && largo(b.v) < s * 0.25 && largo(b.w) < 0.8;
      b.quieto = lento ? b.quieto + PASO : 0;
      if (b.quieto > 0.25) { b.dormido = true; b.v = [0, 0, 0]; b.w = [0, 0, 0]; }
    }

    // Se graban todos hasta que todos estén quietos: uno que se paró antes
    // aún puede recibir un golpe de otro
    if (paso % POR_MUESTRA === 0) {
      estado.forEach((b, i) => muestras[i].push({ x: [...b.x], q: [...b.q] }));
      if (estado.every((b) => b.dormido)) break;
    }
  }

  // Asentar: unas pocas muestras más en las que el dado queda plano sobre una
  // cara y apoyado en la mesa (la física lo deja casi plano; esto lo remata)
  return muestras.map((lista) => {
    const ultima = lista[lista.length - 1];
    const plana = aplanar(ultima.q);
    for (let k = 1; k <= 6; k++) {
      const e = k / 6;
      lista.push({
        x: [ultima.x[0], ultima.x[1], ultima.x[2] + (h - ultima.x[2]) * e],
        q: Q.slerp(ultima.q, plana, e),
      });
    }
    return lista;
  });
}

// --- La mano: de dónde y cómo salen los dados -----------------------------------
// Como en la página de referencia que eligió el propietario: desde la
// derecha y por delante (fuera de la pantalla, desde la mano), lanzados en
// diagonal hacia el fondo y la izquierda, en alto y girando. Entran ya a la
// altura de la mesa, así que solo cruzan la pared derecha, que se activa al
// pasarla; la de delante está siempre y ninguno sale hacia quien mira.
export function desdeLaMano(n, caja, s, aleatorio = Math.random) {
  const entre = (a, b) => a + aleatorio() * (b - a);
  const giro = () => entre(-16, 16);
  const meta = [entre(caja.izquierda * 0.6, caja.derecha * 0.1), caja.fondo + s * entre(0.4, 1.2)];
  return Array.from({ length: n }, (_, i) => {
    // En la mano van de dos en dos: cada pareja sale un poco después que la
    // anterior, desde el mismo sitio, como una mano que los va soltando
    const fila = i % 2;
    const col = Math.floor(i / 2);
    const x = [
      caja.derecha + s * 1.3 + s * entre(-0.1, 0.1),
      caja.frente - s * (0.75 + fila * 1.55) + s * entre(-0.1, 0.1),
      s * entre(1, 1.3),
    ];
    const dir = norm([meta[0] - x[0], meta[1] - x[1] + s * entre(-0.4, 0.4), 0]);
    const rapidez = s * entre(13, 17);
    return {
      x,
      v: [dir[0] * rapidez, dir[1] * rapidez, s * entre(0, 1.2)],
      q: Q.normalizar([entre(-1, 1), entre(-1, 1), entre(-1, 1), entre(-1, 1)]),
      w: [giro(), giro(), giro()],
      sale: col * 0.11 + entre(0, 0.03),
    };
  });
}
