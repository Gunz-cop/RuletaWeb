// ==========================================================
// CONTROLADOR DE LA RULETA
// ==========================================================
// Este archivo es el punto de entrada que referencia index.astro
// (`<script src="../scripts/roulette.js">`). Astro procesa los <script>
// locales como módulos y los agrupa en el build, así que separar la lógica
// en src/scripts/roulette/*.js no añade peticiones de red: sigue siendo un
// único archivo JS en producción, solo que la fuente queda organizada por
// responsabilidad en vez de un archivo de 750 líneas.
import { ConfettiManager } from './roulette/confetti.js';
import { RouletteAudio } from './roulette/audio.js';
import { WheelRenderer } from './roulette/wheel-canvas.js';
import { readStorage, writeStorage } from './roulette/storage.js';
import { randomFloat, shuffleInPlace } from './roulette/random.js';

// Con View Transitions, Astro navega sin recargar el documento y dispara
// `astro:page-load` en cada llegada. Si initRoulette solo añadiera
// listeners sin quitar los de la vez anterior, cada navegación de ida y
// vuelta a la home duplicaría todos los handlers (dos ticks de sonido por
// giro, dos aperturas de modal, etc.). Guardamos la función de limpieza de
// la instancia anterior a nivel de módulo y la ejecutamos antes de crear
// la siguiente.
let cleanupPreviousInstance = null;

function initRoulette() {
  cleanupPreviousInstance?.();

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

  // AbortController: una señal para todos los listeners de esta instancia.
  // Abortarla los quita todos de una vez, sin tener que llevar la cuenta de
  // cada `removeEventListener` a mano.
  const abortController = new AbortController();
  const { signal } = abortController;

  const confetti = new ConfettiManager(confettiCanvas);
  const audio = new RouletteAudio();
  const wheel = new WheelRenderer(ctx);

  // Opciones por defecto si no existen en localStorage
  const DEFAULT_OPTIONS = ['Pizza 🍕', 'Tacos 🌮', 'Sushi 🍣', 'Hamburguesa 🍔', 'Ensalada 🥗', 'Pasta 🍝'];

  // Variables de Estado
  let allOptions = [];
  // Identidad por ÍNDICE dentro de allOptions, no por texto: con un Set de
  // strings, dos opciones escritas igual ("Sí" y "Sí") se desactivaban
  // juntas y los contadores de activas/total mentían. El índice distingue
  // cada línea aunque el texto se repita.
  let disabledIndices = new Set();
  let options = [];
  let colors = [];
  let currentAngle = 0; // Ángulo actual en radianes
  let spinVelocity = 0; // Velocidad angular por frame
  let isSpinning = false;
  let lastTickSegmentIndex = -1;
  let pointerTilt = 0; // Inclinación física del puntero
  let spinRafId = null;
  // Marca que updateFromTextarea() quiso repintar/renderizar el checklist
  // mientras había un giro en curso; se aplica en cuanto termina (ver
  // updateSpin).
  let pendingResync = false;

  // Sonido y Foco (Persistidos en localStorage)
  let soundEnabled = readStorage('ruleta_sound') !== 'false';
  let focusModeEnabled = readStorage('ruleta_focus') === 'true';
  audio.enabled = soundEnabled;

  // Generar paleta de colores HSL con ángulo áureo (distribución óptima).
  // El hue sigue rotando las 360°: es lo que garantiza que dos gajos
  // vecinos (índices consecutivos) queden siempre a ~137.5° uno del otro
  // en el círculo cromático, muy por encima de lo que el ojo confunde,
  // pase lo que pase con N. Restringir el hue a una franja cálida (todo
  // terracota) rompería esa garantía con 15-20 opciones: dentro de un
  // arco de 60-90° el golden angle ya no tiene sitio para separar tantos
  // gajos y varios acaban leyendo como "el mismo naranja". Lo que sí
  // cambia respecto al arcade neón es la saturación (72%→58%) y la
  // luminosidad (52%→46%): menos flúor, más tinta con color, en línea
  // con el resto del sistema editorial. El contraste del texto ya no se
  // fija en blanco a ciegas — wheel-canvas.js lo calcula por gajo, ver
  // ese archivo — así que ninguna combinación de hue queda con texto
  // ilegible.
  function generateContrastColors(count) {
    colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 137.5) % 360;
      colors.push(`hsl(${hue}, 58%, 46%)`);
    }
  }

  function drawRoulette() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.width / dpr;
    wheel.render(size, dpr, options, colors, currentAngle);
  }

  // Único punto que recalcula "opciones activas + colores + repintado +
  // estado del botón" tras cualquier cambio de datos (texto, checklist o
  // "activar todas"). Antes este mismo bloque de cuatro líneas estaba
  // copiado tres veces y podía divergir con el tiempo.
  function syncWheelState() {
    options = allOptions.filter((_, i) => !disabledIndices.has(i));
    if (activeCountSpan) activeCountSpan.textContent = String(options.length);
    if (totalCountSpan) totalCountSpan.textContent = String(allOptions.length);
    generateContrastColors(options.length);
    drawRoulette();
    spinButton.disabled = options.length === 0;
  }

  function persistOptionsState(rawTextareaValue) {
    writeStorage('ruleta_opciones', rawTextareaValue);
    // Formato v2: array de índices, no de strings — ver migración al cargar.
    writeStorage('ruleta_ocultas', JSON.stringify({ v: 2, indices: [...disabledIndices] }));
  }

  // Ajustar resolución del Canvas para pantallas Retina
  // `explicitWidth` llega del ResizeObserver (su `entry.contentRect.width`)
  // cuando lo dispara él; se omite en las llamadas directas (carga inicial,
  // toggle de modo foco), que sí necesitan medir el contenedor a mano.
  function resizeCanvas(explicitWidth) {
    const parent = canvas.parentElement;
    if (!parent) return;

    let size;
    if (typeof explicitWidth === 'number') {
      // El observer ya trae el ancho del propio contenedor observado
      // (`contentRect`, sin bordes/padding): no hace falta tocar el estilo
      // del canvas ni volver a medir, que es justo el patrón (leer layout
      // -> escribir estilo -> layout cambia) que puede producir un aviso de
      // "ResizeObserver loop completed with undelivered notifications".
      size = Math.floor(explicitWidth);
    } else {
      // Limpiar estilos inline antes de medir: si no, el ancho en px que
      // dejó el resize anterior puede impedir que el contenedor se encoja
      // (p. ej. al activar el modo foco), y mediríamos un valor que ya no
      // corresponde al layout real.
      canvas.style.width = '';
      canvas.style.height = '';
      size = Math.floor(parent.getBoundingClientRect().width);
    }
    if (size <= 0) return;
    const dpr = window.devicePixelRatio || 1;

    const pixelSize = Math.round(size * dpr);

    // Restaurar el tamaño en CSS siempre, incluso si el bitmap no cambia:
    // lo limpiamos arriba solo para medir el contenedor sin que el propio
    // canvas influyera en esa medición.
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    // Evita redimensionar (y por lo tanto borrar) el bitmap del canvas si
    // el tamaño efectivo no cambió: un ResizeObserver puede disparar por
    // cambios que no alteran el ancho final (p. ej. reflow del propio
    // contenido), y limpiar el bitmap sin necesidad perdía el dibujo actual
    // a mitad de un giro.
    if (canvas.width === pixelSize && canvas.height === pixelSize && canvas.dataset.dpr === String(dpr)) {
      return;
    }
    canvas.dataset.dpr = String(dpr);

    canvas.width = pixelSize;
    canvas.height = pixelSize;

    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    drawRoulette();
  }

  // Migra `ruleta_ocultas` de la forma antigua (array de strings, una por
  // texto oculto) a la nueva (array de índices). No podemos saber cuál de
  // varias líneas duplicadas quería ocultar la persona originalmente, así
  // que el único comportamiento que no le rompe la lista es desactivar
  // TODAS las líneas cuyo texto coincida con algo que ya tenía oculto —
  // exactamente lo que hacía el código viejo — y a partir de ahí cada
  // índice queda desacoplado del texto.
  function loadDisabledIndices(currentAllOptions) {
    const stored = readStorage('ruleta_ocultas');
    if (stored === null) return new Set();

    try {
      const parsed = JSON.parse(stored);

      if (parsed && typeof parsed === 'object' && parsed.v === 2 && Array.isArray(parsed.indices)) {
        return new Set(parsed.indices.filter((i) => Number.isInteger(i)));
      }

      if (Array.isArray(parsed)) {
        // Formato v1: strings ocultos.
        const hiddenTexts = new Set(parsed);
        const migrated = new Set();
        currentAllOptions.forEach((opt, i) => {
          if (hiddenTexts.has(opt)) migrated.add(i);
        });
        return migrated;
      }
    } catch (err) {
      console.error('Error al parsear ruleta_ocultas:', err);
    }
    return new Set();
  }

  // Sincronizar datos del textarea con el estado
  function updateFromTextarea() {
    const val = textarea.value;
    const previousAllOptions = allOptions;
    const previousDisabled = disabledIndices;

    allOptions = val
      .split('\n')
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);

    // Reasignar qué índices siguen ocultos. Primero se intenta la misma
    // posición (rápido y es el caso común: escribir en medio del texto sin
    // reordenar). Si la línea cambió de texto en esa posición -se insertó o
    // borró una línea por encima-, se busca ese mismo texto en la lista
    // nueva y se le traslada el estado oculto ahí: es lo que da identidad
    // estable por texto mientras se reordena, sin volver al bug original
    // (un Set de strings) porque cada índice viejo se empareja como mucho
    // con un índice nuevo -nunca se reusa uno ya asignado-, así que dos
    // opciones ocultas con el mismo texto no colapsan en una sola entrada.
    // Se procesa en orden ascendente de índice viejo para que el resultado
    // sea determinista con duplicados: el primero oculto se empareja con la
    // primera aparición libre, el segundo con la siguiente, etc.
    const usedNewIndices = new Set();
    disabledIndices = new Set();
    [...previousDisabled]
      .sort((a, b) => a - b)
      .forEach((oldIndex) => {
        const text = previousAllOptions[oldIndex];
        if (text === undefined) return;

        if (allOptions[oldIndex] === text && !usedNewIndices.has(oldIndex)) {
          disabledIndices.add(oldIndex);
          usedNewIndices.add(oldIndex);
          return;
        }

        const matchIndex = allOptions.findIndex((opt, idx) => opt === text && !usedNewIndices.has(idx));
        if (matchIndex !== -1) {
          disabledIndices.add(matchIndex);
          usedNewIndices.add(matchIndex);
        }
        // Si no hay ninguna aparición libre de ese texto, la opción
        // desapareció de la lista (se borró la línea) y simplemente se
        // deja de rastrear: no hay a dónde trasladar el estado oculto.
      });

    persistOptionsState(val);

    // Durante un giro, `options` tiene que quedarse congelado en lo que
    // estaba cuando arrancó: syncWheelState() reasigna `options` y vuelve a
    // habilitar `spinButton` a mitad de rotación, y el cálculo del ganador
    // (getSegmentIndexAtPointer) usa ese mismo array, así que cambiarlo bajo
    // los pies del giro puede hacer que el ganador anunciado ni siquiera
    // esté en la lista nueva. El texto se sigue guardando (líneas arriba);
    // solo se difiere repintar la rueda y el checklist hasta que termine.
    if (isSpinning) {
      pendingResync = true;
      return;
    }
    syncWheelState();
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

    allOptions.forEach((opt, index) => {
      const isEnabled = !disabledIndices.has(index);

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

      // Sin `{ signal }` a propósito: `checklistContainer.innerHTML = ''`
      // al inicio de renderChecklist() destruye estos elementos (y sus
      // listeners) en cada tecla del textarea al vaciar el contenedor, así
      // que atarlos al AbortController de la instancia entera solo
      // acumularía "abort algorithms" registrados en un signal que no se
      // aborta hasta salir de la página.
      item.addEventListener('click', (e) => {
        if (e.target === checkbox) return;
        checkbox.checked = !checkbox.checked;
        toggleOption(index, checkbox.checked, item);
      });

      checkbox.addEventListener('change', () => toggleOption(index, checkbox.checked, item));

      checklistContainer.appendChild(item);
    });
  }

  // Activar o desactivar una opción específica, por índice.
  function toggleOption(index, isEnabled, itemElement) {
    if (isEnabled) {
      disabledIndices.delete(index);
      itemElement.classList.remove('disabled');
    } else {
      disabledIndices.add(index);
      itemElement.classList.add('disabled');
    }

    persistOptionsState(textarea.value);
    syncWheelState();
  }

  // Edición interactiva del título de la ruleta
  function editTitle() {
    if (isSpinning) return;
    const currentTitle = wheelTitleText.textContent.trim();
    const newTitle = prompt('Ingrese el nuevo título de la ruleta:', currentTitle);
    if (newTitle !== null) {
      const trimmedTitle = newTitle.trim();
      const finalTitle = trimmedTitle || 'Ruleta de Opciones';
      wheelTitleText.textContent = finalTitle;
      writeStorage('ruleta_titulo', finalTitle);
    }
  }

  // Calcula, a partir del ángulo actual, qué segmento queda bajo el
  // puntero. Antes este cálculo estaba duplicado en updateSpin (para el
  // tick) y en announceWinner (para el resultado); ahora es la única
  // fuente de verdad para ambos.
  function getSegmentIndexAtPointer(angle) {
    const arc = (2 * Math.PI) / options.length;
    const pointerAngle = 1.5 * Math.PI;

    const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const wheelAngleAtPointer = (pointerAngle - normalizedAngle + 4 * Math.PI) % (2 * Math.PI);
    return Math.floor(wheelAngleAtPointer / arc);
  }

  // Bucle de física de fricción para giro suave (60fps)
  function updateSpin() {
    if (!isSpinning) return;

    const friction = 0.984;
    currentAngle += spinVelocity;
    spinVelocity *= friction;

    // Detectar cambio de segmento para tick
    if (options.length > 0) {
      const currentSegmentIndex = getSegmentIndexAtPointer(currentAngle);

      if (currentSegmentIndex !== lastTickSegmentIndex) {
        audio.playTick(spinVelocity);
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

      // Aplicar ahora el texto que se escribió mientras giraba: recién
      // termina el cálculo del ganador, así que ya no importa que
      // `options` cambie.
      if (pendingResync) {
        pendingResync = false;
        syncWheelState();
        renderChecklist();
      }
    } else {
      spinRafId = requestAnimationFrame(updateSpin);
    }
  }

  // Iniciar el giro
  function startSpin() {
    if (isSpinning || options.length === 0) return;

    audio.ensureContext();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      currentAngle = randomFloat() * 2 * Math.PI;
      drawRoulette();
      announceWinner();
      return;
    }

    isSpinning = true;
    spinButton.disabled = true;
    spinButton.textContent = 'GIRANDO';

    spinVelocity = 0.35 + randomFloat() * 0.25;
    lastTickSegmentIndex = -1;

    spinRafId = requestAnimationFrame(updateSpin);
  }

  // Procesar y mostrar al ganador
  function announceWinner() {
    if (options.length === 0) return;

    const winnerIndex = getSegmentIndexAtPointer(currentAngle);
    const winner = options[winnerIndex];

    srAnnouncer.textContent = `Resultado del sorteo: ${winner}`;

    winnerDisplay.textContent = winner;
    winnerModal.classList.add('active');
    winnerModal.setAttribute('aria-hidden', 'false');

    confetti.start();
    audio.playWinner();
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
    const lines = textarea.value.split('\n').filter((opt) => opt.trim().length > 0);

    shuffleInPlace(lines);

    textarea.value = lines.join('\n');
    updateFromTextarea();
    audio.playTick(spinVelocity);
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
  soundToggleBtn.addEventListener(
    'click',
    () => {
      soundEnabled = !soundEnabled;
      audio.enabled = soundEnabled;
      writeStorage('ruleta_sound', String(soundEnabled));
      initUIState();
      if (soundEnabled) audio.playTick(spinVelocity);
    },
    { signal }
  );

  // Toggle de Modo Foco
  focusToggleBtn.addEventListener(
    'click',
    () => {
      focusModeEnabled = !focusModeEnabled;
      writeStorage('ruleta_focus', String(focusModeEnabled));
      initUIState();
      resizeCanvas();
    },
    { signal }
  );

  // Cambio de pestañas
  tabEdit.addEventListener(
    'click',
    () => {
      if (isSpinning) return;
      tabEdit.classList.add('active');
      tabEdit.setAttribute('aria-selected', 'true');
      tabManage.classList.remove('active');
      tabManage.setAttribute('aria-selected', 'false');
      tabEditContent.classList.remove('hidden');
      tabManageContent.classList.add('hidden');
    },
    { signal }
  );

  tabManage.addEventListener(
    'click',
    () => {
      if (isSpinning) return;
      tabManage.classList.add('active');
      tabManage.setAttribute('aria-selected', 'true');
      tabEdit.classList.remove('active');
      tabEdit.setAttribute('aria-selected', 'false');
      tabManageContent.classList.remove('hidden');
      tabEditContent.classList.add('hidden');
      renderChecklist();
    },
    { signal }
  );

  // Edición de título
  if (wheelTitleText) {
    wheelTitleText.addEventListener('click', editTitle, { signal });
  }
  if (editTitleBtn) {
    editTitleBtn.addEventListener('click', editTitle, { signal });
  }

  // ==========================================================
  // CONTROLADORES DE EVENTOS
  // ==========================================================

  textarea.addEventListener('input', updateFromTextarea, { signal });
  spinButton.addEventListener('click', startSpin, { signal });
  shuffleBtn.addEventListener('click', shuffleOptions, { signal });
  clearBtn.addEventListener('click', clearOptions, { signal });

  // Activar Todas las opciones ocultas
  if (activateAllBtn) {
    activateAllBtn.addEventListener(
      'click',
      () => {
        if (isSpinning || disabledIndices.size === 0) return;
        disabledIndices.clear();
        persistOptionsState(textarea.value);
        syncWheelState();
        renderChecklist();
      },
      { signal }
    );
  }

  // Modal
  modalCloseBtn.addEventListener('click', closeModal, { signal });

  // Cerrar modal con Esc
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && winnerModal.classList.contains('active')) {
        closeModal();
      }
    },
    { signal }
  );

  // Redimensionado: un ResizeObserver sobre el contenedor reacciona a
  // cambios de layout reales (modo foco, breakpoints) sin el setTimeout de
  // 200ms que había antes a modo de parche, y sin depender del evento
  // `resize` de window, que no dispara si lo que cambia es el contenedor
  // (p. ej. al activar el modo foco) y no la ventana.
  const canvasContainer = canvas.parentElement;
  let resizeObserver = null;
  if (canvasContainer && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      resizeCanvas(entry?.contentRect.width);
    });
    resizeObserver.observe(canvasContainer);
  }
  // El confeti sigue el tamaño de la ventana completa (se pinta sobre
  // toda la pantalla), así que a diferencia de la rueda sí le sirve el
  // evento `resize` de window.
  window.addEventListener(
    'resize',
    () => {
      if (confetti.active) confetti.resize();
    },
    { signal }
  );

  // Cargar título de la ruleta
  const storedTitle = readStorage('ruleta_titulo');
  if (storedTitle !== null && wheelTitleText) {
    wheelTitleText.textContent = storedTitle;
  } else if (wheelTitleText) {
    wheelTitleText.textContent = 'Ruleta de Opciones';
  }

  // Cargar lista desde localStorage o por defecto
  const stored = readStorage('ruleta_opciones');
  if (stored !== null) {
    textarea.value = stored;
  } else {
    textarea.value = DEFAULT_OPTIONS.join('\n');
  }

  // allOptions debe existir antes de migrar los índices ocultos, porque la
  // migración desde el formato v1 (strings) necesita saber en qué posición
  // cae cada texto oculto.
  allOptions = textarea.value
    .split('\n')
    .map((opt) => opt.trim())
    .filter((opt) => opt.length > 0);
  disabledIndices = loadDisabledIndices(allOptions);

  initUIState();
  syncWheelState();
  renderChecklist();
  resizeCanvas();

  // Función de limpieza de esta instancia: cancela el giro en curso, para
  // el confeti y quita todos los listeners (DOM y window) registrados con
  // `signal`, incluido el que cierra el modal con Esc.
  cleanupPreviousInstance = () => {
    abortController.abort();
    resizeObserver?.disconnect();
    if (spinRafId !== null) cancelAnimationFrame(spinRafId);
    confetti.stop();
    audio.close();
  };
}

// Astro dispara `astro:before-swap` justo antes de reemplazar el DOM en una
// view transition: es el momento correcto para soltar listeners y RAF de la
// página que se va, antes de que `astro:page-load` reinicialice la que
// entra.
document.addEventListener('astro:before-swap', () => cleanupPreviousInstance?.());

// Initialise on load or transitions
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoulette);
} else {
  initRoulette();
}
document.addEventListener('astro:page-load', initRoulette);
