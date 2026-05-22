// ==========================================================
// TEMPORIZADOR ALEATORIO — LÓGICA Y AUDIO SYNTH
// ==========================================================

function initTemporizador() {
  const minSlider = document.getElementById('timer-min-slider');
  const maxSlider = document.getElementById('timer-max-slider');
  const minValueDisplay = document.getElementById('min-value-display');
  const maxValueDisplay = document.getElementById('max-value-display');
  const modeButtons = document.querySelectorAll('#timer-mode-selector .selector-btn');
  const btnStart = document.getElementById('btn-spin');
  const timerRingContainer = document.querySelector('.timer-ring-container');
  const progressFill = document.getElementById('timer-progress-fill');
  const timerIcon = document.getElementById('timer-icon');
  const timerTime = document.getElementById('timer-time');
  const timerStatus = document.getElementById('timer-status');
  const historyList = document.getElementById('history-list');
  const btnClear = document.getElementById('btn-clear');
  const toast = document.getElementById('toast-message');

  if (!minSlider || !maxSlider || !btnStart || !timerTime || !progressFill) return;

  // Cleanup potential previous runs to avoid leaks on Astro page changes
  if (window.activeTimerInterval) {
    clearInterval(window.activeTimerInterval);
    window.activeTimerInterval = null;
  }
  if (window.activeTickTimeout) {
    clearTimeout(window.activeTickTimeout);
    window.activeTickTimeout = null;
  }
  if (window.activeAnimationLoop) {
    cancelAnimationFrame(window.activeAnimationLoop);
    window.activeAnimationLoop = null;
  }

  let isRunning = false;
  let timerMode = 'normal'; // 'normal' | 'secret'
  let minSeconds = parseInt(minSlider.value, 10);
  let maxSeconds = parseInt(maxSlider.value, 10);
  let targetDuration = 0;
  let startTime = 0;
  let history = JSON.parse(localStorage.getItem('decidelo_timer_history')) || [];
  let audioCtx = null;

  // Audio Synthesizer functions
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTickSound(isHigh = true) {
    // Respect the global sound toggle in Header if present
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn && soundBtn.getAttribute('aria-pressed') === 'false') return;

    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isHigh ? 900 : 700, now);

      gain.gain.setValueAtTime(0.015, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Audio blocked or not supported
    }
  }

  function playSuccessSound() {
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn && soundBtn.getAttribute('aria-pressed') === 'false') return;

    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // Chord C5 - E5 - G5 - C6
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.05, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5 + idx * 0.06);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + 0.6 + idx * 0.06);
      });
    } catch (e) {
      // Audio blocked
    }
  }

  function playExplosionSound() {
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn && soundBtn.getAttribute('aria-pressed') === 'false') return;

    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // 1. White noise generator for explosion hiss
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(800, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(80, now + 1.2);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 1.5);

      // 2. Low-frequency boom (sawtooth detuned)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.9);

      oscGain.gain.setValueAtTime(0.45, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.0);
    } catch (e) {
      // Audio blocked
    }
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }

  // Format seconds to e.g. "1m 15s" or "35s"
  function formatSecondsPretty(totalSec) {
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Sliders Synchronization
  function updateSliderLabels() {
    minSeconds = parseInt(minSlider.value, 10);
    maxSeconds = parseInt(maxSlider.value, 10);

    // Enforce min <= max
    if (minSeconds > maxSeconds) {
      maxSlider.value = minSeconds;
      maxSeconds = minSeconds;
    }

    minValueDisplay.textContent = formatSecondsPretty(minSeconds);
    maxValueDisplay.textContent = formatSecondsPretty(maxSeconds);
  }

  minSlider.addEventListener('input', () => {
    updateSliderLabels();
    if (!isRunning) {
      timerTime.textContent = formatTime(minSeconds);
    }
  });

  maxSlider.addEventListener('input', () => {
    updateSliderLabels();
  });

  // Mode Selection
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRunning) return;

      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      timerMode = btn.getAttribute('data-mode');

      if (timerMode === 'secret') {
        timerTime.textContent = '??:??';
        timerIcon.textContent = '💣';
        progressFill.style.strokeDashoffset = '0';
        progressFill.style.stroke = 'var(--accent-danger)';
      } else {
        timerTime.textContent = formatTime(minSeconds);
        timerIcon.textContent = '⏳';
        progressFill.style.strokeDashoffset = '0';
        progressFill.style.stroke = 'url(#timer-gradient)';
      }
    });
  });

  // History Log
  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<span class="history-empty">Sin rondas iniciadas aún</span>';
      return;
    }

    history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item-row timer-row';
      const isBum = item.mode.includes('Bomba');
      el.innerHTML = `
        <div class="timer-meta-block">
          <span class="history-timer-mode">${item.mode}</span>
          <span class="history-timer-range">Rango: ${item.range}</span>
          <span class="history-time">${item.timestamp}</span>
        </div>
        <span class="history-value ${isBum ? 'danger' : 'success'}">${item.result}</span>
      `;
      historyList.appendChild(el);
    });
  }

  function saveToHistory(resultText, chosenDuration) {
    const rangeText = `${formatSecondsPretty(minSeconds)} - ${formatSecondsPretty(maxSeconds)}`;
    const modeLabel = timerMode === 'secret' ? '💣 Bomba Secreta' : '👁️ Cuenta Visible';
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      mode: modeLabel,
      range: rangeText,
      result: resultText,
      duration: chosenDuration
    };

    history.unshift(entry);
    if (history.length > 10) history.pop();

    localStorage.setItem('decidelo_timer_history', JSON.stringify(history));
    renderHistory();
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      history = [];
      localStorage.removeItem('decidelo_timer_history');
      renderHistory();
    });
  }

  // Timer run handlers
  function stopTimer(completedState = 'stopped', chosenSeconds = 0) {
    isRunning = false;
    btnStart.textContent = 'INICIAR TEMPORIZADOR';
    btnStart.classList.remove('danger-btn');
    timerRingContainer.classList.remove('running', 'ticking', 'secret-ticking', 'danger');

    if (window.activeTimerInterval) {
      clearInterval(window.activeTimerInterval);
      window.activeTimerInterval = null;
    }
    if (window.activeTickTimeout) {
      clearTimeout(window.activeTickTimeout);
      window.activeTickTimeout = null;
    }
    if (window.activeAnimationLoop) {
      cancelAnimationFrame(window.activeAnimationLoop);
      window.activeAnimationLoop = null;
    }

    // Enable config controls
    minSlider.disabled = false;
    maxSlider.disabled = false;
    modeButtons.forEach(btn => btn.removeAttribute('disabled'));

    if (completedState === 'success') {
      timerRingContainer.classList.add('completed');
      timerTime.textContent = '00:00';
      timerStatus.textContent = '¡Cumplido!';
      timerIcon.textContent = '🔔';
      progressFill.style.strokeDashoffset = '597'; // Vaciado completo

      // Play success audio & vibration
      playSuccessSound();
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 80, 100, 80, 200]);
      }

      saveToHistory(`¡Tiempo cumplido! (${formatSecondsPretty(chosenSeconds)})`, chosenSeconds);
    } else if (completedState === 'exploded') {
      timerRingContainer.classList.add('completed', 'exploded');
      timerTime.textContent = '💥 BUM';
      timerStatus.textContent = '¡Exploto!';
      timerIcon.textContent = '💥';
      progressFill.style.strokeDashoffset = '597';

      // Play explosion audio & heavy vibration
      playExplosionSound();
      if ('vibrate' in navigator) {
        navigator.vibrate([500, 100, 300, 100, 500]);
      }

      saveToHistory(`💥 Exploto en ${formatSecondsPretty(chosenSeconds)}`, chosenSeconds);
    } else {
      // Stopped manually
      if (timerMode === 'secret') {
        timerTime.textContent = '??:??';
        timerIcon.textContent = '💣';
        progressFill.style.strokeDashoffset = '0';
      } else {
        timerTime.textContent = formatTime(minSeconds);
        timerIcon.textContent = '⏳';
        progressFill.style.strokeDashoffset = '0';
      }
      timerStatus.textContent = 'Configurado';
    }
  }

  function startTimer() {
    if (isRunning) {
      stopTimer('stopped');
      return;
    }

    isRunning = true;
    btnStart.textContent = 'DETENER TEMPORIZADOR';
    btnStart.classList.add('danger-btn');
    timerRingContainer.classList.remove('completed', 'exploded');
    timerRingContainer.classList.add('running');

    // Disable config controls
    minSlider.disabled = true;
    maxSlider.disabled = true;
    modeButtons.forEach(btn => btn.setAttribute('disabled', 'true'));

    // Compute random target duration
    targetDuration = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
    startTime = Date.now();

    // Trigger AudioContext unlock
    getAudioCtx();

    if (timerMode === 'normal') {
      timerRingContainer.classList.add('ticking');
      timerStatus.textContent = 'Corriendo';
      
      let lastSecondTick = -1;

      // 100ms interval for smooth ring transition
      window.activeTimerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, targetDuration - elapsed);

        // Update Ring (0 = Full, 597 = Empty)
        const progress = remaining / targetDuration;
        progressFill.style.strokeDashoffset = (597 - (progress * 597)).toFixed(1);

        // Update Text
        timerTime.textContent = formatTime(remaining);

        // Tick-tock every elapsed second
        const currentSecond = Math.floor(elapsed);
        if (currentSecond !== lastSecondTick && remaining > 0) {
          playTickSound(currentSecond % 2 === 0);
          lastSecondTick = currentSecond;
        }

        // Color shift ring near completion (under 5 seconds)
        if (remaining <= 5) {
          timerRingContainer.classList.add('danger');
          progressFill.style.stroke = 'var(--accent-danger)';
        } else {
          timerRingContainer.classList.remove('danger');
          progressFill.style.stroke = 'url(#timer-gradient)';
        }

        if (remaining <= 0) {
          stopTimer('success', targetDuration);
        }
      }, 100);

    } else {
      // Secret / Bomb mode
      timerRingContainer.classList.add('secret-ticking');
      timerStatus.textContent = '¡Peligro!';
      timerIcon.textContent = '💣';
      timerTime.textContent = '??:??';
      progressFill.style.stroke = 'var(--accent-danger)';

      // Animation loop for pulsing progress ring rotation
      let rotation = 0;
      function animateSecretRing() {
        if (!isRunning) return;
        rotation = (rotation + 1) % 360;
        progressFill.style.transform = `rotate(${rotation}deg)`;
        progressFill.style.transformOrigin = 'center';
        
        // Pulsing strokeDashoffset
        const elapsed = (Date.now() - startTime) / 1000;
        const ratio = Math.min(1, elapsed / targetDuration);
        const pulseFrequency = 2 + ratio * 8; // Accelerates pulse frequency
        const offset = 150 + Math.sin(Date.now() / 1000 * pulseFrequency * Math.PI) * 100;
        progressFill.style.strokeDashoffset = offset.toFixed(1);

        window.activeAnimationLoop = requestAnimationFrame(animateSecretRing);
      }
      window.activeAnimationLoop = requestAnimationFrame(animateSecretRing);

      // Accelerating recursive scheduler for ticks
      let lastTickType = true;
      function scheduleNextSecretTick() {
        if (!isRunning) return;

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= targetDuration) {
          stopTimer('exploded', targetDuration);
          return;
        }

        playTickSound(lastTickType);
        lastTickType = !lastTickType;

        // Exponential delay scaling from 1000ms down to 100ms
        const ratio = elapsed / targetDuration;
        const delay = Math.max(90, 1000 * Math.pow(0.08, ratio));

        window.activeTickTimeout = setTimeout(scheduleNextSecretTick, delay);
      }
      
      scheduleNextSecretTick();
    }
  }

  btnStart.addEventListener('click', startTimer);

  // Initialize
  updateSliderLabels();
  renderHistory();
}

// Bind to loads and transitions
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTemporizador);
} else {
  initTemporizador();
}
document.addEventListener('astro:page-load', initTemporizador);
