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

  // Los navegadores exigen crear/():reanudar el AudioContext dentro de un
  // gesto del usuario, así que se crea perezosamente en el primer click.
  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
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
