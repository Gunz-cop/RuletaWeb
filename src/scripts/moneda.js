// ==========================================================
// LANZAR MONEDA — LÓGICA DE JUEGO & FÍSICAS DE GIRO
// ==========================================================

function initMoneda() {
  const coin = document.getElementById('coin');
  const coinWrapper = document.getElementById('coin-wrapper');
  const coinShadow = document.getElementById('coin-shadow');
  const btnSpin = document.getElementById('btn-spin');
  const resultDisplay = document.getElementById('result-display');
  const selectorButtons = document.querySelectorAll('#coin-selector .selector-btn');
  const historyList = document.getElementById('history-list');
  const btnClear = document.getElementById('btn-clear');

  if (!coin || !btnSpin || !resultDisplay) return;

  let currentRotationX = 0;
  let currentRotationY = 0;
  let isTossing = false;
  let currentStyle = localStorage.getItem('decidelo_moneda_style') || 'classic';
  let launchHistory = [];

  // Web Audio API Synthesizer (Efectos de sonido metálicos de alta calidad sin ficheros externos)
  let audioCtx = null;

  function playFlipSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      const now = audioCtx.currentTime;

      // Frecuencias inarmónicas para recrear un timbre metálico resonante
      const freqs = [880, 1100, 1500, 1850];
      
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        // Ligero desajuste aleatorio de frecuencia (detuning) para emular imperfecciones del metal
        osc.detune.setValueAtTime((Math.random() - 0.5) * 20, now);
        
        // Volumen inicial y decaimiento exponencial
        const initGain = idx === 0 ? 0.3 : 0.15;
        gain.gain.setValueAtTime(initGain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + 1.2);
      });

      // Oscilador de percusión de baja frecuencia para emular el golpe físico del pulgar
      const oscClick = audioCtx.createOscillator();
      const gainClick = audioCtx.createGain();
      oscClick.frequency.setValueAtTime(140, now);
      gainClick.gain.setValueAtTime(0.4, now);
      gainClick.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      
      oscClick.connect(gainClick);
      gainClick.connect(audioCtx.destination);
      
      oscClick.start(now);
      oscClick.stop(now + 0.08);

    } catch (e) {
      console.warn("La reproducción de audio fue bloqueada o no está soportada en el dispositivo.");
    }
  }

  function playLandSound() {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // Sonido de caída (Thud / Click metálico seco)
      const oscThud = audioCtx.createOscillator();
      const gainThud = audioCtx.createGain();
      oscThud.frequency.setValueAtTime(120, now);
      oscThud.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      
      gainThud.gain.setValueAtTime(0.35, now);
      gainThud.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      
      oscThud.connect(gainThud);
      gainThud.connect(audioCtx.destination);
      
      oscThud.start(now);
      oscThud.stop(now + 0.15);

      // Agudo metálico final del choque contra la superficie
      const oscRing = audioCtx.createOscillator();
      const gainRing = audioCtx.createGain();
      oscRing.frequency.setValueAtTime(1200, now);
      gainRing.gain.setValueAtTime(0.12, now);
      gainRing.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      
      oscRing.connect(gainRing);
      gainRing.connect(audioCtx.destination);
      
      oscRing.start(now);
      oscRing.stop(now + 0.06);

    } catch (e) {
      console.warn(e);
    }
  }

  // Inicializar historial desde LocalStorage
  function initHistory() {
    const stored = localStorage.getItem('decidelo_moneda_history');
    if (stored) {
      try {
        launchHistory = JSON.parse(stored);
      } catch (e) {
        launchHistory = [];
      }
    }
    renderHistory();
  }

  // Dibujar historial en la interfaz
  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (launchHistory.length === 0) {
      historyList.innerHTML = '<span class="history-empty">Sin lanzamientos aún</span>';
      return;
    }

    launchHistory.slice(-5).reverse().forEach(res => {
      const item = document.createElement('div');
      item.className = `history-item ${res.toLowerCase()}`;
      item.textContent = res === 'Cara' ? 'C' : 'X';
      item.title = res;
      historyList.appendChild(item);
    });
  }

  // Guardar resultado en historial
  function addResultToHistory(result) {
    launchHistory.push(result);
    if (launchHistory.length > 10) {
      launchHistory.shift(); // Mantener un máximo para no saturar memoria
    }
    localStorage.setItem('decidelo_moneda_history', JSON.stringify(launchHistory));
    renderHistory();
  }

  // Configurar estilo inicial de la moneda
  function setCoinStyle(style) {
    if (isTossing) return;
    
    // Quitar activo de todos y poner en el indicado
    selectorButtons.forEach(btn => {
      if (btn.getAttribute('data-style') === style) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Cambiar clases en la moneda
    coin.className = `coin ${style}`;
    currentStyle = style;
    localStorage.setItem('decidelo_moneda_style', style);

    // Resetear visualización de resultado y posición a reposo
    if (resultDisplay) resultDisplay.classList.remove('show');
    currentRotationX = 0;
    currentRotationY = 0;
    coin.style.transform = `rotateX(0deg) rotateY(0deg)`;
  }

  // Cambiar estilo visual de la moneda por clicks en botones
  selectorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const style = btn.getAttribute('data-style');
      setCoinStyle(style);
    });
  });

  // Lógica de lanzamiento al pulsar LANZAR o la moneda misma
  function randomUnit() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] / 4294967296;
    }
    return Math.random();
  }

  function launchCoin() {
    if (isTossing) return;

    isTossing = true;
    btnSpin.disabled = true;
    if (resultDisplay) resultDisplay.classList.remove('show');

    // 1. Reproducir sonido metálico del lanzamiento
    playFlipSound();

    // 2. Añadir clases CSS de lanzamiento físico (Animación vertical y sombras)
    if (coinWrapper) coinWrapper.classList.add('tossing');
    if (coinShadow) coinShadow.classList.add('tossing');

    // 3. Decidir aleatoriamente (50% de probabilidad)
    const result = randomUnit() < 0.5 ? 'Cara' : 'Cruz';

    // 4. Calcular los giros 3D aleatorios acumulativos
    // Generamos entre 5 y 9 vueltas completas sobre el eje X e Y para dar sensación caótica
    const spinsX = Math.floor(randomUnit() * 4) + 6; // 6 a 9 giros
    const spinsY = Math.floor(randomUnit() * 4) + 6; // 6 a 9 giros

    // Cara (C) finaliza en un múltiplo de 360° en el eje Y (0, 360, 720...)
    // Cruz (X) finaliza en un múltiplo impar de 180° en el eje Y (180, 540, 900...)
    const targetModY = (result === 'Cruz') ? 180 : 0;
    const currentModY = currentRotationY % 360;
    
    // Ajustamos targetY de modo que targetY % 360 sea exactamente targetModY
    // y que gire hacia adelante por lo menos spinsY * 360 grados
    let targetY = currentRotationY + (spinsY * 360) + (targetModY - currentModY);
    
    // Garantizar que la rotación en X termine exactamente alineada plana (múltiplo de 360°)
    const currentModX = currentRotationX % 360;
    let targetX = currentRotationX + (spinsX * 360) - currentModX;

    // Actualizar valores de rotación actuales
    currentRotationX = targetX;
    currentRotationY = targetY;

    // Aplicar transformación 3D
    coin.style.transform = `rotateX(${targetX}deg) rotateY(${targetY}deg)`;

    // 5. Al terminar la animación de giro (3 segundos = 3000ms)
    setTimeout(() => {
      // Detener animación de salto
      if (coinWrapper) coinWrapper.classList.remove('tossing');
      if (coinShadow) coinShadow.classList.remove('tossing');

      // Reproducir sonido metálico de parada
      playLandSound();

      // Mostrar el resultado final con animación de entrada usando textContent
      if (resultDisplay) {
        resultDisplay.innerHTML = '';
        const span = document.createElement('span');
        span.className = result === 'Cara' ? 'cyan' : 'purple';
        span.textContent = result === 'Cara' ? '¡Ha salido CARA!' : '¡Ha salido CRUZ!';
        resultDisplay.appendChild(span);
        resultDisplay.classList.add('show');
      }

      // Agregar al historial
      addResultToHistory(result);

      // Desbloquear controles
      isTossing = false;
      btnSpin.disabled = false;

    }, 3000);
  }

  // Event listeners de lanzamiento
  btnSpin.addEventListener('click', launchCoin);
  coin.addEventListener('click', launchCoin);

  // Borrar historial
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      launchHistory = [];
      localStorage.removeItem('decidelo_moneda_history');
      renderHistory();
    });
  }

  // Iniciar
  setCoinStyle(currentStyle);
  initHistory();
}

// Inicializar en carga o transiciones
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMoneda);
} else {
  initMoneda();
}
document.addEventListener('astro:page-load', initMoneda);
