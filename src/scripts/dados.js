// ==========================================================
// LANZAR DADOS — LÓGICA DE JUEGO & FÍSICAS DE GIRO
// ==========================================================

function initDados() {
  const diceContainer = document.getElementById('dice-container');
  const btnRoll = document.getElementById('btn-spin');
  const resultDisplay = document.getElementById('result-display');
  const diceCountButtons = document.querySelectorAll('#dice-count-selector .selector-btn');
  const themeButtons = document.querySelectorAll('#theme-selector .selector-btn');
  const historyList = document.getElementById('history-list');
  const btnClear = document.getElementById('btn-clear');
  const shakeBtn = document.getElementById('shake-permission-btn');
  const toast = document.getElementById('toast-message');

  if (!diceContainer || !btnRoll || !resultDisplay) return;

  let currentDiceCount = parseInt(localStorage.getItem('decidelo_dados_count')) || 1;
  let currentTheme = localStorage.getItem('decidelo_dados_theme') || 'casino';
  let isRolling = false;
  let launchHistory = [];

  // Rotaciones de los dados D6 para guardar estados sucesivos y evitar reseteos visuales abruptos
  let cubeRotations = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ];

  // Mapeo de ángulos de rotación para mostrar cada cara de un cubo D6 en el frente
  const targetAngles = {
    1: { x: 0, y: 0 },       // Cara 1: Frente
    2: { x: 0, y: 180 },     // Cara 2: Atrás
    3: { x: 0, y: 270 },     // Cara 3: Derecha (rotar -90 = 270)
    4: { x: 0, y: 90 },      // Cara 4: Izquierda
    5: { x: 270, y: 0 },     // Cara 5: Arriba (rotar -90 = 270)
    6: { x: 90, y: 0 }       // Cara 6: Abajo
  };

  // Sintetizador Web Audio API
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playRollSound(numDice) {
    try {
      initAudio();
      const now = audioCtx.currentTime;
      
      // Clics y traqueteos aleatorios simulando dados rebotando en el vaso o mesa
      const clatterCount = 4 + numDice * 3;
      for (let i = 0; i < clatterCount; i++) {
        const timeOffset = Math.random() * 1.1; // distribuidos en los primeros 1.1 segundos
        const pitch = 0.8 + Math.random() * 0.4;
        playClatter(now + timeOffset, pitch);
      }
      
      // Sonidos individuales de caída de cada dado staggered
      for (let i = 0; i < numDice; i++) {
        const landTime = now + 1.6 + (i * 0.1);
        playLandSound(landTime, 0.9 + (i * 0.08));
      }
    } catch (e) {
      console.warn("Audio Context bloqueado o no soportado en este navegador.");
    }
  }

  function playClatter(time, pitch) {
    if (!audioCtx) return;
    // Tono agudo metálico/plástico
    const oscHigh = audioCtx.createOscillator();
    const gainHigh = audioCtx.createGain();
    oscHigh.type = 'triangle';
    oscHigh.frequency.setValueAtTime(950 * pitch + (Math.random() - 0.5) * 200, time);
    
    gainHigh.gain.setValueAtTime(0.04, time);
    gainHigh.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
    
    oscHigh.connect(gainHigh);
    gainHigh.connect(audioCtx.destination);
    
    oscHigh.start(time);
    oscHigh.stop(time + 0.025);

    // Thud sordo de fondo
    const oscLow = audioCtx.createOscillator();
    const gainLow = audioCtx.createGain();
    oscLow.type = 'sine';
    oscLow.frequency.setValueAtTime(130 * pitch, time);
    
    gainLow.gain.setValueAtTime(0.07, time);
    gainLow.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    
    oscLow.connect(gainLow);
    gainLow.connect(audioCtx.destination);
    
    oscLow.start(time);
    oscLow.stop(time + 0.04);
  }

  function playLandSound(time, pitch) {
    if (!audioCtx) return;
    // Thud fuerte
    const oscThud = audioCtx.createOscillator();
    const gainThud = audioCtx.createGain();
    oscThud.type = 'sine';
    oscThud.frequency.setValueAtTime(110 * pitch, time);
    oscThud.frequency.exponentialRampToValueAtTime(50, time + 0.1);
    
    gainThud.gain.setValueAtTime(0.25, time);
    gainThud.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    
    oscThud.connect(gainThud);
    gainThud.connect(audioCtx.destination);
    
    oscThud.start(time);
    oscThud.stop(time + 0.12);

    // Choque seco
    const oscClick = audioCtx.createOscillator();
    const gainClick = audioCtx.createGain();
    oscClick.type = 'triangle';
    oscClick.frequency.setValueAtTime(1100 * pitch, time);
    
    gainClick.gain.setValueAtTime(0.08, time);
    gainClick.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    
    oscClick.connect(gainClick);
    gainClick.connect(audioCtx.destination);
    
    oscClick.start(time);
    oscClick.stop(time + 0.04);
  }

  // Mostrar notificaciones Toast
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // Inicializar Historial
  function initHistory() {
    const stored = localStorage.getItem('decidelo_dados_history');
    if (stored) {
      try {
        launchHistory = JSON.parse(stored);
      } catch (e) {
        launchHistory = [];
      }
    }
    renderHistory();
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (launchHistory.length === 0) {
      historyList.innerHTML = '<span class="history-empty">Sin lanzamientos aún</span>';
      return;
    }
    
    launchHistory.slice().reverse().forEach(roll => {
      const item = document.createElement('div');
      item.className = 'history-item-row';
      
      const sumEl = document.createElement('span');
      sumEl.className = 'history-sum';
      sumEl.textContent = `Total: ${roll.sum}`;
      
      const detailsEl = document.createElement('span');
      detailsEl.className = 'history-details';
      detailsEl.textContent = `[${roll.details.join(', ')}]`;
      
      item.appendChild(sumEl);
      item.appendChild(detailsEl);
      historyList.appendChild(item);
    });
  }

  function addResultToHistory(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    const roll = {
      sum: sum,
      details: values
    };
    launchHistory.push(roll);
    if (launchHistory.length > 5) {
      launchHistory.shift();
    }
    localStorage.setItem('decidelo_dados_history', JSON.stringify(launchHistory));
    renderHistory();
  }

  // Dibujar los dados según el tema y cantidad
  function renderDice() {
    diceContainer.innerHTML = '';
    
    for (let i = 0; i < currentDiceCount; i++) {
      const scene = document.createElement('div');
      scene.className = 'dice-scene';
      
      if (currentTheme === 'dnd') {
        // Dado D20 (SVG Polígonos de Icosaedro)
        scene.innerHTML = `
          <div class="d20-wrapper" id="d20-wrapper-${i}">
            <svg viewBox="0 0 100 100" class="d20-svg">
              <defs>
                <linearGradient id="d20-grad-central-${i}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#00e5ff" />
                  <stop offset="100%" stop-color="#b366ff" />
                </linearGradient>
                <linearGradient id="d20-grad-side-${i}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#181335" />
                  <stop offset="100%" stop-color="#0d081f" />
                </linearGradient>
              </defs>
              <polygon points="50,32 76,68 24,68" fill="url(#d20-grad-central-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="50,2 91.6,26 50,32" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="50,2 50,32 8.4,26" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="8.4,26 50,32 24,68" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="8.4,26 24,68 8.4,74" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="24,68 8.4,74 50,98" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="76,68 50,98 91.6,74" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="76,68 91.6,74 91.6,26" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="50,32 76,68 91.6,26" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <polygon points="24,68 76,68 50,98" fill="url(#d20-grad-side-${i})" stroke="#0a0a0f" stroke-width="0.8" stroke-linejoin="round"/>
              <text x="50" y="59" class="d20-number" id="d20-number-${i}" text-anchor="middle" dominant-baseline="central">20</text>
            </svg>
          </div>
        `;
      } else {
        // Dado D6 (Cubo CSS 3D)
        const isYugioh = currentTheme === 'yugioh';
        const faceClass = isYugioh ? 'yugioh-face' : 'casino-face';
        const dotClass = isYugioh ? 'yugioh-dot' : 'casino-dot';
        
        const face6Content = isYugioh ? `
          <div class="eye-of-anubis">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15,50 Q50,20 85,50" stroke="#d4af37" stroke-width="5" stroke-linecap="round" fill="none"/>
              <path d="M15,50 Q50,80 85,50" stroke="#d4af37" stroke-width="5" stroke-linecap="round" fill="none"/>
              <circle cx="50" cy="50" r="14" fill="#201a15" stroke="#d4af37" stroke-width="4"/>
              <circle cx="46" cy="46" r="4" fill="#ffffff"/>
              <path d="M42,62 L38,82 Q34,88 28,78 L37,63" stroke="#d4af37" stroke-width="4" stroke-linecap="round" fill="none"/>
              <path d="M60,62 Q72,74 80,66" stroke="#d4af37" stroke-width="4" stroke-linecap="round" fill="none"/>
            </svg>
          </div>
        ` : `
          <div class="dot dot-top-left ${dotClass}"></div>
          <div class="dot dot-top-right ${dotClass}"></div>
          <div class="dot dot-mid-left ${dotClass}"></div>
          <div class="dot dot-mid-right ${dotClass}"></div>
          <div class="dot dot-bot-left ${dotClass}"></div>
          <div class="dot dot-bot-right ${dotClass}"></div>
        `;
        
        scene.innerHTML = `
          <div class="dice-cube" id="die-${i}">
            <div class="face front ${faceClass}">
              <div class="dot dot-center ${dotClass}"></div>
            </div>
            <div class="face back ${faceClass}">
              <div class="dot dot-top-left ${dotClass}"></div>
              <div class="dot dot-bot-right ${dotClass}"></div>
            </div>
            <div class="face right ${faceClass}">
              <div class="dot dot-top-left ${dotClass}"></div>
              <div class="dot dot-center ${dotClass}"></div>
              <div class="dot dot-bot-right ${dotClass}"></div>
            </div>
            <div class="face left ${faceClass}">
              <div class="dot dot-top-left ${dotClass}"></div>
              <div class="dot dot-top-right ${dotClass}"></div>
              <div class="dot dot-bot-left ${dotClass}"></div>
              <div class="dot dot-bot-right ${dotClass}"></div>
            </div>
            <div class="face top ${faceClass}">
              <div class="dot dot-top-left ${dotClass}"></div>
              <div class="dot dot-top-right ${dotClass}"></div>
              <div class="dot dot-center ${dotClass}"></div>
              <div class="dot dot-bot-left ${dotClass}"></div>
              <div class="dot dot-bot-right ${dotClass}"></div>
            </div>
            <div class="face bottom ${faceClass}">
              ${face6Content}
            </div>
          </div>
        `;
      }
      diceContainer.appendChild(scene);
    }
    resetCubeRotations();
  }

  function resetCubeRotations() {
    cubeRotations = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ];
    for (let i = 0; i < currentDiceCount; i++) {
      const die = document.getElementById(`die-${i}`);
      if (die) {
        die.style.transform = 'rotateX(0deg) rotateY(0deg)';
      }
    }
  }

  // Lanzar los dados
  function rollDice() {
    if (isRolling) return;
    isRolling = true;
    btnRoll.disabled = true;
    resultDisplay.classList.remove('show');

    // 1. Sonido sintético
    playRollSound(currentDiceCount);

    const rollDuration = 1600; // 1.6s
    const staggerDelay = 100; // 100ms stagger
    const finalValues = [];
    const maxValue = currentTheme === 'dnd' ? 20 : 6;

    // Calcular los resultados lógicos de cada dado
    for (let i = 0; i < currentDiceCount; i++) {
      const val = Math.floor(Math.random() * maxValue) + 1;
      finalValues.push(val);
    }

    // Arrays para guardar los intervalos de ciclado del D20
    const cyclingIntervals = [];

    // Iniciar el cambio numérico ultra veloz para D20
    if (currentTheme === 'dnd') {
      for (let i = 0; i < currentDiceCount; i++) {
        const textEl = document.getElementById(`d20-number-${i}`);
        if (textEl) {
          const interval = setInterval(() => {
            textEl.textContent = Math.floor(Math.random() * 20) + 1;
          }, 50);
          cyclingIntervals.push(interval);
        }
      }
    }

    // Lanzar las animaciones físicas y giros 3D
    for (let i = 0; i < currentDiceCount; i++) {
      const val = finalValues[i];
      
      setTimeout(() => {
        if (currentTheme === 'dnd') {
          // D20 Animation
          const wrapper = document.getElementById(`d20-wrapper-${i}`);
          if (wrapper) {
            wrapper.classList.remove('rolling');
            void wrapper.offsetWidth; // Reflow
            wrapper.classList.add('rolling');
          }
        } else {
          // D6 Cubes 3D Rotations
          const die = document.getElementById(`die-${i}`);
          if (die) {
            const targetAngle = targetAngles[val];
            const spinsX = Math.floor(Math.random() * 3) + 4; // 4 a 6 vueltas completas
            const spinsY = Math.floor(Math.random() * 3) + 4;

            const currentModX = cubeRotations[i].x % 360;
            let nextX = cubeRotations[i].x + (spinsX * 360) + (targetAngle.x - currentModX);

            const currentModY = cubeRotations[i].y % 360;
            let nextY = cubeRotations[i].y + (spinsY * 360) + (targetAngle.y - currentModY);

            cubeRotations[i].x = nextX;
            cubeRotations[i].y = nextY;

            die.style.transform = `rotateX(${nextX}deg) rotateY(${nextY}deg)`;
          }
        }
      }, i * staggerDelay);
    }

    // Detener cada dado en tiempo diferido (staggered stop)
    for (let i = 0; i < currentDiceCount; i++) {
      const stopTime = rollDuration + (i * staggerDelay);
      
      setTimeout(() => {
        if (currentTheme === 'dnd') {
          clearInterval(cyclingIntervals[i]);
          const textEl = document.getElementById(`d20-number-${i}`);
          if (textEl) {
            textEl.textContent = finalValues[i];
          }
        }

        // Si es el último dado, calcular suma, pintar resultados y habilitar botón
        if (i === currentDiceCount - 1) {
          setTimeout(() => {
            showResults(finalValues);
            addResultToHistory(finalValues);
            isRolling = false;
            btnRoll.disabled = false;
          }, 100);
        }
      }, stopTime);
    }
  }

  function showResults(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    resultDisplay.innerHTML = '';

    const sumEl = document.createElement('span');
    sumEl.className = 'sum-value';
    sumEl.textContent = `Suma: ${sum}`;
    resultDisplay.appendChild(sumEl);

    if (values.length > 1) {
      const detailsEl = document.createElement('span');
      detailsEl.className = 'individual-values';
      detailsEl.textContent = `Valores: (${values.join(' + ')})`;
      resultDisplay.appendChild(detailsEl);
    }

    resultDisplay.classList.add('show');
  }

  // Sincronizar UI de selectores con el estado cargado
  function syncUISelectors() {
    diceCountButtons.forEach(btn => {
      if (parseInt(btn.getAttribute('data-count'), 10) === currentDiceCount) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    themeButtons.forEach(btn => {
      if (btn.getAttribute('data-theme') === currentTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Event listeners para los selectores de cantidad de dados
  diceCountButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRolling) return;
      currentDiceCount = parseInt(btn.getAttribute('data-count'), 10);
      localStorage.setItem('decidelo_dados_count', currentDiceCount);
      syncUISelectors();
      if (resultDisplay) resultDisplay.classList.remove('show');
      renderDice();
    });
  });

  // Event listeners para los selectores de temática
  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRolling) return;
      currentTheme = btn.getAttribute('data-theme');
      localStorage.setItem('decidelo_dados_theme', currentTheme);
      syncUISelectors();
      if (resultDisplay) resultDisplay.classList.remove('show');
      renderDice();
    });
  });

  // Event listener del botón Lanzar
  btnRoll.addEventListener('click', rollDice);

  // Borrar historial
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      launchHistory = [];
      localStorage.removeItem('decidelo_dados_history');
      renderHistory();
    });
  }

  // ====================================================================
  // CAPTURA DE MOVIMIENTO (SHAKE DETECTION)
  // ====================================================================
  let lastX = null, lastY = null, lastZ = null;
  let lastTime = 0;
  const shakeThreshold = 14; // Sensibilidad de agitación

  function handleMotionEvent(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const currentTime = Date.now();
    if ((currentTime - lastTime) > 100) {
      const diffTime = currentTime - lastTime;
      lastTime = currentTime;

      const x = acc.x;
      const y = acc.y;
      const z = acc.z;

      if (lastX !== null) {
        const delta = Math.abs(x + y + z - lastX - lastY - lastZ);
        const speed = (delta / diffTime) * 10000;
        
        if (speed > shakeThreshold * 100) {
          if (!isRolling) {
            rollDice();
          }
        }
      }

      lastX = x;
      lastY = y;
      lastZ = z;
    }
  }

  // Gestionar permisos para acelerómetro (Safari iOS) y activar sensor
  function requestShakePermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            window.addEventListener('devicemotion', handleMotionEvent);
            if (shakeBtn) shakeBtn.style.display = 'none';
            showToast("¡Giro por movimiento activado!");
          } else {
            showToast("Permiso de acelerómetro denegado.");
          }
        })
        .catch(err => {
          console.error(err);
          showToast("Error al activar acelerómetro.");
        });
    } else {
      // Dispositivos Android o navegadores antiguos que no requieren permisos
      window.addEventListener('devicemotion', handleMotionEvent);
      if (shakeBtn) shakeBtn.style.display = 'none';
      showToast("¡Giro por movimiento activado!");
    }
  }

  // Mostrar el botón de permisos si el navegador los requiere o soporta
  if (shakeBtn) {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      shakeBtn.style.display = 'inline-flex';
    } else if (typeof window.DeviceMotionEvent !== 'undefined') {
      shakeBtn.style.display = 'inline-flex';
    }
    shakeBtn.addEventListener('click', requestShakePermission);
  }

  // Iniciar
  syncUISelectors();
  renderDice();
  initHistory();
}

// Inicializar en carga o transiciones
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDados);
} else {
  initDados();
}
document.addEventListener('astro:page-load', initDados);
