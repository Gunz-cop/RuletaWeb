// ==========================================================
// PLAN DEL GIRO
// ==========================================================
// Antes el ganador salía de dejar caer la rueda con una velocidad inicial al
// azar, y eso no es uniforme: con rozamiento 0.984 el recorrido es casi
// lineal en la velocidad y cubre ≈ 2,49 vueltas, así que una parte del
// círculo se recorre 3 veces y el resto 2 (con 6 opciones, del 13,4 % al
// 20,1 % en lugar del 16,7 %). Ahora se decide primero el ganador, con
// crypto y sin sesgo, y la velocidad inicial se calcula para que la rueda
// pare justo en su gajo. El giro se ve igual que antes: mismo rozamiento,
// mismo umbral de parada, mismo número de vueltas.
//
// Vive fuera de initRoulette para que scripts/ruleta-giro-check.mjs importe
// exactamente el código que corre en la página y no una copia.

export const ROZAMIENTO = 0.984;
export const UMBRAL_PARADA = 0.0012;
const VUELTA = 2 * Math.PI;
// El puntero está arriba (12 en punto), en 1.5π del sistema del canvas.
const ANGULO_PUNTERO = 1.5 * Math.PI;
// Margen dentro del gajo: el tope [0,15; 0,85] evita parar pegado a una
// línea, donde un redondeo o un píxel decidirían el gajo.
const MARGEN_MIN = 0.15;
const MARGEN_MAX = 0.85;
// Vueltas del recorrido: el rango que daba el código anterior.
const VUELTAS_MIN = 3.5;
const VUELTAS_MAX = 6;

function u32Crypto() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

// Entero uniforme en [0, n) por muestreo por rechazo: descarta la cola de
// 2**32 que no completa un reparto entero, así que no hay sesgo de módulo.
export function enteroUniforme(n, u32 = u32Crypto) {
  const limite = 2 ** 32 - (2 ** 32 % n);
  let x;
  do {
    x = u32();
  } while (x >= limite);
  return x % n;
}

// Gajo que queda bajo el puntero para un ángulo de la rueda.
export function indiceEnPuntero(angulo, n) {
  const arco = VUELTA / n;
  const normalizado = ((angulo % VUELTA) + VUELTA) % VUELTA;
  const enPuntero = (ANGULO_PUNTERO - normalizado + 2 * VUELTA) % VUELTA;
  return Math.floor(enPuntero / arco);
}

// Un frame de la física. Es la única definición del bucle: la usan la
// página (updateSpin) y la bisección, para que lo que se calcula sea
// exactamente lo que se anima.
export function pasoDeGiro(angulo, velocidad) {
  const nuevoAngulo = angulo + velocidad;
  const nuevaVelocidad = velocidad * ROZAMIENTO;
  return { angulo: nuevoAngulo, velocidad: nuevaVelocidad, parado: nuevaVelocidad < UMBRAL_PARADA };
}

// Ángulo recorrido desde que se lanza con `velocidad` hasta que para.
export function recorrido(velocidad) {
  let angulo = 0;
  let v = velocidad;
  for (;;) {
    const paso = pasoDeGiro(angulo, v);
    angulo = paso.angulo;
    v = paso.velocidad;
    if (paso.parado) return angulo;
  }
}

// Velocidad inicial cuyo recorrido es `distancia`. El recorrido crece con la
// velocidad, así que basta bisección. Salta por escalones de ≈ UMBRAL_PARADA
// (cada frame extra suma lo que queda de velocidad), mucho menos que el
// margen de cualquier gajo.
export function velocidadParaRecorrer(distancia) {
  let bajo = 0;
  let alto = 1;
  while (recorrido(alto) < distancia) alto *= 2;
  for (let i = 0; i < 60; i++) {
    const medio = (bajo + alto) / 2;
    if (recorrido(medio) < distancia) bajo = medio;
    else alto = medio;
  }
  return alto;
}

// Decide un giro completo desde `angulo` (ángulo actual de la rueda) con `n`
// opciones. Devuelve el ganador elegido, el ángulo en que la rueda queda y la
// velocidad inicial que llega ahí.
export function planificarGiro(n, angulo, u32 = u32Crypto) {
  const ganador = enteroUniforme(n, u32);
  const desfase = MARGEN_MIN + (u32() / 2 ** 32) * (MARGEN_MAX - MARGEN_MIN);
  // Posición, sobre la rueda, que debe quedar bajo el puntero.
  const enRueda = (ganador + desfase) * (VUELTA / n);
  const destino = ((ANGULO_PUNTERO - enRueda) % VUELTA + VUELTA) % VUELTA;
  const actual = ((angulo % VUELTA) + VUELTA) % VUELTA;
  const avance = ((destino - actual) % VUELTA + VUELTA) % VUELTA;
  // Vueltas enteras que se suman para caer en el rango de siempre.
  const fraccion = avance / VUELTA;
  const kMin = Math.ceil(VUELTAS_MIN - fraccion);
  const kMax = Math.floor(VUELTAS_MAX - fraccion);
  const vueltas = kMin + enteroUniforme(kMax - kMin + 1, u32);
  const distancia = avance + vueltas * VUELTA;
  return {
    ganador,
    anguloFinal: angulo + distancia,
    velocidadInicial: velocidadParaRecorrer(distancia),
  };
}
