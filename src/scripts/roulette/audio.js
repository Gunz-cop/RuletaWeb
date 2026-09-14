// ==========================================================
// SONIDO SINTETIZADO CON WEB AUDIO API
// ==========================================================
// Encapsulado en una clase para no repartir `audioCtx` y el guard de
// `soundEnabled` por todo el controlador: cada método ya sabe si debe
// sonar o no.
export class RouletteAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Los navegadores exigen crear/reanudar el AudioContext dentro de un
  // gesto del usuario, así que se crea perezosamente en el primer click.
  // Protegido con try/catch porque Chrome limita a ~6 AudioContext vivos
  // por documento: si `close()` no se llama al limpiar una instancia (ver
  // `close()` más abajo y el cleanup en roulette.js), navegar varias veces
  // con view transitions agota el cupo y `new AudioContext()` lanza. Sin
  // este try/catch, ese throw -que antes se propagaba fuera de este
  // método- dejaba `startSpin` a medio ejecutar y el botón GIRAR sin
  // reaccionar más.
  ensureContext() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch (err) {
      console.warn('No se pudo crear/reanudar el AudioContext:', err);
      return null;
    }
  }

  // Cierra el AudioContext, si existe. Se llama al limpiar la instancia de
  // la ruleta (view transitions) para devolver el cupo de contextos del
  // navegador; sin esto cada navegación de ida y vuelta a la home dejaba un
  // AudioContext abierto y sin usar.
  close() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }

  // Sonido de "tick" físico. spinVelocity ajusta el tono para simular inercia.
  playTick(spinVelocity) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';

      const speedFactor = Math.min(spinVelocity / 0.4, 1);
      const frequency = 250 + speedFactor * 320;

      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.035);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

      osc.start();
      osc.stop(ctx.currentTime + 0.035);
    } catch (err) {
      console.warn('AudioContext bloqueado o no soportado:', err);
    }
  }

  // Arpegio de victoria sintético.
  playWinner() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [261.63, 329.63, 392.0, 523.25]; // Do Mayor

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.09);

        gain.gain.setValueAtTime(0, now + index * 0.09);
        gain.gain.linearRampToValueAtTime(0.08, now + index * 0.09 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + 0.25);

        osc.start(now + index * 0.09);
        osc.stop(now + index * 0.09 + 0.3);
      });
    } catch (err) {
      console.warn('Error al reproducir sonido de victoria:', err);
    }
  }
}
