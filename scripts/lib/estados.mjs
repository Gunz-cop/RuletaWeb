/**
 * Estados que solo existen tras interactuar, y qué debe cumplirse en cada uno.
 *
 * Las capturas de píxeles no sirven aquí. La home tiene animaciones infinitas
 * —la marquesina, el logo que flota, las partículas del hero— y un canvas
 * cuyo ángulo depende del momento: una captura de página completa tras un
 * clic sale distinta cada vez. Se intentó y daba diferencias de 3000 a 4000
 * píxeles comparando main contra sí mismo.
 *
 * Lo que sí es estable, y además es exactamente lo que rompe un refactor, es
 * el estilo computado. Cuando una regla deja de encontrar su elemento —por
 * ejemplo al mover una sección a un componente y cambiar el hash de scope de
 * Astro— la regla se sigue emitiendo en el CSS, así que ningún test de CSS lo
 * nota, pero el elemento deja de recibirla. Eso sí se ve aquí.
 */
// --- Invariantes de geometría del panel móvil -----------------------------
// getComputedStyle no puede expresar "un elemento no tapa a otro" ni "este
// elemento no se mueve al scrollear" -- son relaciones entre rects, no
// propiedades de uno solo. Estas dos funciones reciben la página de
// Playwright directamente (ver verificarRelacion en estado-dom.mjs) y las
// usan los estados de más abajo. Se agregaron después de que una auditoría
// externa encontrara dos fallas reales que ningún test anterior detectaba:
// el panel de opciones no era position:fixed al viewport de verdad (un
// ancestro con `transform` lo convertía en su bloque contenedor), y el
// botón GIRAR quedaba tapado por completo con el panel abierto.
async function medirRect(pagina, selector) {
  return pagina.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }, selector);
}

const TOLERANCIA_PX = 2;

// El panel (cerrado, mostrando solo su manija) tiene que quedar en el mismo
// sitio de la ventana sin importar cuánto se haya scrolleado la página. Si
// algún ancestro le pone un `transform` (p. ej. .reveal antes de que el
// observer marque .revealed), position:fixed deja de anclarse al viewport
// y se ancla a ese ancestro en su lugar -- el panel "flota" en medio de la
// página en vez de quedarse pegado abajo.
async function verificarPanelFijoTrasScroll(pagina) {
  const antes = await medirRect(pagina, '#mobile-options-panel');
  await pagina.evaluate(() => window.scrollTo(0, 900));
  await pagina.waitForTimeout(150);
  const despues = await medirRect(pagina, '#mobile-options-panel');
  if (!antes || !despues) {
    return { ok: false, mensaje: '#mobile-options-panel no existe en el DOM' };
  }
  const delta = Math.abs(antes.bottom - despues.bottom);
  return {
    ok: delta <= TOLERANCIA_PX,
    mensaje:
      `bottom antes de scrollear=${antes.bottom.toFixed(1)}px, después de scrollear a 900px=${despues.bottom.toFixed(1)}px ` +
      `(delta ${delta.toFixed(1)}px, tolerancia ${TOLERANCIA_PX}px). Un delta grande significa que el panel no está ` +
      `fixed al viewport de verdad -- algún ancestro le puso un transform.`,
  };
}

// Con el panel abierto, el botón GIRAR (el único disparador del giro) tiene
// que seguir por encima del borde superior del panel. "Se ve la mitad de
// arriba de la rueda" no alcanza si esa mitad no incluye el botón.
async function verificarBotonGirarSobrePanel(pagina) {
  await pagina.click('#options-panel-toggle');
  await pagina.waitForTimeout(400);
  const spin = await medirRect(pagina, '#spin-button');
  const panel = await medirRect(pagina, '#mobile-options-panel');
  if (!spin || !panel) {
    return { ok: false, mensaje: '#spin-button o #mobile-options-panel no existen en el DOM' };
  }
  const holgura = panel.top - spin.bottom;
  return {
    ok: holgura >= 0,
    mensaje:
      `spin-button.bottom=${spin.bottom.toFixed(1)}px, panel.top=${panel.top.toFixed(1)}px ` +
      `(holgura ${holgura.toFixed(1)}px). Holgura negativa significa que el panel abierto tapa el botón GIRAR.`,
  };
}

export const ESTADOS = [
  {
    ruta: '/',
    nombre: 'modo-foco',
    clics: ['#focus-toggle-btn'],
    espera: 400,
    comprobar: [
      // El modo foco esconde todo lo que no es la ruleta.
      { sel: '.hero', props: ['display'] },
      { sel: '.hub-section', props: ['display'] },
      { sel: 'footer', props: ['display'] },
      { sel: '.nav-link', props: ['display'] },
      { sel: '.logo-link', props: ['display'] },
      // Y recoloca la cabecera y la sección de la ruleta.
      { sel: '.header-inner', props: ['justifyContent'] },
      { sel: '.roulette-section', props: ['display', 'alignItems', 'padding', 'minHeight'] },
      // .section-header (kicker "Herramienta principal" + "Gira y decide.")
      // es nuevo: antes de la migración editorial esta sección no tenía
      // ningún elemento con esa clase, así que la regla de modo foco que la
      // oculta llevaba órfana desde el refactor a componentes. Ahora que sí
      // hay un .section-header dentro de .roulette-section, la regla vuelve
      // a tener efecto — esto es lo que hubiera avisado si alguien la
      // rompía de nuevo.
      { sel: '.roulette-section .section-header', props: ['display'] },
      { sel: '.app-grid', props: ['gridTemplateColumns'] },
      { sel: 'body', props: ['backgroundColor'] },
    ],
  },
  {
    ruta: '/',
    nombre: 'pestana-gestionar',
    clics: ['#tab-manage'],
    espera: 250,
    comprobar: [
      { sel: '#tab-manage-content', props: ['display'] },
      { sel: '#tab-edit-content', props: ['display'] },
      { sel: '#tab-manage', props: ['color', 'backgroundColor'] },
    ],
  },
  {
    ruta: '/',
    nombre: 'modal-ganador',
    clics: ['#spin-button'],
    // El giro no dura un tiempo fijo: se frena por rozamiento, así que se
    // espera al modal en vez de a un reloj.
    esperarSelector: '#winner-modal.active',
    espera: 300,
    comprobar: [
      { sel: '#winner-modal', props: ['display', 'opacity', 'visibility', 'position'] },
      { sel: '.modal-card', props: ['transform', 'backgroundColor', 'borderRadius'] },
      { sel: '.modal-title', props: ['fontFamily', 'color'] },
      { sel: '.winner-name-text', props: ['fontSize', 'fontWeight'] },
      { sel: '.celebration-emoji', props: ['display', 'fontSize'] },
    ],
  },
  {
    // Reemplaza al prompt() que abría editTitle(): el propio <h3> se vuelve
    // editable in situ. cursor/userSelect son las dos propiedades que
    // decide nuestro CSS (`#wheel-title-text.title-editing`); no se
    // comprueba `outline` aquí a propósito: la regla que lo pone en
    // "dashed" es `:focus-visible`, y si ese pseudo-estado termina
    // aplicando tras un clic (el caso de esta prueba) depende de la
    // heurística de "modalidad de entrada" de cada navegador, no de una
    // regla nuestra -- comprobarlo haría que el test fallara si Chromium
    // cambia esa heurística sin que nadie haya roto nada aquí.
    //
    // El selector es la clase .title-editing, no [contenteditable="true"]:
    // el valor real del atributo varía entre navegadores (Chromium lo
    // normaliza desde "plaintext-only" a "true", otros no), así que un
    // selector de atributo con valor exacto es frágil por la misma razón
    // que el CSS de RouletteMachine.astro dejó de usarlo.
    ruta: '/',
    nombre: 'titulo-edicion',
    clics: ['#edit-title-btn'],
    espera: 200,
    comprobar: [
      { sel: '#wheel-title-text.title-editing', props: ['cursor', 'userSelect'] },
    ],
  },
  {
    // Reemplaza al confirm() que bloqueaba clearOptions(): vacía al
    // instante y este es el aviso de "Deshacer" que queda visible unos
    // segundos. El textarea trae las opciones por defecto al cargar, así
    // que #clear-btn siempre tiene algo que vaciar en este estado.
    ruta: '/',
    nombre: 'deshacer-limpiar',
    clics: ['#clear-btn'],
    esperarSelector: '#undo-toast:not([hidden])',
    espera: 250,
    comprobar: [
      { sel: '#undo-toast', props: ['display', 'position', 'zIndex'] },
      { sel: '#undo-toast-btn', props: ['display', 'cursor', 'minHeight'] },
    ],
  },
  {
    ruta: '/',
    nombre: 'reposo',
    clics: [],
    comprobar: [
      // Contraste del anterior: sin pulsar nada, nada está oculto.
      { sel: '.hero', props: ['display'] },
      { sel: '.hub-section', props: ['display'] },
      { sel: '.header-inner', props: ['justifyContent'] },
      { sel: '#tab-manage-content', props: ['display'] },
      { sel: '.roulette-section .section-header', props: ['display'] },
      // Contraste con modal-ganador: sin girar, el modal está oculto.
      { sel: '#winner-modal', props: ['display', 'opacity', 'visibility'] },
      // La home agranda las cabeceras de sección respecto al resto del
      // sitio. Al sacar la sección de herramientas a un componente, esos
      // overrides dejaron de alcanzarla y el titular volvió al tamaño
      // pequeño: la home encogía 50px en móvil. Lo cazó el comparador
      // visual, que es manual; esto lo deja cubierto en CI.
      { sel: '.hub-section .section-heading', props: ['fontSize'] },
      { sel: '.hub-section .section-tag', props: ['marginBottom'] },
      { sel: '.hub-section .section-header', props: ['marginBottom'] },
    ],
  },
  {
    // Panel de opciones como hoja inferior en móvil (layout nuevo): no
    // existe en reposo -- .panel-open lo pone roulette.js al pulsar la
    // manija -- así que, igual que el modo edición del título o el aviso
    // de deshacer, necesita su propio estado provocado en vez de una
    // captura de píxeles (canvas + animaciones infinitas, ver cabecera).
    ruta: '/',
    nombre: 'panel-opciones-movil',
    viewport: { width: 390, height: 844 },
    clics: ['#options-panel-toggle'],
    espera: 400,
    comprobar: [
      { sel: '#mobile-options-panel', props: ['position', 'zIndex', 'transform'] },
      // `height`, no `minHeight`: la regla escrita es `height: 56px` en la
      // manija, y `minHeight` da "auto" tanto si la regla aplica como si
      // no -- no habría detectado que la regla dejó de encontrar el
      // elemento, que es justo lo que existe para cazar.
      { sel: '#options-panel-toggle', props: ['height', 'cursor'] },
      { sel: '.roulette-section .section-tag', props: ['display'] },
    ],
  },
  {
    // Invariante, no snapshot -- ver el comentario junto a
    // verificarPanelFijoTrasScroll más arriba.
    ruta: '/',
    nombre: 'panel-fijo-tras-scroll',
    viewport: { width: 390, height: 844 },
    verificarRelacion: verificarPanelFijoTrasScroll,
  },
  {
    ruta: '/',
    nombre: 'boton-girar-visible-con-panel-390x844',
    viewport: { width: 390, height: 844 },
    verificarRelacion: verificarBotonGirarSobrePanel,
  },
  {
    ruta: '/',
    nombre: 'boton-girar-visible-con-panel-375x667',
    viewport: { width: 375, height: 667 },
    verificarRelacion: verificarBotonGirarSobrePanel,
  },
  {
    ruta: '/',
    nombre: 'boton-girar-visible-con-panel-360x640',
    viewport: { width: 360, height: 640 },
    verificarRelacion: verificarBotonGirarSobrePanel,
  },
  {
    // La pestaña "Gestionar" alcanzada desde dentro del panel móvil: cubre
    // que abrir el panel no rompe el resto de la interacción que ya vigila
    // el estado "pestana-gestionar" de arriba.
    ruta: '/',
    nombre: 'panel-opciones-movil-gestionar',
    viewport: { width: 390, height: 844 },
    clics: ['#options-panel-toggle', '#tab-manage'],
    espera: 400,
    comprobar: [
      { sel: '#mobile-options-panel', props: ['transform'] },
      { sel: '#tab-manage-content', props: ['display'] },
      { sel: '#tab-edit-content', props: ['display'] },
    ],
  },
  // --- Dados -------------------------------------------------------------
  // Los dados, sus caras y sus puntos los construye dados.js al lanzar, así
  // que en reposo no existen y las capturas no los ven. Estas tres entradas
  // cubren las tres variantes visuales, que es donde vive la mayor parte
  // del CSS de la página.
  {
    ruta: '/dados',
    nombre: 'lanzado-casino',
    clics: ['[data-theme="casino"]', '#btn-spin'],
    esperarSelector: '#dice-container .casino-face',
    espera: 2500,
    comprobar: [
      { sel: '.dice-cube', props: ['transformStyle', 'width', 'height', 'position'] },
      { sel: '.casino-face', props: ['backgroundColor', 'borderRadius', 'display'] },
      { sel: '.casino-dot', props: ['backgroundColor', 'borderRadius'] },
      { sel: '#result-display', props: ['display', 'fontFamily'] },
    ],
  },
  {
    ruta: '/dados',
    nombre: 'lanzado-yugioh',
    clics: ['[data-theme="yugioh"]', '#btn-spin'],
    esperarSelector: '#dice-container .yugioh-face',
    espera: 2500,
    comprobar: [
      { sel: '.yugioh-face', props: ['backgroundColor', 'borderRadius', 'display'] },
      { sel: '.yugioh-dot', props: ['backgroundColor'] },
    ],
  },
  {
    ruta: '/dados',
    nombre: 'lanzado-dnd',
    clics: ['[data-theme="dnd"]', '#btn-spin'],
    esperarSelector: '#dice-container .d20-wrapper',
    espera: 2500,
    comprobar: [
      { sel: '.d20-wrapper', props: ['display', 'position', 'width', 'height'] },
      { sel: '.d20-number', props: ['position', 'fontFamily', 'color'] },
    ],
  },
  // --- Amigo secreto -----------------------------------------------------
  // Las etiquetas de participante, las filas de enlaces y sus botones los
  // construye amigo-secreto.js con lo que escribe el visitante: en reposo no
  // existen, así que ninguna captura los ve. Es la herramienta con tráfico
  // real del sitio, de modo que conviene cubrirla de verdad.
  {
    ruta: '/amigo-secreto',
    nombre: 'sorteo-hecho',
    escribir: [{ sel: '#participants-textarea', texto: 'Ana\nBruno\nCarla\nDiego' }],
    clics: ['#btn-draw'],
    esperarSelector: '#links-list-container .link-row',
    comprobar: [
      { sel: '.participant-tag', props: ['display', 'backgroundColor', 'borderRadius'] },
      { sel: '.link-row', props: ['display', 'flexDirection', 'alignItems', 'backgroundColor'] },
      { sel: '.row-name', props: ['fontFamily', 'fontWeight', 'color'] },
      { sel: '.row-actions', props: ['display', 'gap'] },
      { sel: '.btn-action', props: ['display', 'borderRadius', 'cursor'] },
      { sel: '#results-section', props: ['display'] },
      { sel: '#matrix-tbody tr', props: ['display'] },
    ],
  },
  {
    // El mismo sorteo a 390px: aquí viven las dos reglas que estaban dentro
    // de la media query y que era fácil dejarse atrás al extraer el CSS.
    ruta: '/amigo-secreto',
    nombre: 'sorteo-hecho-movil',
    viewport: { width: 390, height: 844 },
    escribir: [{ sel: '#participants-textarea', texto: 'Ana\nBruno\nCarla\nDiego' }],
    clics: ['#btn-draw'],
    esperarSelector: '#links-list-container .link-row',
    comprobar: [
      { sel: '.link-row', props: ['flexDirection', 'alignItems'] },
      { sel: '.row-actions', props: ['width', 'justifyContent'] },
    ],
  },
];
