// ==========================================================
// ALEATORIEDAD
// ==========================================================
// Math.random() es determinista-débil (PRNG no criptográfico, sembrado con
// poca entropía en algunos motores). Para un sorteo esto importa un poco de
// verdad -si dos personas giran "al mismo tiempo" en máquinas con el mismo
// reloj, un PRNG pobre puede correlacionar resultados- y crypto.getRandomValues
// es igual de barato de llamar, así que no hay razón para no usarlo aquí.
export function randomFloat() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // 2**32 normaliza a [0, 1); dividir por (2**32 - 1) sesgaría levemente hacia 1.
  return buffer[0] / 2 ** 32;
}

// Fisher-Yates usando la fuente de aleatoriedad de arriba.
export function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(randomFloat() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
