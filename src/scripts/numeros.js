// ==========================================================
// GENERADOR DE NÚMEROS — LÓGICA Y ANIMACIONES
// ==========================================================

function initNumeros() {
  const minInput = document.getElementById('num-min');
  const maxInput = document.getElementById('num-max');
  const countInput = document.getElementById('num-count');
  const allowDuplicatesCheckbox = document.getElementById('num-duplicates');
  const btnGenerate = document.getElementById('btn-spin'); // Uses class .btn-spin
  const displayContainer = document.getElementById('number-display-container');
  const historyList = document.getElementById('history-list');
  const btnClear = document.getElementById('btn-clear');
  const toast = document.getElementById('toast-message');

  if (!minInput || !maxInput || !countInput || !btnGenerate || !displayContainer) return;

  let isRolling = false;
  let history = JSON.parse(localStorage.getItem('decidelo_numeros_history')) || [];
  let audioCtx = null;

  // Web Audio Synth
  function playTickSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      
      gain.gain.setValueAtTime(0.015, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Audio blocked
    }
  }

  function playWinSound() {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // Chord C5 - E5 - G5
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.05, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + 0.4);
      });
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

  function validateInputs() {
    const min = parseInt(minInput.value, 10);
    const max = parseInt(maxInput.value, 10);
    const count = parseInt(countInput.value, 10);
    const allowDuplicates = allowDuplicatesCheckbox ? allowDuplicatesCheckbox.checked : true;

    if (isNaN(min) || isNaN(max) || isNaN(count)) {
      showToast("Por favor, ingresa números válidos.");
      return false;
    }

    if (min > max) {
      showToast("El rango mínimo no puede ser mayor que el máximo.");
      return false;
    }

    if (count < 1) {
      showToast("Debes generar al menos 1 número.");
      return false;
    }

    if (count > 100) {
      showToast("El límite máximo de números a generar es 100.");
      return false;
    }

    const range = max - min + 1;
    if (!allowDuplicates && count > range) {
      showToast(`No puedes generar ${count} números sin repetir en un rango de ${range}.`);
      return false;
    }

    return true;
  }

  function generateNumbers() {
    if (isRolling) return;
    if (!validateInputs()) return;

    isRolling = true;
    btnGenerate.disabled = true;

    const min = parseInt(minInput.value, 10);
    const max = parseInt(maxInput.value, 10);
    const count = parseInt(countInput.value, 10);
    const allowDuplicates = allowDuplicatesCheckbox ? allowDuplicatesCheckbox.checked : true;

    // Calcular números finales
    const finalNumbers = [];
    if (allowDuplicates) {
      for (let i = 0; i < count; i++) {
        finalNumbers.push(Math.floor(Math.random() * (max - min + 1)) + min);
      }
    } else {
      // Rango sin repetir
      const pool = [];
      for (let i = min; i <= max; i++) {
        pool.push(i);
      }
      for (let i = 0; i < count; i++) {
        const randIdx = Math.floor(Math.random() * pool.length);
        finalNumbers.push(pool.splice(randIdx, 1)[0]);
      }
    }

    // Efecto de slot machine (animación de dígitos rápidos)
    let rollSteps = 20;
    let currentStep = 0;
    const intervalTime = 60; // ms

    const interval = setInterval(() => {
      currentStep++;
      
      // Renderizar números aleatorios temporales para animación
      const tempNumbers = [];
      for (let i = 0; i < count; i++) {
        tempNumbers.push(Math.floor(Math.random() * (max - min + 1)) + min);
      }
      renderDisplay(tempNumbers, true);
      playTickSound();

      if (currentStep >= rollSteps) {
        clearInterval(interval);
        
        // Renderizar números finales
        renderDisplay(finalNumbers, false);
        playWinSound();

        // Guardar en el historial
        saveToHistory(finalNumbers);

        isRolling = false;
        btnGenerate.disabled = false;
      }
    }, intervalTime);
  }

  function renderDisplay(arr, isAnimating) {
    displayContainer.innerHTML = '';
    
    // Si hay muchos números, reducir tamaño para que no desborde
    let sizeClass = 'large';
    if (arr.length > 20) {
      sizeClass = 'tiny';
    } else if (arr.length > 8) {
      sizeClass = 'small';
    } else if (arr.length > 3) {
      sizeClass = 'medium';
    }

    arr.forEach(num => {
      const numSpan = document.createElement('span');
      numSpan.className = `number-badge ${sizeClass} ${isAnimating ? 'rolling' : 'landed'}`;
      numSpan.textContent = num;
      displayContainer.appendChild(numSpan);
    });
  }

  function saveToHistory(arr) {
    const formatted = arr.join(', ');
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      value: formatted
    };
    
    history.unshift(entry);
    if (history.length > 10) history.pop();

    localStorage.setItem('decidelo_numeros_history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<span class="history-empty">Sin números generados aún</span>';
      return;
    }

    history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item-row';
      el.innerHTML = `
        <span class="history-time">${item.timestamp}</span>
        <span class="history-value">${item.value}</span>
      `;
      historyList.appendChild(el);
    });
  }

  // Clear history
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      history = [];
      localStorage.removeItem('decidelo_numeros_history');
      renderHistory();
    });
  }

  // Event listners
  btnGenerate.addEventListener('click', generateNumbers);

  // Iniciar
  renderHistory();
}

// Inicializar en carga o transiciones Astro
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNumeros);
} else {
  initNumeros();
}
document.addEventListener('astro:page-load', initNumeros);
