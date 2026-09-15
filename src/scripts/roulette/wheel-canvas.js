// ==========================================================
// DIBUJO DE LA RUEDA (offscreen + blit rotado)
// ==========================================================
// El giro dura varios segundos a 60fps. Redibujar los N segmentos (con
// medición de texto incluida) en cada frame es trabajo que no cambia de
// resultado entre frame y frame: solo cambia el ángulo. Pintamos la rueda
// una única vez en un canvas fuera de pantalla y, durante el giro, nos
// limitamos a rotar y copiar (`drawImage`) esa imagen ya resuelta sobre el
// canvas visible. Eso convierte el costo por frame de "N segmentos + N
// measureText" a "una rotación + un blit", que es lo que de verdad pesa en
// un móvil de gama media.
// Contraste real (WCAG), no "texto blanco porque el fondo es oscuro". La
// paleta de generateContrastColors() (roulette.js) rota 360° de hue: hay
// wedges donde blanco sobre ese color no llega a AA, sobre todo en la
// franja amarillo/naranja donde la luminosidad percibida sube aunque el
// HSL diga "46% de luz". La solución no es "blanco salvo que falle,
// entonces negro": para un hue de luminancia intermedia ni blanco ni negro
// llegan a 4.5:1 por separado, así que hay que calcular las DOS opciones y
// quedarse con la que de más contraste. El peor caso posible de esa
// estrategia (demostrable: ocurre cuando la luminancia del color cae justo
// en el punto donde ambos contrastes se igualan) es 4.58:1 — por encima
// del umbral AA de texto normal (4.5:1) para cualquier hue que
// generateContrastColors pueda producir, no solo los que se probaron a
// ojo.
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance([r, g, b]) {
  const canal = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
}

// Ratio de contraste (fórmula WCAG) entre dos luminancias relativas.
function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function colorTextoLegible(hslString) {
  const m = hslString.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
  if (!m) return '#ffffff'; // formato inesperado: no arriesgar, asumir blanco legible
  const [, h, s, l] = m.map(Number);
  const L = relativeLuminance(hslToRgb(h, s, l));
  const contrasteBlanco = contrastRatio(L, 1);
  const contrasteNegro = contrastRatio(L, 0);
  return contrasteBlanco >= contrasteNegro ? '#ffffff' : '#000000';
}

export class WheelRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.offscreen = null;
    this.offCtx = null;
    this.cacheKey = null; // firma de tamaño+dpr+contenido para saber si repintar
  }

  // OffscreenCanvas no existe en todos los navegadores (Safari lo sumó
  // tarde); un <canvas> normal nunca insertado en el DOM funciona igual de
  // bien como superficie de dibujo intermedia.
  #ensureSurface(pixelSize) {
    const needsNew =
      !this.offscreen || this.offscreen.width !== pixelSize || this.offscreen.height !== pixelSize;
    if (!needsNew) return;

    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreen = new OffscreenCanvas(pixelSize, pixelSize);
    } else {
      this.offscreen = document.createElement('canvas');
      this.offscreen.width = pixelSize;
      this.offscreen.height = pixelSize;
    }
    this.offCtx = this.offscreen.getContext('2d');
  }

  // Truncar textos largos para no colisionar con el botón central.
  #truncateText(text, maxWidth, canvasCtx) {
    let width = canvasCtx.measureText(text).width;
    if (width <= maxWidth) return text;

    const ellipsis = '...';
    let len = text.length;
    while (width > maxWidth && len > 0) {
      len--;
      text = text.substring(0, len);
      width = canvasCtx.measureText(text + ellipsis).width;
    }
    return text + ellipsis;
  }

  // Pinta la rueda completa (ángulo base 0) en el offscreen. Solo se llama
  // cuando cambian tamaño, dpr, opciones o colores — nunca por frame.
  #paint(size, dpr, options, colors) {
    const pixelSize = Math.round(size * dpr);
    this.#ensureSurface(pixelSize);

    const ctx = this.offCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 12;

    if (options.length === 0) {
      // Estado vacío: círculo base
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#151518';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#5a5a6e';
      ctx.font = '15px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Añade opciones para comenzar', centerX, centerY);
      return;
    }

    const arc = (2 * Math.PI) / options.length;

    for (let i = 0; i < options.length; i++) {
      const startAngle = i * arc;
      const endAngle = startAngle + arc;

      // Dibujar segmento
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = colors[i];
      ctx.fill();

      // Línea divisoria
      ctx.strokeStyle = '#111113';
      ctx.lineWidth = options.length > 30 ? 1 : 2.5;
      ctx.stroke();

      // Texto radial
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colorTextoLegible(colors[i]);

      // Escalar fuente dinámicamente
      let fontSize = 16;
      if (options.length > 25) fontSize = 9;
      else if (options.length > 18) fontSize = 11;
      else if (options.length > 10) fontSize = 13;

      ctx.font = `bold ${fontSize}px Outfit, sans-serif`;

      const availableWidth = radius - 70;
      const text = this.#truncateText(options[i], availableWidth, ctx);

      ctx.fillText(text, radius - 18, 0);
      ctx.restore();
    }

    // Borde externo decorativo
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, 2 * Math.PI);
    ctx.strokeStyle = '#1f1f25';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Círculo interno detrás del botón central
    ctx.beginPath();
    ctx.arc(centerX, centerY, 43, 0, 2 * Math.PI);
    ctx.fillStyle = '#111113';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // size/dpr en las mismas unidades que ya usaba drawRoulette (size = CSS px,
  // ctx ya viene escalado por dpr desde resizeCanvas). angle es el ángulo de
  // giro actual en radianes.
  render(size, dpr, options, colors, angle) {
    // Firma barata para decidir si hace falta repintar el offscreen.
    // JSON.stringify evita la ambigüedad de un join con separador: con
    // options=["Juan","Pedro Ana"] y options=["Juan Pedro","Ana"], un join
    // con un separador que pueda aparecer en el texto (o, peor, un
    // separador invisible) produciría la misma clave para dos ruedas
    // distintas y una se quedaría pintada con las opciones de la otra.
    // Son arrays cortos (la ruleta no tiene miles de opciones) y esto solo
    // corre cuando cambia algo, no en cada frame de giro.
    const key = `${size}|${dpr}|${JSON.stringify(options)}|${colors.join(',')}`;
    if (key !== this.cacheKey) {
      this.#paint(size, dpr, options, colors);
      this.cacheKey = key;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle);
    ctx.translate(-size / 2, -size / 2);
    ctx.drawImage(this.offscreen, 0, 0, size, size);
    ctx.restore();
  }
}
