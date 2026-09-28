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
//
// Umbral en 16px (un ancho de dedo), no en 0: con >= 0 el invariante solo
// avisa cuando el botón YA está tapado. Una auditoría externa midió que la
// holgura real venía bajando (43.2→30.8px a 375px, 36.6→24.3px a
// 360×640) y el invariante seguía en verde todo el tiempo, porque nunca
// llegó a cruzar 0 -- avisaba tarde por diseño. Si algún viewport queda en
// rojo con este umbral, la holgura real es demasiado chica para un dedo: no
// hay que bajar el umbral para que vuelva a pasar, hay que agrandar la
// holgura.
//
// Nota para quien depure esto en el futuro (costó caro la primera vez y
// nunca quedó escrito): el error de Playwright "intercepts pointer events"
// no distingue "tapado por otro elemento" de "excluido por `inert`" --
// los dos dan el mismo mensaje, así que no sirve para diagnosticar cuál de
// las dos cosas pasó. Hay que mirar los rects a mano.
const HOLGURA_MINIMA_PX = 16;

async function verificarBotonGirarSobrePanel(pagina) {
  await pagina.click('#options-panel-toggle');
  await pagina.waitForTimeout(400);
  const spin = await medirRect(pagina, '#spin-button');
  const panel = await medirRect(pagina, '#mobile-options-panel');
  if (!spin || !panel) {
    return { ok: false, mensaje: '#spin-button o #mobile-options-panel no existen en el DOM' };
  }
  // Punto ciego que tapaba el invariante entero: si #spin-button tuviera
  // alto o ancho cero (por ejemplo porque una regla rota lo colapsó), el
  // rect sigue siendo un objeto válido con top/bottom/left/right iguales,
  // la resta de más abajo da una "holgura" que puede salir positiva igual,
  // y el invariante pasaría aunque el botón no exista visualmente. Exigir
  // un rectángulo real es barato y cierra ese hueco.
  const altoSpin = spin.bottom - spin.top;
  const anchoSpin = spin.right - spin.left;
  if (altoSpin <= 0 || anchoSpin <= 0) {
    return {
      ok: false,
      mensaje: `#spin-button tiene un rect degenerado (alto=${altoSpin.toFixed(1)}px, ancho=${anchoSpin.toFixed(1)}px) -- no es un botón visible real.`,
    };
  }
  const holgura = panel.top - spin.bottom;
  return {
    ok: holgura >= HOLGURA_MINIMA_PX,
    mensaje:
      `spin-button.bottom=${spin.bottom.toFixed(1)}px, panel.top=${panel.top.toFixed(1)}px ` +
      `(holgura ${holgura.toFixed(1)}px, mínimo ${HOLGURA_MINIMA_PX}px). Holgura por debajo del mínimo significa ` +
      `que el panel abierto tapa (o casi tapa) el botón GIRAR.`,
  };
}

// --- Estándar móvil: la acción principal se ve sin hacer scroll ---------
// Regla de DESIGN.md ("Responsive: mobile first"): en una herramienta, el
// botón que produce el resultado tiene que caber en la primera pantalla de
// cada móvil de referencia. Son altos de ventana *útil*, ya descontadas las
// barras del sistema y del navegador, no el tamaño de la pantalla:
//
//   android-360x560   Android de gama media con Chrome (la mayor parte del
//                     tráfico, que viene de Colombia)
//   iphone-se-375x548 el iPhone más bajo aún en uso (SE / 8) con Safari
//   iphone-393x659    iPhone 15/16 con la barra de Safari abajo
//
// Nació de un caso real: el botón Lanzar de la moneda terminaba en 807px y
// había que hacer scroll para usar la herramienta.
//
// Misma holgura de un dedo que el invariante de la ruleta, por la misma
// razón: con >= 0 solo avisaría cuando el botón ya está cortado.
export const VIEWPORTS_MOVIL = {
  'android-360x560': { width: 360, height: 560 },
  'iphone-se-375x548': { width: 375, height: 548 },
  'iphone-393x659': { width: 393, height: 659 },
};

// Un estado `accion-principal-visible-<móvil>` por cada móvil de referencia.
export function estadosAccionVisible(ruta, selector) {
  return Object.entries(VIEWPORTS_MOVIL).map(([nombre, viewport]) => ({
    ruta,
    nombre: `accion-principal-visible-${nombre}`,
    viewport,
    verificarRelacion: accionPrincipalVisible(selector),
  }));
}

export function accionPrincipalVisible(selector) {
  return async (pagina) => {
    const r = await medirRect(pagina, selector);
    if (!r) return { ok: false, mensaje: `${selector} no existe en el DOM` };
    if (r.bottom - r.top <= 0 || r.right - r.left <= 0) {
      return { ok: false, mensaje: `${selector} tiene un rect degenerado -- no es un botón visible real.` };
    }
    const alto = await pagina.evaluate(() => window.innerHeight);
    const holgura = alto - r.bottom;
    return {
      ok: holgura >= HOLGURA_MINIMA_PX,
      mensaje:
        `${selector}.bottom=${r.bottom.toFixed(1)}px con ${alto}px visibles (holgura ${holgura.toFixed(1)}px, ` +
        `mínimo ${HOLGURA_MINIMA_PX}px). Por debajo del mínimo hay que hacer scroll para usar la herramienta: ` +
        `compacta el hero o el objeto en móvil, no bajes el umbral.`,
    };
  };
}

// --- Matriz responsive: el resto de formatos ------------------------------
// Además de los móviles de referencia, la página se prueba en los formatos
// que no son "un teléfono en vertical": plegables, tablets, escritorio y
// móvil en horizontal. Oppo, Xiaomi o Motorola no necesitan fila propia:
// sus ventanas útiles (360–412px de ancho) ya las cubren los de referencia.
//
// `accion: false` exime del invariante de acción visible: un móvil en
// horizontal deja ~340px de alto, donde ninguna herramienta cabe entera; ahí
// solo se exige que no haya scroll horizontal.
export const VIEWPORTS_RESPONSIVE = {
  'fold-cerrado-344x680': { viewport: { width: 344, height: 680 }, accion: true },
  'fold-abierto-673x760': { viewport: { width: 673, height: 760 }, accion: true },
  'tablet-vertical-768x960': { viewport: { width: 768, height: 960 }, accion: true },
  'tablet-horizontal-1024x700': { viewport: { width: 1024, height: 700 }, accion: true },
  'movil-horizontal-740x340': { viewport: { width: 740, height: 340 }, accion: false },
  'escritorio-1280x720': { viewport: { width: 1280, height: 720 }, accion: true },
  'escritorio-1920x1000': { viewport: { width: 1920, height: 1000 }, accion: true },
};

// Sin scroll horizontal, y (si se pide) la acción principal visible. Con
// `preparar` el estado puede cambiar de modo antes de medir (p. ej. cinco
// monedas pequeñas en un Fold cerrado, el caso más ancho de la moneda).
function sinScrollHorizontal(selector, { accion, preparar } = {}) {
  return async (pagina) => {
    if (preparar) await preparar(pagina);
    const { ancho, scroll } = await pagina.evaluate(() => ({
      ancho: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    if (scroll > ancho + TOLERANCIA_PX) {
      return {
        ok: false,
        mensaje: `scroll horizontal: el documento mide ${scroll}px en una ventana de ${ancho}px. Algo tiene un ancho fijo o un min-width mayor que la pantalla.`,
      };
    }
    if (accion) return accionPrincipalVisible(selector)(pagina);
    return { ok: true, mensaje: `sin scroll horizontal (${scroll}px en ${ancho}px)` };
  };
}

export function estadosResponsive(ruta, selector, extras = []) {
  const base = Object.entries(VIEWPORTS_RESPONSIVE).map(([nombre, { viewport, accion }]) => ({
    ruta,
    nombre: `responsive-${nombre}`,
    viewport,
    verificarRelacion: sinScrollHorizontal(selector, { accion }),
  }));
  const conModo = extras.map(({ nombre, viewport, preparar }) => ({
    ruta,
    nombre: `responsive-${nombre}`,
    viewport,
    verificarRelacion: sinScrollHorizontal(selector, { accion: true, preparar }),
  }));
  return [...base, ...conModo];
}

export const ESTADOS = [
  {
    // La ruleta se mudó a /ruleta (ver AGENTS.md): el modo foco es un
    // control suyo (roulette.js, #focus-toggle-btn), así que su estado
    // viaja con ella. Los selectores también se reescribieron -- la
    // versión vieja comprobaba .nav-link/.logo-link, que solo existen con
    // el header de home (showHomeHeader=true); /ruleta usa el header de
    // herramienta (showHomeHeader=false + showRouletteControls=true, ver
    // Header.astro), donde esos elementos no existen. Comprobarlos aquí
    // habría dado un falso "no se oculta" permanente, no una detección real.
    ruta: '/ruleta',
    nombre: 'modo-foco',
    clics: ['#focus-toggle-btn'],
    espera: 400,
    comprobar: [
      // El modo foco esconde todo lo que no es la ruleta.
      { sel: '.hub-section', props: ['display'] },
      { sel: '.seo-section', props: ['display'] },
      { sel: 'footer', props: ['display'] },
      // .main.wrap: la página ya no monta ningún <main> (se retiró junto
      // con el hero propio al mover el h1 dentro de la ruleta, ver
      // AGENTS.md), así que ya no hay un contenedor de sobra que pueda
      // volver a reservar ~96px muertos e introducir scroll en modo foco
      // -- pero si alguna vez reaparece un <main> en esta página, esta
      // comprobación tiene que existir para cazarlo oculto de verdad.
      { sel: 'main.wrap', props: ['display'] },
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
    ruta: '/ruleta',
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
    ruta: '/ruleta',
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
    ruta: '/ruleta',
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
    ruta: '/ruleta',
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
    // Antes llamado 'reposo' de la home, con tres aserciones de más
    // (.hero/.hub-section display, .header-inner justifyContent) que eran
    // el contraste de 'modo-foco' -- pero modo foco vive en /ruleta desde
    // la mudanza, y en / no hay ninguna regla que oculte esos elementos ni
    // recoloque la cabecera: esas tres nunca iban a fallar, un contraste
    // entre dos páginas distintas no es un contraste. Lo único que este
    // estado vigila de verdad son los overrides :global() de section-tag/
    // section-heading/section-header que index.astro le suma al índice de
    // herramientas (ver ese archivo) -- se renombra para decir eso mismo,
    // no para acumular más aserciones decorativas la próxima vez.
    ruta: '/',
    nombre: 'cabeceras-de-seccion',
    clics: [],
    comprobar: [
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
    // Reposo de /ruleta: contraste de los estados provocados de la ruleta
    // (pestana-gestionar, modal-ganador) -- sin pulsar nada, nada de eso
    // está activo. Antes de la mudanza esto vivía mezclado con el reposo
    // de la home; se separa porque son páginas distintas ahora.
    ruta: '/ruleta',
    nombre: 'reposo',
    clics: [],
    comprobar: [
      { sel: '#tab-manage-content', props: ['display'] },
      { sel: '.roulette-section .section-header', props: ['display'] },
      // Contraste con modal-ganador: sin girar, el modal está oculto.
      { sel: '#winner-modal', props: ['display', 'opacity', 'visibility'] },
    ],
  },
  {
    // El h1 de la página (ver AGENTS.md: vive dentro de RouletteMachine
    // desde que se corrigió el hallazgo del h1 oculto en móvil) tiene que
    // seguir en pantalla a 390px -- antes de ese arreglo, `main.wrap {
    // display: none }` bajo 859px lo sacaba del árbol de accesibilidad
    // entero, y ningún test anterior lo vigilaba porque ninguno miraba el
    // h1 en este viewport. Esta captura sirve de contraste: si la regla
    // que ocultaba `<main>` vuelve a aparecer, el h1 deja de existir en el
    // DOM visible y el valor grabado como línea base ('block' o similar)
    // deja de coincidir -- el snapshot lo marca como diferencia, no como
    // 'NO EXISTE EN EL DOM' silencioso, porque el h1 nunca se quita del
    // DOM, solo se le pondría display:none por herencia de un ancestro
    // oculto (lo que getComputedStyle sí refleja).
    ruta: '/ruleta',
    nombre: 'h1-visible-390x844',
    viewport: { width: 390, height: 844 },
    clics: [],
    comprobar: [
      { sel: 'h1', props: ['display'] },
    ],
  },
  {
    // Panel de opciones como hoja inferior en móvil (layout nuevo): no
    // existe en reposo -- .panel-open lo pone roulette.js al pulsar la
    // manija -- así que, igual que el modo edición del título o el aviso
    // de deshacer, necesita su propio estado provocado en vez de una
    // captura de píxeles (canvas + animaciones infinitas, ver cabecera).
    ruta: '/ruleta',
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
    ruta: '/ruleta',
    nombre: 'panel-fijo-tras-scroll',
    viewport: { width: 390, height: 844 },
    verificarRelacion: verificarPanelFijoTrasScroll,
  },
  {
    ruta: '/ruleta',
    nombre: 'boton-girar-visible-con-panel-390x844',
    viewport: { width: 390, height: 844 },
    verificarRelacion: verificarBotonGirarSobrePanel,
  },
  {
    ruta: '/ruleta',
    nombre: 'boton-girar-visible-con-panel-375x667',
    viewport: { width: 375, height: 667 },
    verificarRelacion: verificarBotonGirarSobrePanel,
  },
  {
    ruta: '/ruleta',
    nombre: 'boton-girar-visible-con-panel-360x640',
    viewport: { width: 360, height: 640 },
    verificarRelacion: verificarBotonGirarSobrePanel,
  },
  {
    // La pestaña "Gestionar" alcanzada desde dentro del panel móvil: cubre
    // que abrir el panel no rompe el resto de la interacción que ya vigila
    // el estado "pestana-gestionar" de arriba.
    ruta: '/ruleta',
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
  // --- Moneda -------------------------------------------------------------
  // Implementación de referencia del sistema editorial (ver DESIGN.md,
  // "Anatomía de una página de herramienta"). El resultado se muestra con
  // una clase que pone el JS y las filas del historial las crea moneda.js,
  // así que en reposo ninguna de las dos cosas existe.
  {
    ruta: '/moneda',
    nombre: 'lanzada',
    escribir: [
      { sel: '#option-heads', texto: 'Pizza' },
      { sel: '#option-tails', texto: 'Sushi' },
    ],
    clics: ['#btn-flip'],
    esperarSelector: '#coin-result.is-shown',
    comprobar: [
      { sel: '#coin-result', props: ['opacity', 'textAlign'] },
      { sel: '#coin-result-main', props: ['fontFamily', 'fontWeight', 'color'] },
      { sel: '.history-row', props: ['display', 'borderBottomWidth', 'borderBottomStyle'] },
      { sel: '.history-label', props: ['color'] },
      { sel: '.history-side', props: ['textTransform', 'color'] },
      { sel: '#btn-flip', props: ['backgroundColor', 'borderRadius', 'opacity'] },
    ],
  },
  {
    // Llega por un enlace compartido: prueba a la vez que la URL precarga
    // opciones y modo, y que la serie termina con marcador.
    ruta: '/moneda?cara=Pizza&cruz=Sushi&modo=mejor3&nombres=sello',
    nombre: 'serie-mejor-de-3',
    clics: ['#btn-flip'],
    esperarSelector: '#coin-result[data-estado="final"]',
    comprobar: [
      { sel: '#coin-single', props: ['display'] },
      { sel: '#coin-multi', props: ['display'] },
      { sel: '#coin-after', props: ['display'] },
      { sel: '#coin-gut', props: ['display'] },
      { sel: '.history-side', props: ['textTransform'] },
    ],
  },
  {
    ruta: '/moneda?modo=varias',
    nombre: 'varias-monedas',
    clics: ['#btn-flip'],
    esperarSelector: '#coin-result[data-estado="final"]',
    comprobar: [
      { sel: '#coin-single', props: ['display'] },
      { sel: '#coin-multi', props: ['display', 'gap'] },
      { sel: '#coin-count-field', props: ['display'] },
      { sel: '#coin-gut', props: ['display'] },
    ],
  },
  ...estadosAccionVisible('/moneda', '#btn-flip'),
  ...estadosResponsive('/moneda', '#btn-flip', [
    {
      nombre: 'cinco-monedas-fold-cerrado-344x680',
      viewport: { width: 344, height: 680 },
      preparar: async (pagina) => {
        await pagina.selectOption('#coin-mode', 'varias');
        await pagina.selectOption('#coin-count', '5');
      },
    },
  ]),
  // --- Oráculo sí o no -----------------------------------------------------
  // Migrado al sistema editorial con la estructura de la moneda. El resultado
  // y las filas del historial los pone si-o-no.js; el control de agitar solo
  // aparece en pantallas táctiles con sensor de movimiento.
  {
    ruta: '/si-o-no',
    nombre: 'consultada',
    escribir: [{ sel: '#oracle-question', texto: '¿Pido pizza esta noche?' }],
    clics: ['#btn-ask'],
    esperarSelector: '#oracle-result.is-shown',
    comprobar: [
      { sel: '#oracle-result', props: ['opacity', 'textAlign'] },
      { sel: '#oracle-result-main', props: ['fontFamily', 'fontWeight', 'color'] },
      { sel: '#oracle-object', props: ['display'] },
      { sel: '#oracle-die', props: ['opacity'] },
      { sel: '.history-row', props: ['display', 'borderBottomWidth', 'borderBottomStyle'] },
      { sel: '.history-label', props: ['color'] },
      { sel: '.history-side', props: ['color', 'textAlign'] },
      { sel: '#oracle-after', props: ['display'] },
      { sel: '#oracle-shake', props: ['display'] },
      { sel: '#btn-ask', props: ['backgroundColor', 'borderRadius', 'opacity'] },
    ],
  },
  {
    // Llega por un enlace compartido: la pregunta viene en la URL
    ruta: '/si-o-no?pregunta=%C2%BFSalgo%20hoy%3F',
    nombre: 'enlace-compartido',
    viewport: { width: 393, height: 659 },
    clics: ['#btn-ask'],
    esperarSelector: '#oracle-result[data-estado="final"]',
    comprobar: [
      { sel: '#oracle-after', props: ['display'] },
      { sel: '.history-row', props: ['gridTemplateColumns'] },
      { sel: '.history-label', props: ['overflowWrap'] },
    ],
  },
  {
    // Sin pregunta la bola se burla: no guarda historial ni ofrece compartir
    ruta: '/si-o-no',
    nombre: 'sin-pregunta',
    clics: ['#btn-ask'],
    esperarSelector: '#oracle-result[data-tipo="vacia"]',
    comprobar: [
      { sel: '#oracle-result', props: ['opacity'] },
      { sel: '#oracle-after', props: ['display'] },
      { sel: '.history-row', props: ['display'] },
      { sel: '.history-empty', props: ['display'] },
    ],
  },
  {
    // A la sexta consulta vacía seguida sale el primer gato (siempre el
    // mismo) y después uno cada diez normales, con su contador de colección
    ruta: '/si-o-no',
    nombre: 'gato',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      const gatos = [];
      for (let i = 1; i <= 17; i++) {
        await pagina.click('#btn-ask');
        await pagina.waitForSelector('#btn-ask:not([disabled])');
        const r = await pagina.evaluate(() => ({
          gato: document.getElementById('oracle-result').dataset.gato === 'si',
          texto: document.getElementById('oracle-result-main').textContent,
          lado: document.getElementById('oracle-result-side').textContent,
        }));
        if (r.gato) gatos.push({ i, ...r });
      }
      const ok = gatos.length === 2
        && gatos[0].i === 6 && /gato jugando/.test(gatos[0].texto) && gatos[0].lado === 'Frase de gato 1 de 8'
        && gatos[1].i === 17 && gatos[1].lado === 'Frase de gato 2 de 8';
      return { ok, mensaje: `gatos en 17 consultas vacías: ${JSON.stringify(gatos)}` };
    },
  },
  {
    // Móvil táctil: el control aparece y una sacudida (eventos sintéticos
    // del sensor) consulta sin tocar el botón.
    ruta: '/si-o-no',
    nombre: 'agitar-movil',
    viewport: { width: 393, height: 659 },
    // Chrome 153 añadió DeviceMotionEvent.requestPermission(), como Safari;
    // sin conceder los sensores, el navegador sin pantalla lo deniega.
    contexto: { hasTouch: true, isMobile: true, permissions: ['accelerometer', 'gyroscope'] },
    verificarRelacion: async (pagina) => {
      if (!(await pagina.isVisible('#btn-shake'))) {
        return { ok: false, mensaje: '#btn-shake no se ve en un móvil táctil' };
      }
      await pagina.click('#btn-shake');
      const mover = (x) => pagina.evaluate((x) => window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x, y: 0, z: 9.8 } })), x);
      for (const x of [0, 3, 0, 4, 1]) await mover(x);
      await pagina.waitForTimeout(200);
      if (await pagina.$('#oracle-result.is-shown')) {
        return { ok: false, mensaje: 'un movimiento suave consultó al oráculo' };
      }
      for (const x of [0, 20, -5, 20, -5]) await mover(x);
      try {
        await pagina.waitForSelector('#oracle-result.is-shown', { timeout: 5000 });
      } catch (e) {
        // Diagnóstico: qué ve el navegador de CI (otra versión de Chrome que
        // la local) al construir el evento y si le llegan eventos reales del
        // sensor emulado que se mezclan con los sintéticos.
        const diag = await pagina.evaluate(async () => {
          const ev = new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 20, y: 0, z: 9.8 } });
          const reales = [];
          const oir = (e) => reales.push(e.isTrusted ? JSON.stringify([e.accelerationIncludingGravity?.x, e.accelerationIncludingGravity?.y, e.accelerationIncludingGravity?.z]) : 'sintetico');
          window.addEventListener('devicemotion', oir);
          await new Promise((r) => setTimeout(r, 300));
          window.removeEventListener('devicemotion', oir);
          return {
            ua: navigator.userAgent,
            x: ev.accelerationIncludingGravity?.x ?? null,
            pressed: document.querySelector('#btn-shake')?.getAttribute('aria-pressed'),
            msg: document.querySelector('#shake-msg')?.textContent,
            reales: reales.length,
            muestra: reales.slice(0, 3),
          };
        });
        return { ok: false, mensaje: `una sacudida fuerte no consultó al oráculo; diagnóstico: ${JSON.stringify(diag)}` };
      }
      return { ok: true, mensaje: 'el movimiento suave no consulta y la sacudida sí' };
    },
  },
  ...estadosAccionVisible('/si-o-no', '#btn-ask'),
  ...estadosResponsive('/si-o-no', '#btn-ask'),
];
