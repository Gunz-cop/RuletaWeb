// ==========================================================
// SISTEMA DE CONFETTI NATIVO EN CANVAS
// ==========================================================
export class ConfettiManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.active = false;
    this.animationId = null;
    this.stopTimeoutId = null;
  }

  start() {
    // El confeti es puro adorno de movimiento: si la persona pidió menos
    // movimiento a nivel de sistema operativo, no lo lanzamos. El giro ya
    // respetaba esta preferencia; esto era la mitad que faltaba.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.active = true;
    this.particles = [];
    this.resize();

    // Paleta de colores festivos. Los dos cian puros del trío neón
    // (#00e5ff/#66f0ff) desentonaban con el acento cálido único del
    // sistema editorial, así que se reemplazan por variantes cálidas; el
    // resto de la variedad festiva (rosa, verde, ámbar, violeta) se queda
    // igual — el confeti no tiene por qué ser monocromo, es celebración,
    // no el color de marca.
    const colors = ['#e2905a', '#f2b98a', '#f43f5e', '#fb7185', '#34d399', '#fbbf24', '#a78bfa', '#d9773e'];

    // Math.random() aquí a propósito, no crypto.getRandomValues: esto es
    // puro adorno visual (posición/tamaño/color de cada partícula), no un
    // sorteo, así que no necesita la aleatoriedad "de mejor calidad" que sí
    // justifica su uso en random.js para el giro. No lo migres sin razón.
    const particleCount = 140;
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height - this.canvas.height,
        size: Math.random() * 6 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.08 + 0.03,
        tiltAngle: 0,
        speed: Math.random() * 2.5 + 2
      });
    }

    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animate();

    // Corte por tiempo: si el modal se queda abierto (la persona no lo
    // cierra), el confeti no debe animar indefinidamente en segundo plano.
    if (this.stopTimeoutId) clearTimeout(this.stopTimeoutId);
    this.stopTimeoutId = setTimeout(() => this.stop(), 4000);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  animate() {
    if (!this.active) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let activeParticles = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += p.speed;
      p.x += Math.sin(p.tiltAngle) * 0.5;
      p.tilt = Math.sin(p.tiltAngle - i / 3) * 12;

      if (p.y < this.canvas.height) {
        activeParticles = true;
        this.ctx.beginPath();
        this.ctx.lineWidth = p.size;
        this.ctx.strokeStyle = p.color;
        this.ctx.moveTo(p.x + p.tilt + p.size / 2, p.y);
        this.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.size / 2);
        this.ctx.stroke();
      }
    }

    if (activeParticles) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.active = false;
    }
  }

  stop() {
    this.active = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.stopTimeoutId) clearTimeout(this.stopTimeoutId);
    this.animationId = null;
    this.stopTimeoutId = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
