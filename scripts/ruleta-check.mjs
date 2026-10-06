#!/usr/bin/env node
/**
 * Comprueba la lógica pura de la ruleta rediseñada (src/scripts/ruleta-logica.js,
 * SDD de la ruleta §6.3, §6.9, §6.10, §6.13 y §9): uniformidad del sorteo,
 * independencia entre final y ganador, pose final dentro del gajo con su
 * margen, curva del giro, reposo, tonos, migración de lo guardado, enlace
 * para compartir y emparejamiento de ocultas.
 * Las pruebas estadísticas usan un generador con semilla para que el
 * resultado no cambie de una ejecución a otra: con crypto, un α de 0,001
 * haría fallar el CI de vez en cuando sin que nada se hubiera roto.
 */
import {
  leerOpciones, indiceAlAzar, geometria, tonoDe, curva, elegirFinal, intervaloFinal,
  planGiro, gajoBajoPuntero, margenReposo, amplitudReposo, margenMin, reasignarOcultas,
  migrarGuardado, enlace, leerEnlace, CLAVES, OPCIONES_POR_DEFECTO, HISTORIAL_MAX,
} from '../src/scripts/ruleta-logica.js';

const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push(msg); };
const resumen = [];

// mulberry32: un congruencial lineal tiene el bit bajo alternando, y con N = 2
// el reparto saldría exacto sin probar nada.
let semilla = 20261006;
const u32Semilla = () => {
  semilla = (semilla + 0x6d2b79f5) >>> 0;
  let t = semilla;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
};
const unidad = () => u32Semilla() / 4294967296;

// Valores críticos de χ² a α = 0,001 por grados de libertad.
const CRITICO = { 1: 10.828, 2: 13.816, 5: 20.515, 6: 22.458, 12: 32.909, 15: 37.697, 36: 67.985, 49: 85.351 };
const chi2 = (obs, esp) => obs.reduce((s, o, i) => s + (o - esp[i]) ** 2 / esp[i], 0);
const grados = (transform) => parseFloat(transform.slice('rotate('.length));
const FINALES = ['normal', 'casi', 'pelos', 'atras'];

/* --- RNF-01: uniformidad del sorteo --- */
{
  const SORTEOS = 60000;
  for (const n of [2, 3, 6, 7, 13, 50]) {
    const cuentas = new Array(n).fill(0);
    for (let i = 0; i < SORTEOS; i++) cuentas[indiceAlAzar(n, u32Semilla)]++;
    const x = chi2(cuentas, cuentas.map(() => SORTEOS / n));
    check(x < CRITICO[n - 1], `uniformidad N=${n}: χ² = ${x.toFixed(2)} rechaza (crítico ${CRITICO[n - 1]})`);
    resumen.push(`uniformidad N=${n}: χ²=${x.toFixed(2)} (<${CRITICO[n - 1]})`);
  }
  // Muestreo por rechazo: con n = 3, 2**32 no se reparte exacto y el último
  // valor (2**32 - 1) sesgaría el módulo; tiene que descartarse y leer otro.
  const valores = [4294967295, 4294967295, 1];
  let i = 0;
  const x = indiceAlAzar(3, () => valores[i++]);
  check(x === 1 && i === 3, `indiceAlAzar no rechaza la cola (devolvió ${x} tras ${i} lecturas)`);
  // Sin rnd usa crypto: en rango.
  for (let k = 0; k < 1000; k++) {
    const r = indiceAlAzar(7);
    if (!(Number.isInteger(r) && r >= 0 && r < 7)) { check(false, `indiceAlAzar con crypto fuera de rango: ${r}`); break; }
  }
}

/* --- §6.13: finales independientes del ganador, 74/11/11/4, sin especiales seguidos --- */
{
  const GIROS = 60000;
  const ESPERADA = { normal: 1 / 1.35, casi: 0.15 / 1.35, pelos: 0.15 / 1.35, atras: 0.05 / 1.35 };
  for (const n of [6, 13]) {
    const tabla = FINALES.map(() => new Array(n).fill(0));
    const historial = [];
    let seguidos = 0;
    for (let i = 0; i < GIROS; i++) {
      const ganador = indiceAlAzar(n, u32Semilla);
      const final = elegirFinal(historial, n, u32Semilla);
      const previo = historial[historial.length - 1];
      if (final !== 'normal' && previo && previo !== 'normal') seguidos++;
      historial.push(final);
      tabla[FINALES.indexOf(final)][ganador]++;
    }
    const filas = tabla.map((f) => f.reduce((a, b) => a + b, 0));
    const columnas = tabla[0].map((_, j) => tabla.reduce((s, f) => s + f[j], 0));
    let x = 0;
    tabla.forEach((f, i) => f.forEach((o, j) => {
      const e = (filas[i] * columnas[j]) / GIROS;
      x += (o - e) ** 2 / e;
    }));
    const gl = (FINALES.length - 1) * (n - 1);
    check(x < CRITICO[gl], `independencia final–ganador N=${n}: χ² = ${x.toFixed(2)} rechaza (crítico ${CRITICO[gl]}, ${gl} gl)`);
    check(seguidos === 0, `N=${n}: ${seguidos} finales especiales seguidos`);
    const pct = FINALES.map((f, i) => (100 * filas[i]) / GIROS);
    FINALES.forEach((f, i) => {
      check(Math.abs(pct[i] - 100 * ESPERADA[f]) < 1, `N=${n}: frecuencia de «${f}» ${pct[i].toFixed(2)} % (esperado ≈ ${(100 * ESPERADA[f]).toFixed(1)} %)`);
    });
    resumen.push(`finales N=${n}: χ² indep.=${x.toFixed(2)} (<${CRITICO[gl]}), ${pct.map((p) => p.toFixed(1)).join('/')} %, ${seguidos} especiales seguidos`);
  }
  // Solo «normal» con N < 2 o N > 30, aunque el sorteo diga otra cosa.
  for (const n of [1, 31, 40, 100]) {
    const historial = [];
    let otros = 0;
    for (let i = 0; i < 2000; i++) { const f = elegirFinal(historial, n, u32Semilla); historial.push(f); if (f !== 'normal') otros++; }
    check(otros === 0, `N=${n}: ${otros} finales distintos de «normal»`);
  }
}

/* --- Intervalos recortados al margen (los ejemplos de §6.13) --- */
{
  const cerca = (a, b) => Math.abs(a - b) < 1e-9;
  const [pl, ph] = intervaloFinal('pelos', 30);
  const [cl, ch] = intervaloFinal('casi', 30);
  check(cerca(pl, 0.125) && cerca(ph, 0.15), `N=30 «Por los pelos» = [${pl}, ${ph}], esperado [0,125; 0,15]`);
  check(cerca(cl, 0.85) && cerca(ch, 0.875), `N=30 «Casi se pasa» = [${cl}, ${ch}], esperado [0,85; 0,875]`);
  const [nl, nh] = intervaloFinal('normal', 6);
  check(cerca(nl, 0.12) && cerca(nh, 0.88), `N=6 «Normal» = [${nl}, ${nh}], esperado [0,12; 0,88]`);
}

/* --- RNF-03: pose final en el gajo ganador con margen, y reposo dentro del gajo --- */
// Fotogramas válidos para element.animate(): offsets en [0, 1] y no decrecientes
// (si no, el navegador lanza y no hay giro).
function offsetsValidos(frames) {
  let previo = 0;
  for (const f of frames) {
    if (!(f.offset >= previo && f.offset <= 1)) return false;
    previo = f.offset;
  }
  return frames[0].offset === 0 && frames[frames.length - 1].offset === 1;
}

const RADIOS = [100, 160, 230, 350, 600]; // px: de un móvil a pantalla completa
{
  const PLANES = 2000;
  let planes = 0, peorMargen = Infinity, peorPx = 0;
  for (const n of [1, 2, 6, 13, 30, 31, 40, 100]) {
    for (const final of FINALES) {
      for (let i = 0; i < PLANES; i++) {
        planes++;
        const ganador = indiceAlAzar(n, u32Semilla);
        const anguloActual = (unidad() - 0.5) * 7200;
        const plan = planGiro({ anguloActual, ganador, n, final, rnd: u32Semilla });
        const efectivo = n < 2 || n > 30 ? 'normal' : final;
        check(plan.final === efectivo, `N=${n} ${final}: el plan dice «${plan.final}», esperado «${efectivo}»`);
        check(plan.anguloFinal >= 0 && plan.anguloFinal < 360, `N=${n} ${final}: anguloFinal sin normalizar (${plan.anguloFinal})`);
        check(gajoBajoPuntero(plan.anguloFinal, n) === ganador, `N=${n} ${final}: para en ${gajoBajoPuntero(plan.anguloFinal, n)}, ganador ${ganador}`);
        const margen = n === 1 ? Math.min(plan.fT, 1 - plan.fT) * 360 : margenReposo(plan.anguloFinal, n);
        peorMargen = Math.min(peorMargen, margen / margenMin(n));
        check(margen >= margenMin(n) - 1e-9, `N=${n} ${final}: margen ${margen.toFixed(3)}° < ${margenMin(n).toFixed(3)}°`);
        // El aterrizaje termina en la pose final.
        const ultimo = grados(plan.aterriza.rotor[plan.aterriza.rotor.length - 1].transform);
        check(Math.abs((((ultimo - plan.anguloFinal) % 360) + 360) % 360) < 1e-6 || Math.abs((((ultimo - plan.anguloFinal) % 360) + 360) % 360 - 360) < 1e-6,
          `N=${n} ${final}: el aterrizaje acaba en ${ultimo}, no en la pose ${plan.anguloFinal}`);
        // Reposo: el balanceo no saca al puntero del gajo y no pasa de 6 px en el borde.
        if (n > 1) {
          for (const radio of RADIOS) {
            const amp = amplitudReposo(margen, radio);
            const px = (amp * Math.PI * radio) / 180;
            peorPx = Math.max(peorPx, px);
            check(amp < margen && amp <= 1.5, `N=${n} ${final}: balanceo ±${amp.toFixed(3)}° con margen ${margen.toFixed(3)}°`);
            check(px <= 6 + 1e-9, `N=${n} ${final}: balanceo de ${px.toFixed(2)} px en el borde (radio ${radio})`);
            for (const d of [-amp, amp]) {
              if (gajoBajoPuntero(plan.anguloFinal + d, n) !== ganador) {
                check(false, `N=${n} ${final}: el balanceo sale del gajo ganador`);
                break;
              }
            }
          }
        }
      }
    }
  }
  resumen.push(`pose final: ${planes} planes en su gajo, margen mínimo ${peorMargen.toFixed(3)}× el exigido; balanceo ≤ ${peorPx.toFixed(2)} px`);
}

/* --- §9: gajoBajoPuntero ∘ planGiro = ganador, N ∈ [1, 100], con vueltas y duración sorteadas --- */
{
  const PLANES = 10000;
  let malos = 0, golpesJuntos = 0, offsetsMalos = 0, vueltasMal = 0, duracionMal = 0;
  const historial = [];
  for (let i = 0; i < PLANES; i++) {
    const n = 1 + (i % 100);
    const ganador = indiceAlAzar(n, u32Semilla);
    const final = elegirFinal(historial, n, u32Semilla);
    historial.push(final);
    const anguloActual = unidad() * 360 - 8; // tras la anticipación de 8°
    const plan = planGiro({ anguloActual, ganador, n, final, rnd: u32Semilla });
    if (gajoBajoPuntero(plan.anguloFinal, n) !== ganador) malos++;
    if (!(plan.vueltas >= 5 && plan.vueltas <= 7)) vueltasMal++;
    if (!(plan.duracion >= 5000 && plan.duracion <= 7000)) duracionMal++;
    if (!offsetsValidos(plan.rotor) || !offsetsValidos(plan.puntero) || !offsetsValidos(plan.etiquetas)) offsetsMalos++;
    for (let k = 1; k < plan.golpes.length; k++) if (plan.golpes[k] - plan.golpes[k - 1] < 50) { golpesJuntos++; break; }
    // El rotor empieza donde está la rueda y la acción acaba en anguloAccion.
    const r0 = grados(plan.rotor[0].transform), r1 = grados(plan.rotor[plan.rotor.length - 1].transform);
    check(Math.abs(r0 - anguloActual) < 1e-3 && Math.abs(r1 - plan.anguloAccion) < 1e-3, `plan ${i}: el rotor no va de ${anguloActual} a ${plan.anguloAccion}`);
  }
  check(malos === 0, `${malos}/${PLANES} planes no paran en el ganador`);
  check(offsetsMalos === 0, `${offsetsMalos}/${PLANES} planes con offsets que element.animate() rechazaría`);
  check(golpesJuntos === 0, `${golpesJuntos}/${PLANES} planes con golpes del puntero a < 50 ms`);
  check(vueltasMal === 0 && duracionMal === 0, `vueltas fuera de 5–7 (${vueltasMal}) o duración fuera de 5–7 s (${duracionMal})`);
  // Con 100 opciones hay más cruces que fotogramas: la fusión deja pocos golpes.
  const denso = planGiro({ anguloActual: 0, ganador: 0, n: 100, vueltas: 6, duracion: 6000, rnd: u32Semilla });
  check(denso.golpes.length < denso.cruces / 3, `N=100: ${denso.golpes.length} golpes para ${denso.cruces} cruces (no se fusionan)`);
  resumen.push(`planGiro: ${PLANES - malos}/${PLANES} paran en el ganador (N 1–100); N=100: ${denso.cruces} cruces → ${denso.golpes.length} golpes`);
}

/* --- §6.3: curva por tramos --- */
{
  let peorSalto = 0, peorArranque = 0;
  for (const n of [1, 2, 6, 13, 30, 31, 40, 100]) {
    const s = 360 / n;
    const thC = n <= 30 ? Math.min(90, 1.5 * s) : 90;
    for (let v = 5; v <= 7; v++) {
      for (const dur of [5000, 6000, 7000]) {
        const T = dur / 1000;
        const total = 360 * v + unidad() * 360;
        const th = curva(total, T, n);
        check(Math.abs(th(T) - total) < 1e-9 && th(0) === 0, `curva N=${n}: no va de 0 a ${total}`);
        const cola = th(T) - th(0.7 * T);
        check(Math.abs(cola - thC) < 1e-6, `curva N=${n}: la cola recorre ${cola.toFixed(3)}°, esperado ${thC.toFixed(3)}°`);
        // Continuidad de velocidad en el empalme (T₁ = 0,7·T).
        const h = 1e-5, T1 = 0.7 * T;
        const vIzq = (th(T1) - th(T1 - h)) / h, vDer = (th(T1 + h) - th(T1)) / h;
        const salto = Math.abs(vIzq - vDer) / vDer;
        peorSalto = Math.max(peorSalto, salto);
        check(salto < 1e-3, `curva N=${n}: salto de velocidad en el empalme (${vIzq.toFixed(2)} → ${vDer.toFixed(2)} °/s)`);
        // Monótona: nunca retrocede durante la acción.
        let previo = 0;
        for (let k = 1; k <= 600; k++) {
          const a = th((k / 600) * T);
          if (a < previo - 1e-9) { check(false, `curva N=${n}: retrocede en t=${((k / 600) * T).toFixed(3)} s`); break; }
          previo = a;
        }
      }
      // Arranque en los casos de referencia del SDD: v vueltas en v segundos.
      const arranque = curva(360 * v, v, n)(1 / 60);
      peorArranque = Math.max(peorArranque, arranque);
      check(arranque <= 17, `curva N=${n}: arranque de ${arranque.toFixed(2)}°/fotograma con ${v} vueltas en ${v} s`);
    }
  }
  resumen.push(`curva: cola = min(90°, 1,5 gajos), salto en el empalme ≤ ${(peorSalto * 100).toFixed(4)} %, arranque ≤ ${peorArranque.toFixed(2)}°/fotograma (v vueltas en v s)`);
}

/* --- tonoDe: vecinos distintos, también el último con el primero --- */
{
  let malos = 0;
  for (let n = 2; n <= 100; n++) {
    const t = Array.from({ length: n }, (_, i) => tonoDe(i, n, 8));
    for (let i = 0; i < n; i++) {
      if (!(t[i] >= 0 && t[i] < 8) || t[i] === t[(i + 1) % n]) { malos++; break; }
    }
  }
  check(malos === 0, `tonoDe: ${malos} valores de N con vecinos iguales`);
  check(tonoDe(0, 1, 8) === 0, 'tonoDe con N = 1 no da 0');
}

/* --- geometria y leerOpciones --- */
{
  const g1 = geometria(1);
  check(g1.length === 1 && g1[0].ini === 0 && g1[0].fin === 360 && (g1[0].d.match(/A/g) || []).length === 2, 'geometria(1) no es un círculo completo');
  const g6 = geometria(6);
  check(g6.length === 6 && g6[5].fin === 360 && g6[2].med === 150 && g6.every((x) => /^M100 100L/.test(x.d)), 'geometria(6) mal formada');
  const o = leerOpciones('  Pizza \n\n Tacos\r\n   \nSushi  ');
  check(JSON.stringify(o) === '["Pizza","Tacos","Sushi"]', `leerOpciones: ${JSON.stringify(o)}`);
  check(leerOpciones('').length === 0 && leerOpciones(null).length === 0, 'leerOpciones de vacío no da []');
}

/* --- reasignarOcultas --- */
{
  const igual = (set, arr) => JSON.stringify([...set].sort((a, b) => a - b)) === JSON.stringify(arr);
  const casos = [
    ['misma lista', ['A', 'B', 'C'], ['A', 'B', 'C'], [1], [1]],
    ['inserción encima', ['A', 'B', 'C'], ['X', 'A', 'B', 'C'], [1], [2]],
    ['borrado encima', ['A', 'B', 'C'], ['B', 'C'], [2], [1]],
    ['borrada la oculta', ['A', 'B', 'C'], ['A', 'C'], [1], []],
    ['editada la oculta', ['A', 'B', 'C'], ['A', 'Bx', 'C'], [1], []],
    ['duplicados ocultos, no colapsan', ['A', 'B', 'A', 'B'], ['X', 'A', 'B', 'A', 'B'], [0, 2], [1, 3]],
    ['duplicados: solo el segundo oculto', ['A', 'A', 'A'], ['A', 'A', 'A'], [1], [1]],
    ['duplicados: uno borrado', ['A', 'A', 'B'], ['A', 'B'], [0, 1], [0]],
    ['reordenada', ['A', 'B', 'C'], ['C', 'B', 'A'], [0, 2], [0, 2]],
    ['índice fuera de la lista', ['A'], ['A'], [5], []],
    ['dos ocultas iguales tras inserción doble', ['B', 'B'], ['A', 'A', 'B', 'B'], [0, 1], [2, 3]],
  ];
  for (const [nombre, antes, despues, ocultas, esperado] of casos) {
    const r = reasignarOcultas(antes, despues, new Set(ocultas));
    check(igual(r, esperado), `reasignarOcultas (${nombre}): ${JSON.stringify([...r])}, esperado ${JSON.stringify(esperado)}`);
  }
}

/* --- migrarGuardado (§6.9) --- */
{
  const desde = (obj) => (k) => (Object.hasOwn(obj, k) ? obj[k] : null);
  const vacia = migrarGuardado(desde({}));
  check(vacia.opciones === OPCIONES_POR_DEFECTO.join('\n') && vacia.ocultas.size === 0 && vacia.pregunta === '' && !vacia.foco
    && !vacia.sonido && vacia.modo === 'normal' && Object.keys(vacia.conteo.cuentas).length === 0 && vacia.historial.length === 0,
    `migrarGuardado sin nada: ${JSON.stringify({ ...vacia, ocultas: [...vacia.ocultas] })}`);

  const viejas = {
    ruleta_opciones: 'Ana\nLuis\nAna\nEva',
    ruleta_ocultas: JSON.stringify(['Ana']),            // v1: textos
    ruleta_titulo: '¿Quién friega?',
    ruleta_focus: 'true',
    ruleta_sound: 'true',                               // se deja de leer (D1)
  };
  const nuevas = {
    [CLAVES.opciones]: 'Uno\nDos\nTres',
    [CLAVES.ocultas]: JSON.stringify({ v: 2, indices: [2] }),
    [CLAVES.pregunta]: '¿Qué vemos?',
    [CLAVES.foco]: 'false',
    [CLAVES.sonido]: 'true',
    [CLAVES.modo]: 'contar',
    [CLAVES.conteo]: JSON.stringify({ v: 1, cuentas: { Uno: 2, Dos: 1 } }),
    [CLAVES.historial]: JSON.stringify([{ opcion: 'Uno', para: '¿Qué vemos?', t: 1, cuenta: 2 }]),
  };
  const combinaciones = [
    // 1. Solo viejas: se migra todo, ocultas v1 ocultan cada línea con ese texto.
    ['solo viejas', viejas, { opciones: viejas.ruleta_opciones, ocultas: [0, 2], pregunta: '¿Quién friega?', foco: true, sonido: false }],
    // 2. Solo nuevas.
    ['solo nuevas', nuevas, { opciones: 'Uno\nDos\nTres', ocultas: [2], pregunta: '¿Qué vemos?', foco: false, sonido: true, modo: 'contar' }],
    // 3. Las dos: mandan las nuevas.
    ['nuevas y viejas', { ...viejas, ...nuevas }, { opciones: 'Uno\nDos\nTres', ocultas: [2], pregunta: '¿Qué vemos?', foco: false, sonido: true }],
    // 4. Opciones nuevas, el resto viejo (cada dato se busca por separado).
    ['opciones nuevas, resto viejo', { ...viejas, [CLAVES.opciones]: 'Ana\nEva' }, { opciones: 'Ana\nEva', ocultas: [0], pregunta: '¿Quién friega?', foco: true }],
    // 5. Ocultas viejas en v2.
    ['ocultas viejas v2', { ruleta_opciones: 'A\nB\nC', ruleta_ocultas: JSON.stringify({ v: 2, indices: [0, 2, 9, -1, 1.5, 'x'] }) }, { opciones: 'A\nB\nC', ocultas: [0, 2] }],
    // 6. Título viejo por defecto: pregunta vacía.
    ['título por defecto', { ruleta_titulo: 'Ruleta de Opciones' }, { pregunta: '' }],
    // Corruptos: JSON roto en cada clave JSON, valores fuera de dominio.
    ['JSON corrupto', { [CLAVES.ocultas]: '{v:2,', [CLAVES.conteo]: 'nope', [CLAVES.historial]: '[{', [CLAVES.modo]: 'turbo', ruleta_ocultas: '["A"' },
      { ocultas: [], modo: 'normal' }],
    ['tipos raros', { [CLAVES.opciones]: 'A\nB', [CLAVES.ocultas]: 'null', [CLAVES.conteo]: JSON.stringify({ v: 1, cuentas: { A: -1, B: 2.5, C: 3 } }),
      [CLAVES.historial]: JSON.stringify([null, 5, { opcion: '' }, { opcion: 'A', para: 3, t: 'x' }]) }, { ocultas: [] }],
  ];
  for (const [nombre, datos, esperado] of combinaciones) {
    let r;
    try { r = migrarGuardado(desde(datos)); } catch (e) { check(false, `migrarGuardado (${nombre}) lanza: ${e.message}`); continue; }
    for (const [k, v] of Object.entries(esperado)) {
      const real = k === 'ocultas' ? [...r.ocultas].sort((a, b) => a - b) : r[k];
      check(JSON.stringify(real) === JSON.stringify(v), `migrarGuardado (${nombre}): ${k} = ${JSON.stringify(real)}, esperado ${JSON.stringify(v)}`);
    }
  }
  const raros = migrarGuardado(desde(combinaciones[7][1]));
  check(JSON.stringify(raros.conteo) === '{"v":1,"cuentas":{"C":3}}', `migrarGuardado: conteo ${JSON.stringify(raros.conteo)}`);
  check(JSON.stringify(raros.historial) === '[{"opcion":"A","para":"","t":0}]', `migrarGuardado: historial ${JSON.stringify(raros.historial)}`);
  const n2 = migrarGuardado(desde(nuevas));
  check(JSON.stringify(n2.conteo) === '{"v":1,"cuentas":{"Uno":2,"Dos":1}}' && n2.historial[0].cuenta === 2, 'migrarGuardado: conteo o historial nuevos mal leídos');
  // Historial de más de 20: se queda con los 20 primeros (los más recientes).
  const largo = Array.from({ length: 30 }, (_, i) => ({ opcion: `O${i}`, para: '', t: i }));
  const h = migrarGuardado(desde({ [CLAVES.historial]: JSON.stringify(largo) })).historial;
  check(h.length === HISTORIAL_MAX && h[0].opcion === 'O0', `migrarGuardado: historial de ${h.length}`);
  // Pregunta larga: recortada a 60.
  check(migrarGuardado(desde({ [CLAVES.pregunta]: 'x'.repeat(80) })).pregunta.length === 60, 'migrarGuardado: pregunta sin recortar');
  // localStorage que lanza (Safari privado): valores por defecto, sin excepción.
  let lanza;
  try { lanza = migrarGuardado(() => { throw new Error('SecurityError'); }); } catch (e) { check(false, `migrarGuardado lanza si leer lanza: ${e.message}`); }
  check(lanza && lanza.opciones === OPCIONES_POR_DEFECTO.join('\n') && lanza.modo === 'normal', 'migrarGuardado con leer que lanza no da los valores por defecto');
  // Solo algunas claves lanzan: las nuevas fallan, se leen las viejas.
  const mitad = migrarGuardado((k) => { if (k.startsWith('decidelo_')) throw new Error('x'); return desde(viejas)(k); });
  check(mitad.opciones === viejas.ruleta_opciones && mitad.foco === true, 'migrarGuardado: con las claves nuevas lanzando no lee las viejas');
}

/* --- enlace / leerEnlace (§6.10) --- */
{
  const BASE = 'https://decidelo.app/ruleta?x=1#viejo';
  const ida = [
    { para: '', opciones: ['Pizza'] },
    { para: '¿Quién friega?', opciones: ['Ana', 'Luis', 'María José'] },
    { para: 'a&b=c#d', opciones: ['50% + 1', 'x&opcion=y', '#hash', 'é ñ ü 🍕', 'a=b', '?', '/'] },
    { para: 'x'.repeat(60), opciones: Array.from({ length: 100 }, (_, i) => `${i}`.padEnd(60, 'z')) },
    { para: '', opciones: ['Igual', 'Igual'] },
  ];
  for (const x of ida) {
    const url = enlace(BASE, x);
    check(url.startsWith('https://decidelo.app/ruleta#'), `enlace: base mal aplicada (${url.slice(0, 60)})`);
    const vuelta = leerEnlace(new URL(url).hash);
    check(JSON.stringify(vuelta) === JSON.stringify(x), `leerEnlace(enlace(x)) ≠ x para ${JSON.stringify(x).slice(0, 80)}`);
    check(JSON.stringify(leerEnlace(new URL(url).hash.slice(1))) === JSON.stringify(x), 'leerEnlace sin # no da lo mismo');
  }
  // Límites: más de 100 opciones o de 60 caracteres se recortan.
  const grande = leerEnlace('#' + Array.from({ length: 150 }, (_, i) => `opcion=${'o'.repeat(80)}${i}`).join('&') + `&para=${'p'.repeat(90)}`);
  check(grande && grande.opciones.length === 100 && grande.opciones.every((o) => o.length === 60) && grande.para.length === 60, 'leerEnlace no aplica los límites');
  const recortado = leerEnlace(new URL(enlace(BASE, { para: '', opciones: Array.from({ length: 120 }, () => 'y'.repeat(70)) })).hash);
  check(recortado.opciones.length === 100 && recortado.opciones[0].length === 60, 'enlace no aplica los límites');
  // Mal formados: null, sin lanzar.
  const malos = ['', '#', '#para=Hola', '#opcion=', '#opcion=%20%20&opcion=', '#%E0%A4%A', '#opcion=%', '#opcion=%ZZ%', '#&&&', null, undefined, 123, {}, [], '#opcion'];
  for (const m of malos) {
    let r;
    try { r = leerEnlace(m); } catch (e) { check(false, `leerEnlace(${JSON.stringify(m)}) lanza: ${e.message}`); continue; }
    const aceptable = r === null || (m === '#opcion=%' && r && r.opciones[0] === '%') || (m === '#opcion=%ZZ%' && r && r.opciones[0] === '%ZZ%');
    check(aceptable, `leerEnlace(${JSON.stringify(m)}) = ${JSON.stringify(r)}, esperado null`);
  }
  const unaMala = leerEnlace('#opcion=%E0%A4%A&opcion=Bien');
  check(unaMala && unaMala.opciones.includes('Bien'), 'leerEnlace descarta un enlace por una opción mal codificada');
}

if (fallos.length) {
  console.error(`ruleta-check: ${fallos.length} fallo(s)`);
  fallos.slice(0, 30).forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('ruleta-check: OK');
resumen.forEach((r) => console.log('  ' + r));
