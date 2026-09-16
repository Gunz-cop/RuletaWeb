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
  const undoToast = document.getElementById('undo-toast');
  const undoToastMessage = document.getElementById('undo-toast-message');
  const undoToastBtn = document.getElementById('undo-toast-btn');
  const undoToastCloseBtn = document.getElementById('undo-toast-close');

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
  // Foto de las dos cosas que "Limpiar" borra, para poder restaurarlas con
  // "Deshacer": el texto y qué estaba oculto. Null cuando no hay nada que
  // deshacer (nunca se vació, ya se deshizo, expiró el aviso o el usuario
  // empezó a escribir algo nuevo -- ver invalidateClearUndo()).
  let pendingClearUndo = null;
  let undoToastTimer = null;

  // Sonido y Foco (Persistidos en localStorage)
  let soundEnabled = readStorage('ruleta_sound') !== 'false';
  let focusModeEnabled = readStorage('ruleta_focus') === 'true';
  audio.enabled = soundEnabled;

  // Paleta de la ruleta: arcoíris completo por ángulo áureo (137.5°, la
  // proporción que reparte puntos lo más lejos posible entre sí alrededor
  // de un círculo). El hue rota las 360° a propósito — no se restringe a
  // una franja cálida — porque es lo único que garantiza que dos gajos
  // vecinos (índices consecutivos) queden bien separados en el círculo
  // cromático para cualquier cantidad de opciones, incluidas las 15-20 que
  // caben en la rueda: una gama acotada (p. ej. todo terracota) se queda
  // sin sitio para tantos pasos distinguibles y varios gajos acaban
  // leyendo como "el mismo color". Saturación/luminosidad (58%/46%) están
  // bajadas respecto al arcade neón original (72%/52%) para que se sienta
  // menos flúor sin perder esa garantía de separación.
  //
  // El texto de cada gajo NO es blanco fijo: wheel-canvas.js
  // (colorTextoLegible) calcula la luminancia real de cada color y elige
  // blanco o negro según cuál dé más contraste. Con blanco fijo, un gajo en
  // la franja amarilla (hue≈60°) cae a ~1.46:1 — muy por debajo de AA — así
  // que el texto se volvía ilegible sin que nada lo avisara. No simplificar
  // esto de vuelta a un color fijo sin volver a hacer esa cuenta.
  // Una línea por opción, sin vacías ni espacios sueltos. Único punto que
  // hace este split: lo usan la carga inicial, cada tecla del textarea y
  // el "Deshacer" de Limpiar, y las tres necesitan tratar el texto guardado
  // exactamente igual o divergen en silencio.
  function parseOptionsText(raw) {
    return raw
      .split('\n')
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);
  }

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

    allOptions = parseOptionsText(val);

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

  // Edición interactiva del título de la ruleta: en vez de prompt(), el
  // propio <h3> se vuelve editable in situ con contenteditable. No lo
  // sustituimos por un <input> aparte porque el id #wheel-title-text tiene
  // que seguir existiendo y conteniendo el título (lo usan el resto de
  // funciones de este archivo y los tests de estado); con contenteditable
  // es el mismo elemento todo el tiempo, así que ninguna referencia queda
  // apuntando a un nodo desconectado del DOM.
  let titleBeforeEdit = '';
  // Tope razonable para un titular de una línea: sin esto, pegar un
  // párrafo entero (ver el 'paste' de abajo) o simplemente escribir mucho
  // deja un <h3> gigante que empuja el resto de la columna.
  const TITLE_MAX_LENGTH = 60;

  // `isContentEditable` en vez de leer el atributo a mano: es verdadero
  // tanto con contenteditable="true" como con "plaintext-only" (el
  // navegador puede ignorar este último si no lo soporta y quedarse en
  // "true"), así que no hay que duplicar la comprobación por cada valor
  // posible.
  function isEditingTitle() {
    return wheelTitleText.isContentEditable;
  }

  function selectAllText(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function collapseCursorToEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  // Inserta texto plano en la posición del cursor, reemplazando la
  // selección si la hay. La usa el handler de 'paste' de abajo: nunca deja
  // que el navegador pegue el HTML del portapapeles dentro del <h3>.
  function insertPlainTextAtCursor(text) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function startTitleEdit() {
    if (isSpinning || isEditingTitle()) return;

    titleBeforeEdit = wheelTitleText.textContent.trim();
    // "plaintext-only" evita que pegar contenido con formato inserte
    // <b>/<div>/etc. en el <h3>; donde el navegador no lo soporte, cae en
    // "true" normal y el handler de 'paste' de abajo hace ese mismo
    // trabajo a mano -- por eso está también, no es redundante.
    wheelTitleText.setAttribute('contenteditable', 'plaintext-only');
    if (!wheelTitleText.isContentEditable) {
      wheelTitleText.setAttribute('contenteditable', 'true');
    }
    // El CSS y el test de estado no pueden engancharse al valor exacto del
    // atributo: unos navegadores lo dejan en "plaintext-only" y otros lo
    // normalizan a "true" (Chromium, por ejemplo). Esta clase es la señal
    // estable de "se está editando" para ambos casos.
    wheelTitleText.classList.add('title-editing');
    wheelTitleText.setAttribute('role', 'textbox');
    wheelTitleText.setAttribute('aria-label', 'Título de la ruleta');
    // "done" en vez del salto de línea que el teclado táctil ofrecería por
    // defecto en un contenteditable: aquí un Enter siempre confirma (ver
    // el keydown de abajo), nunca inserta una línea nueva.
    wheelTitleText.setAttribute('enterkeyhint', 'done');

    wheelTitleText.focus();
    selectAllText(wheelTitleText);

    // Que el teclado táctil no tape el campo ni descoloque el layout: al
    // no ser un <input>, algunos navegadores no lo desplazan solos a la
    // vista cuando el viewport se encoge, así que lo hacemos a mano.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wheelTitleText.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  function endTitleEdit() {
    wheelTitleText.removeAttribute('contenteditable');
    wheelTitleText.classList.remove('title-editing');
    wheelTitleText.removeAttribute('role');
    wheelTitleText.removeAttribute('aria-label');
    wheelTitleText.removeAttribute('enterkeyhint');
    window.getSelection()?.removeAllRanges();
  }

  // Enter o perder el foco: confirma. Vacío o solo espacios cae al mismo
  // título por defecto que ya usaba el prompt() original.
  function commitTitleEdit() {
    if (!isEditingTitle()) return;
    const trimmed = wheelTitleText.textContent.trim();
    const finalTitle = trimmed || 'Ruleta de Opciones';
    wheelTitleText.textContent = finalTitle;
    endTitleEdit();
    writeStorage('ruleta_titulo', finalTitle);
  }

  // Escape: cancela y restaura el valor anterior, sin persistir nada.
  function cancelTitleEdit() {
    if (!isEditingTitle()) return;
    wheelTitleText.textContent = titleBeforeEdit;
    endTitleEdit();
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

  // Aviso de "Deshacer" tras vaciar, en vez del confirm() que había antes.
  //
  // El anuncio a lectores de pantalla va por #sr-announcer (el mismo que ya
  // usa announceWinner arriba), no por un aria-live propio del toast: ese
  // nodo vive siempre en el DOM, así que la mutación de texto ocurre sobre
  // una región que el lector ya tiene registrada. Un aria-live que empieza
  // dentro de un contenedor con `hidden` (display:none, fuera del árbol de
  // accesibilidad) y se destapa un frame antes de escribir el texto
  // depende de que el lector note la aparición Y la mutación en esa
  // ventana; no todos lo garantizan. Con #sr-announcer el toast queda como
  // pieza puramente visual, sin ese riesgo.
  function announceUndoToast(message) {
    srAnnouncer.textContent = message;
  }

  // Si el foco está dentro del aviso (en "Deshacer" o en "Cerrar") cuando
  // se oculta -por los 7s, por Escape o por el propio restore- el nodo
  // enfocado desaparece del DOM y el foco cae al <body>: alguien navegando
  // con teclado pierde el hilo justo después de actuar. Se lo devolvemos a
  // #clear-btn, que es de donde salió el aviso.
  function hideUndoToast() {
    if (undoToastTimer !== null) {
      clearTimeout(undoToastTimer);
      undoToastTimer = null;
    }
    if (!undoToast) return;
    if (undoToast.contains(document.activeElement)) {
      clearBtn.focus();
    }
    undoToast.hidden = true;
    if (undoToastMessage) undoToastMessage.textContent = '';
  }

  // 7s: tiempo suficiente para leer el aviso y reaccionar sin quedarse
  // pegado en pantalla. Se reprograma (no se deja correr) mientras el foco
  // está dentro del aviso -- ver el focusout de más abajo -- para no hacer
  // desaparecer el botón debajo de alguien que llegó tabulando y todavía lo
  // está leyendo (WCAG 2.2.1).
  function scheduleUndoToastDismissal() {
    if (undoToastTimer !== null) clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => {
      pendingClearUndo = null;
      hideUndoToast();
    }, 7000);
  }

  function showUndoToast(message) {
    if (!undoToast || !undoToastMessage) return;
    undoToast.hidden = false;
    undoToastMessage.textContent = message;
    announceUndoToast(message);
    scheduleUndoToastDismissal();
  }

  // Empezar a escribir invalida el "Deshacer": restaurar encima le pisaría
  // al usuario lo que acaba de teclear. Es el único disparador de
  // invalidación explícito -- shuffleOptions() y el propio restoreClearUndo()
  // llaman a updateFromTextarea() sin pasar por el listener de 'input', así
  // que no se invalidan entre sí.
  function invalidateClearUndo() {
    if (pendingClearUndo === null) return;
    pendingClearUndo = null;
    hideUndoToast();
  }

  function restoreClearUndo() {
    if (pendingClearUndo === null) return;
    const { text, disabled } = pendingClearUndo;
    pendingClearUndo = null;
    hideUndoToast();

    // Restaura las DOS cosas que Limpiar borró -- texto y ocultas -- sin
    // pasar por el emparejamiento por texto de updateFromTextarea(), que
    // aquí compararía contra una lista ya vacía y perdería el estado
    // oculto. Se reconstruye directo desde la foto y se persiste igual que
    // como estaba.
    textarea.value = text;
    allOptions = parseOptionsText(text);
    disabledIndices = new Set(disabled);
    persistOptionsState(text);
    syncWheelState();
    renderChecklist();
  }

  // Limpiar toda la lista: vacía al instante y ofrece deshacer en vez de
  // bloquear con confirm().
  function clearOptions() {
    if (isSpinning) return;
    // `allOptions`/`disabledIndices` vacíos no bastan para decidir que no
    // hay nada que limpiar: un textarea con solo saltos de línea o
    // espacios da `allOptions.length === 0` igual, y el botón se vería
    // roto (no hace nada visible) aunque sí quede texto de sobra por
    // borrar. El único caso realmente vacío es el textarea vacío del todo.
    if (textarea.value === '') return;

    pendingClearUndo = { text: textarea.value, disabled: new Set(disabledIndices) };
    textarea.value = '';
    updateFromTextarea();
    showUndoToast('Ruleta vaciada. Puedes deshacerlo.');
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
    wheelTitleText.addEventListener('click', startTitleEdit, { signal });
    wheelTitleText.addEventListener('blur', commitTitleEdit, { signal });
    wheelTitleText.addEventListener(
      'keydown',
      (e) => {
        // Un IME (acentos compuestos, japonés/chino/coreano...) también usa
        // Enter para confirmar la composición: si no se ignora aquí, ese
        // Enter cierra la edición del título a mitad de escribir un
        // carácter en vez de solo terminarlo.
        if (e.isComposing) return;

        if (e.key === 'Enter') {
          e.preventDefault();
          wheelTitleText.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // stopPropagation: sin esto, el mismo Escape sigue subiendo hasta
          // el listener de window de más abajo e invalida el "Deshacer" de
          // Limpiar si había uno pendiente -- dos acciones (cancelar el
          // título, cerrar un aviso que no tiene nada que ver) reaccionando
          // a una sola tecla.
          e.stopPropagation();
          cancelTitleEdit();
          wheelTitleText.blur();
        }
      },
      { signal }
    );
    // Tope de longitud mientras se escribe o se pega: recorta al límite y
    // deja el cursor al final, que es donde está en el caso normal de
    // "seguir tecleando". El 'paste' de abajo hace su propia inserción con
    // Range en vez de dejar que el navegador dispare 'input', así que esta
    // misma comprobación se reusa explícitamente ahí después de insertar.
    function enforceTitleMaxLength() {
      if (wheelTitleText.textContent.length > TITLE_MAX_LENGTH) {
        wheelTitleText.textContent = wheelTitleText.textContent.slice(0, TITLE_MAX_LENGTH);
        collapseCursorToEnd(wheelTitleText);
      }
    }

    wheelTitleText.addEventListener('input', enforceTitleMaxLength, { signal });

    // Pegar como texto plano, sin marcado ni saltos de línea: un
    // contenteditable normal (o "plaintext-only" sin soporte del
    // navegador) por defecto insertaría el HTML del portapapeles, y un
    // texto multilínea colapsa sin separador al leerlo por textContent
    // ("línea 1" + "línea 2" pegados dan "línea 1línea 2").
    wheelTitleText.addEventListener(
      'paste',
      (e) => {
        e.preventDefault();
        const raw = e.clipboardData?.getData('text/plain') ?? '';
        const text = raw.replace(/\s+/g, ' ').trim();
        insertPlainTextAtCursor(text);
        // Inserción manual: el navegador no dispara 'input' solo, así que
        // el tope de longitud se aplica a mano contra el resultado final
        // (título previo + texto pegado), no solo contra lo pegado.
        enforceTitleMaxLength();
      },
      { signal }
    );
  }
  if (editTitleBtn) {
    editTitleBtn.addEventListener('click', startTitleEdit, { signal });
  }

  // ==========================================================
  // CONTROLADORES DE EVENTOS
  // ==========================================================

  // Invalidar el "Deshacer" de Limpiar en la propia tecla, no dentro de
  // updateFromTextarea(): esa misma función también la llaman clearOptions()
  // y el "Deshacer" al restaurar, y ninguna de esas dos debería invalidarse
  // a sí misma. Solo una pulsación real del usuario cuenta como "empezó a
  // escribir algo nuevo".
  textarea.addEventListener(
    'input',
    () => {
      invalidateClearUndo();
      updateFromTextarea();
    },
    { signal }
  );
  spinButton.addEventListener('click', startSpin, { signal });
  shuffleBtn.addEventListener('click', shuffleOptions, { signal });
  clearBtn.addEventListener('click', clearOptions, { signal });

  if (undoToastBtn) {
    undoToastBtn.addEventListener('click', restoreClearUndo, { signal });
  }
  // En táctil no hay Escape ni tecla que invalide el aviso sin querer
  // escribir: sin este botón, la única forma de descartarlo antes de
  // tiempo sería esperar los 7s enteros.
  if (undoToastCloseBtn) {
    undoToastCloseBtn.addEventListener('click', invalidateClearUndo, { signal });
  }
  if (undoToast) {
    // Pausa el cierre automático mientras el foco está dentro del aviso
    // (en "Deshacer" o en "Cerrar"): alguien que llega tabulando no
    // debería ver desaparecer el control mientras todavía lo está leyendo
    // (WCAG 2.2.1). `relatedTarget` es a dónde va el foco; si sigue dentro
    // del propio aviso (moverse de un botón a otro) no hay nada que
    // retomar.
    undoToast.addEventListener(
      'focusin',
      () => {
        if (undoToastTimer !== null) {
          clearTimeout(undoToastTimer);
          undoToastTimer = null;
        }
      },
      { signal }
    );
    undoToast.addEventListener(
      'focusout',
      (e) => {
        if (undoToast.contains(e.relatedTarget)) return;
        if (pendingClearUndo !== null && !undoToast.hidden) {
          scheduleUndoToastDismissal();
        }
      },
      { signal }
    );
  }

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

  // Cerrar modal o aviso de "Deshacer" con Esc
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (winnerModal.classList.contains('active')) {
        closeModal();
      }
      invalidateClearUndo();
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
  allOptions = parseOptionsText(textarea.value);
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
    if (undoToastTimer !== null) clearTimeout(undoToastTimer);
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
