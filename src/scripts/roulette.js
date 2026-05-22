// ==========================================================
// SISTEMA DE CONFETTI NATIVO EN CANVAS
// ==========================================================
class ConfettiManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.active = false;
    this.animationId = null;
  }

  start() {
    this.active = true;
    this.particles = [];
    this.resize();

    // Paleta de colores festivos acorde a la marca
    const colors = ['#00e5ff', '#b366ff', '#f43f5e', '#fb7185', '#34d399', '#fbbf24', '#a78bfa', '#66f0ff'];

    // Crear partículas
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
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

function initRoulette() {
  // Elementos del DOM
  const canvas = document.getElementById('roulette-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const textarea = document.getElementById('options-input');
  const spinButton = document.getElementById('spin-button');
  const wheelPointer = document.getElementById('wheel-pointer');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const clearBtn = document.getElementById('clear-btn');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const focusToggleBtn = document.getElementById('focus-toggle-btn');

  const winnerModal = document.getElementById('winner-modal');
  const winnerDisplay = document.getElementById('winner-display');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const srAnnouncer = document.getElementById('sr-announcer');
  const confettiCanvas = document.getElementById('confetti-canvas');

  const tabEdit = document.getElementById('tab-edit');
  const tabManage = document.getElementById('tab-manage');
  const tabEditContent = document.getElementById('tab-edit-content');
  const tabManageContent = document.getElementById('tab-manage-content');
  const checklistContainer = document.getElementById('options-checklist-container');
  const activateAllBtn = document.getElementById('activate-all-btn');
  const activeCountSpan = document.getElementById('active-count');
  const totalCountSpan = document.getElementById('total-count');
  const wheelTitleText = document.getElementById('wheel-title-text');
  const editTitleBtn = document.getElementById('edit-title-btn');

  if (!textarea || !spinButton || !wheelPointer || !winnerModal) return;

  // Instancia del gestor de confeti
  const confetti = new ConfettiManager(confettiCanvas);

  // Opciones por defecto si no existen en localStorage
  const DEFAULT_OPTIONS = [
    "Pizza 🍕",
    "Tacos 🌮",
    "Sushi 🍣",
    "Hamburguesa 🍔",
    "Ensalada 🥗",
    "Pasta 🍝"
  ];

  // Variables de Estado
  let allOptions = [];
  let disabledOptions = new Set();
  let options = [];
  let colors = [];
  let currentAngle = 0;   // Ángulo actual en radianes
  let spinVelocity = 0;   // Velocidad angular por frame
  let isSpinning = false;
  let lastTickSegmentIndex = -1;
  let pointerTilt = 0;    // Inclinación física del puntero

  // Sonido y Foco (Persistidos en localStorage)
  let soundEnabled = localStorage.getItem('ruleta_sound') !== 'false';
  let focusModeEnabled = localStorage.getItem('ruleta_focus') === 'true';

  // Audio Context perezoso (requisito de los navegadores modernos)
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Sonido de "tick" físico sintetizado con Web Audio API
  function playTickSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'triangle';

      // Pitch dinámico: los tics son más graves a menor velocidad (simula inercia)
      const speedFactor = Math.min(spinVelocity / 0.4, 1);
      const frequency = 250 + speedFactor * 320;

      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.035);

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.035);
    } catch (err) {
      console.warn('AudioContext bloqueado o no soportado:', err);
    }
  }

  // Arpegio de victoria sintético
  function playWinnerSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    try {
      const now = audioCtx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25]; // Do Mayor

      notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

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

  // Generar paleta de colores HSL con ángulo áureo (distribución óptima)
  function generateContrastColors(count) {
    colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 137.5) % 360;
      colors.push(`hsl(${hue}, 72%, 52%)`);
    }
  }

  // Truncar textos largos para no colisionar con el botón central
  function truncateText(text, maxWidth, canvasCtx) {
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

  // Dibujar la ruleta completa en el Canvas
  function drawRoulette() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.width / dpr;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 12;

    ctx.clearRect(0, 0, size, size);

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
      const startAngle = currentAngle + i * arc;
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
      ctx.fillStyle = '#ffffff';

      // Escalar fuente dinámicamente
      let fontSize = 16;
      if (options.length > 25) fontSize = 9;
      else if (options.length > 18) fontSize = 11;
      else if (options.length > 10) fontSize = 13;

      ctx.font = `bold ${fontSize}px Outfit, sans-serif`;

      const availableWidth = radius - 70;
      const text = truncateText(options[i], availableWidth, ctx);

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

  // Ajustar resolución del Canvas para pantallas Retina
  function resizeCanvas() {
    const parent = canvas.parentElement;
    if (!parent) return;
    
    // Limpiar estilos inline para permitir que el contenedor se encoja fluidamente
    canvas.style.width = '';
    canvas.style.height = '';

    const size = Math.floor(parent.getBoundingClientRect().width);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    drawRoulette();
  }

  // Sincronizar datos del textarea con el estado
  function updateFromTextarea() {
    const val = textarea.value;

    allOptions = val.split('\n')
                    .map(opt => opt.trim())
                    .filter(opt => opt.length > 0);

    // Limpiar opciones ocultas que ya no existen
    const currentAllOptionsSet = new Set(allOptions);
    for (const opt of disabledOptions) {
      if (!currentAllOptionsSet.has(opt)) {
        disabledOptions.delete(opt);
      }
    }

    // Filtrar opciones activas
    options = allOptions.filter(opt => !disabledOptions.has(opt));

    // Persistir en localStorage
    localStorage.setItem('ruleta_opciones', val);
    localStorage.setItem('ruleta_ocultas', JSON.stringify([...disabledOptions]));

    // Actualizar contadores
    if (activeCountSpan && totalCountSpan) {
      activeCountSpan.textContent = options.length;
      totalCountSpan.textContent = allOptions.length;
    }

    // Redibujar
    generateContrastColors(options.length);
    drawRoulette();
    spinButton.disabled = options.length === 0;
    renderChecklist();
  }

  // Renderizar la lista de casillas para ocultar/activar
  function renderChecklist() {
    if (!checklistContainer) return;
    checklistContainer.innerHTML = '';

    if (allOptions.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'manage-instruction';
      emptyMsg.textContent = 'No hay opciones en la lista. Agrega algunas en la pestaña de Texto.';
      checklistContainer.appendChild(emptyMsg);
      return;
    }

    allOptions.forEach((opt) => {
      const isEnabled = !disabledOptions.has(opt);

      const item = document.createElement('div');
      item.className = `checklist-item${isEnabled ? '' : ' disabled'}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isEnabled;
      checkbox.ariaLabel = `Habilitar o deshabilitar opción: ${opt}`;

      const label = document.createElement('span');
      label.textContent = opt;

      item.appendChild(checkbox);
      item.appendChild(label);

      item.addEventListener('click', (e) => {
        if (e.target === checkbox) return;
        checkbox.checked = !checkbox.checked;
        toggleOption(opt, checkbox.checked, item);
      });

      checkbox.addEventListener('change', () => {
        toggleOption(opt, checkbox.checked, item);
      });

      checklistContainer.appendChild(item);
    });
  }

  // Activar o desactivar una opción específica
  function toggleOption(opt, isEnabled, itemElement) {
    if (isEnabled) {
      disabledOptions.delete(opt);
      itemElement.classList.remove('disabled');
    } else {
      disabledOptions.add(opt);
      itemElement.classList.add('disabled');
    }

    options = allOptions.filter(o => !disabledOptions.has(o));
    localStorage.setItem('ruleta_ocultas', JSON.stringify([...disabledOptions]));

    if (activeCountSpan) activeCountSpan.textContent = options.length;

    generateContrastColors(options.length);
    drawRoulette();
    spinButton.disabled = options.length === 0;
  }

  // Edición interactiva del título de la ruleta
  function editTitle() {
    if (isSpinning) return;
    const currentTitle = wheelTitleText.textContent.trim();
    const newTitle = prompt("Ingrese el nuevo título de la ruleta:", currentTitle);
    if (newTitle !== null) {
      const trimmedTitle = newTitle.trim();
      const finalTitle = trimmedTitle || "Ruleta de Opciones";
      wheelTitleText.textContent = finalTitle;
      localStorage.setItem('ruleta_titulo', finalTitle);
    }
  }

  // Bucle de física de fricción para giro suave (60fps)
  function updateSpin() {
    if (!isSpinning) return;

    const friction = 0.984;
    currentAngle += spinVelocity;
    spinVelocity *= friction;

    // Detectar cambio de segmento para tick
    if (options.length > 0) {
      const arc = (2 * Math.PI) / options.length;
      const pointerAngle = 1.5 * Math.PI;

      const normalizedAngle = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const wheelAngleAtPointer = (pointerAngle - normalizedAngle + 4 * Math.PI) % (2 * Math.PI);
      const currentSegmentIndex = Math.floor(wheelAngleAtPointer / arc);

      if (currentSegmentIndex !== lastTickSegmentIndex) {
        playTickSound();
        pointerTilt = -18;
        lastTickSegmentIndex = currentSegmentIndex;
      }
    }

    // Amortiguación del puntero
    pointerTilt *= 0.85;
    wheelPointer.style.transform = `translateX(-50%) translateY(0) rotate(${pointerTilt}deg)`;

    drawRoulette();

    // Detenerse cuando la velocidad es insignificante
    if (spinVelocity < 0.0012) {
      isSpinning = false;
      spinButton.disabled = false;
      spinButton.textContent = 'GIRAR';

      wheelPointer.style.transform = `translateX(-50%) translateY(0) rotate(0deg)`;
      announceWinner();
    } else {
      requestAnimationFrame(updateSpin);
    }
  }

  // Iniciar el giro
  function startSpin() {
    if (isSpinning || options.length === 0) return;

    initAudio();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      currentAngle = Math.random() * 2 * Math.PI;
      drawRoulette();
      announceWinner();
      return;
    }

    isSpinning = true;
    spinButton.disabled = true;
    spinButton.textContent = 'GIRANDO';

    spinVelocity = 0.35 + Math.random() * 0.25;
    lastTickSegmentIndex = -1;

    requestAnimationFrame(updateSpin);
  }

  // Procesar y mostrar al ganador
  function announceWinner() {
    if (options.length === 0) return;

    const arc = (2 * Math.PI) / options.length;
    const pointerAngle = 1.5 * Math.PI;

    const normalizedAngle = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const wheelAngleAtPointer = (pointerAngle - normalizedAngle + 4 * Math.PI) % (2 * Math.PI);
    const winnerIndex = Math.floor(wheelAngleAtPointer / arc);

    const winner = options[winnerIndex];

    srAnnouncer.textContent = `Resultado del sorteo: ${winner}`;

    winnerDisplay.textContent = winner;
    winnerModal.classList.add('active');
    winnerModal.setAttribute('aria-hidden', 'false');

    confetti.start();
    playWinnerSound();
    modalCloseBtn.focus();
  }

  // Cerrar modal
  function closeModal() {
    winnerModal.classList.remove('active');
    winnerModal.setAttribute('aria-hidden', 'true');
    confetti.stop();
    spinButton.focus();
  }

  // Mezclar opciones (Fisher-Yates)
  function shuffleOptions() {
    if (isSpinning) return;
    const lines = textarea.value.split('\n').filter(opt => opt.trim().length > 0);

    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }

    textarea.value = lines.join('\n');
    updateFromTextarea();
    playTickSound();
  }

  // Limpiar toda la lista
  function clearOptions() {
    if (isSpinning) return;
    if (confirm('¿Estás seguro de que deseas vaciar la ruleta?')) {
      textarea.value = '';
      updateFromTextarea();
    }
  }

  // ==========================================================
  // CONFIGURACIÓN DE CONTROLES DE INTERFAZ
  // ==========================================================

  function initUIState() {
    // Estado de sonido
    if (soundEnabled) {
      soundToggleBtn.classList.remove('active');
      soundToggleBtn.querySelector('.btn-icon').textContent = '🔊';
      soundToggleBtn.setAttribute('aria-pressed', 'true');
    } else {
      soundToggleBtn.classList.add('active');
      soundToggleBtn.querySelector('.btn-icon').textContent = '🔇';
      soundToggleBtn.setAttribute('aria-pressed', 'false');
    }

    // Estado de Modo Foco
    if (focusModeEnabled) {
      document.body.classList.add('focus-mode-active');
      focusToggleBtn.classList.add('active');
      focusToggleBtn.setAttribute('aria-pressed', 'true');
    } else {
      document.body.classList.remove('focus-mode-active');
      focusToggleBtn.classList.remove('active');
      focusToggleBtn.setAttribute('aria-pressed', 'false');
    }
  }

  // Toggle de Sonido
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('ruleta_sound', soundEnabled);
    initUIState();
    if (soundEnabled) playTickSound();
  });

  // Toggle de Modo Foco
  focusToggleBtn.addEventListener('click', () => {
    focusModeEnabled = !focusModeEnabled;
    localStorage.setItem('ruleta_focus', focusModeEnabled);
    initUIState();
    resizeCanvas();
  });

  // Cambio de pestañas
  tabEdit.addEventListener('click', () => {
    if (isSpinning) return;
    tabEdit.classList.add('active');
    tabEdit.setAttribute('aria-selected', 'true');
    tabManage.classList.remove('active');
    tabManage.setAttribute('aria-selected', 'false');
    tabEditContent.classList.remove('hidden');
    tabManageContent.classList.add('hidden');
  });

  tabManage.addEventListener('click', () => {
    if (isSpinning) return;
    tabManage.classList.add('active');
    tabManage.setAttribute('aria-selected', 'true');
    tabEdit.classList.remove('active');
    tabEdit.setAttribute('aria-selected', 'false');
    tabManageContent.classList.remove('hidden');
    tabEditContent.classList.add('hidden');
    renderChecklist();
  });

  // Edición de título
  if (wheelTitleText) {
    wheelTitleText.addEventListener('click', editTitle);
  }
  if (editTitleBtn) {
    editTitleBtn.addEventListener('click', editTitle);
  }

  // ==========================================================
  // CONTROLADORES DE EVENTOS
  // ==========================================================

  textarea.addEventListener('input', updateFromTextarea);
  spinButton.addEventListener('click', startSpin);
  shuffleBtn.addEventListener('click', shuffleOptions);
  clearBtn.addEventListener('click', clearOptions);

  // Activar Todas las opciones ocultas
  if (activateAllBtn) {
    activateAllBtn.addEventListener('click', () => {
      if (isSpinning || disabledOptions.size === 0) return;
      disabledOptions.clear();
      options = [...allOptions];
      localStorage.setItem('ruleta_ocultas', JSON.stringify([]));

      if (activeCountSpan) activeCountSpan.textContent = options.length;

      generateContrastColors(options.length);
      drawRoulette();
      spinButton.disabled = options.length === 0;
      renderChecklist();
    });
  }

  // Modal
  modalCloseBtn.addEventListener('click', closeModal);

  // Cerrar modal con Esc
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && winnerModal.classList.contains('active')) {
      closeModal();
    }
  });

  // Redimensionado
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (confetti.active) confetti.resize();
  });

  // Cargar título de la ruleta
  const storedTitle = localStorage.getItem('ruleta_titulo');
  if (storedTitle !== null && wheelTitleText) {
    wheelTitleText.textContent = storedTitle;
  } else if (wheelTitleText) {
    wheelTitleText.textContent = "Ruleta de Opciones";
  }

  // Cargar opciones ocultas
  const storedOcultas = localStorage.getItem('ruleta_ocultas');
  if (storedOcultas !== null) {
    try {
      const parsed = JSON.parse(storedOcultas);
      disabledOptions = new Set(parsed);
    } catch (e) {
      console.error("Error al parsear ruleta_ocultas:", e);
      disabledOptions = new Set();
    }
  }

  // Cargar lista desde localStorage o por defecto
  const stored = localStorage.getItem('ruleta_opciones');
  if (stored !== null) {
    textarea.value = stored;
  } else {
    textarea.value = DEFAULT_OPTIONS.join('\n');
  }

  initUIState();
  updateFromTextarea();
  resizeCanvas();

  // Retardo para correcta carga del canvas en dispositivos lentos
  setTimeout(resizeCanvas, 200);
}

// Initialise on load or transitions
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoulette);
} else {
  initRoulette();
}
document.addEventListener('astro:page-load', initRoulette);
