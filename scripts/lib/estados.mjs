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
import { crearReto, nuevoId } from '../../src/scripts/ppt-reto.js';
import { forma } from '../../src/scripts/dados-poliedros.js';
import { NORMAL } from '../../src/scripts/dados-fisica.js';

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
  // Migrados al sistema editorial: los seis dados están en el HTML
  // (Dice.astro) y dados.js solo los gira, ilumina y oculta. El resultado lo
  // muestra una clase que pone el JS y las filas del historial las crea él.
  {
    ruta: '/dados',
    nombre: 'lanzados',
    clics: ['[data-dice-count="3"]', '#btn-roll'],
    esperarSelector: '#dice-result.is-shown',
    comprobar: [
      { sel: '#dice-result', props: ['opacity', 'textAlign'] },
      { sel: '#dice-result-main', props: ['fontFamily', 'fontWeight', 'color'] },
      { sel: '[data-die="0"]', props: ['display', 'transformStyle', 'width'] },
      { sel: '[data-die="3"]', props: ['display'] },
      { sel: '[data-die="0"] .dice-face', props: ['borderRadius', 'backfaceVisibility'] },
      { sel: '[data-die="0"] .dice-pip', props: ['borderRadius'] },
      { sel: '.history-row', props: ['display', 'borderBottomWidth', 'borderBottomStyle'] },
      { sel: '.history-side', props: ['color', 'textAlign'] },
      { sel: '#btn-roll', props: ['backgroundColor', 'borderRadius'] },
    ],
  },
  {
    // Lo que ningún estilo computado ve: que la suma escrita sea la de las
    // caras que quedaron ARRIBA. Lee la matriz real de cada dado visible y
    // busca qué cara apunta al eje z de la mesa (tabla NORMAL de dados.js).
    ruta: '/dados',
    nombre: 'suma-coincide-con-las-caras',
    viewport: { width: 390, height: 844 },
    verificarRelacion: async (pagina) => {
      await pagina.click('[data-dice-count="6"]');
      const errores = [];
      for (let t = 0; t < 3; t++) {
        await pagina.click('#btn-roll');
        await pagina.waitForSelector('#dice-result.is-shown', { timeout: 20000 });
        const r = await pagina.evaluate(() => {
          const NORMAL = { 1: [0, 0, 1], 2: [1, 0, 0], 3: [0, -1, 0], 4: [0, 1, 0], 5: [-1, 0, 0], 6: [0, 0, -1] };
          const caras = [...document.querySelectorAll('[data-die]:not([hidden])')].map((el) => {
            const m = new DOMMatrix(getComputedStyle(el).transform);
            const fila = [m.m13, m.m23, m.m33];
            let mejor = 0;
            let max = -2;
            for (const [cara, n] of Object.entries(NORMAL)) {
              const v = fila[0] * n[0] + fila[1] * n[1] + fila[2] * n[2];
              if (v > max) { max = v; mejor = Number(cara); }
            }
            return { cara: mejor, plana: max > 0.99 };
          });
          return {
            caras,
            suma: Number(document.getElementById('dice-result').dataset.suma),
          };
        });
        const total = r.caras.reduce((a, c) => a + c.cara, 0);
        if (r.caras.length !== 6) errores.push(`tirada ${t + 1}: ${r.caras.length} dados visibles, se esperaban 6`);
        if (r.caras.some((c) => !c.plana)) errores.push(`tirada ${t + 1}: algún dado no quedó plano sobre una cara`);
        if (total !== r.suma) errores.push(`tirada ${t + 1}: el texto dice ${r.suma} y las caras suman ${total}`);
      }
      return errores.length
        ? { ok: false, mensaje: errores.join('; ') }
        : { ok: true, mensaje: 'en 3 tiradas de 6 dados la suma escrita es la de las caras de arriba' };
    },
  },
  {
    // Lo mismo con los dados de rol: en cada tipo (D4 a D20) y en una
    // tirada escrita que mezcla tipos y lleva modificador, lee la matriz de
    // cada dado, busca qué valor quedó arriba con la geometría de
    // dados-poliedros.js (en el D4, la punta) y lo compara con data-caras y
    // con el total escrito.
    ruta: '/dados',
    nombre: 'rol-caras-coinciden-con-el-texto',
    viewport: { width: 390, height: 844 },
    verificarRelacion: async (pagina) => {
      const DIRS = { 6: NORMAL };
      for (const l of [4, 8, 10, 12, 20]) DIRS[l] = forma(l).dir;
      const leer = () => pagina.evaluate((dirs) => {
        const caras = [...document.querySelectorAll('[data-die]:not([hidden])')].map((el) => {
          const m = new DOMMatrix(getComputedStyle(el).transform);
          const fila = [m.m13, m.m23, m.m33];
          let mejor = 0;
          let max = -2;
          for (const [v, n] of Object.entries(dirs[el.dataset.lados])) {
            const z = fila[0] * n[0] + fila[1] * n[1] + fila[2] * n[2];
            if (z > max) { max = z; mejor = Number(v); }
          }
          return { lados: Number(el.dataset.lados), valor: mejor, plana: max > 0.99 };
        });
        const r = document.getElementById('dice-result');
        return {
          caras,
          escritas: r.dataset.caras,
          total: Number(document.getElementById('dice-result-main').textContent),
        };
      }, DIRS);
      const errores = [];
      await pagina.click('[data-dice-count="3"]');
      for (const lados of [4, 8, 10, 12, 20]) {
        await pagina.click(`[data-dice-type="${lados}"]`);
        await pagina.click('#btn-roll');
        await pagina.waitForSelector('#dice-result.is-shown', { timeout: 20000 });
        const r = await leer();
        const suma = r.caras.reduce((a, c) => a + c.valor, 0);
        if (r.caras.length !== 3 || r.caras.some((c) => c.lados !== lados)) errores.push(`D${lados}: en la mesa hay ${r.caras.map((c) => 'D' + c.lados).join(', ')}`);
        if (r.caras.some((c) => !c.plana)) errores.push(`D${lados}: algún dado no quedó plano`);
        if (r.caras.map((c) => c.valor).join(',') !== r.escritas) errores.push(`D${lados}: las caras dicen ${r.caras.map((c) => c.valor)} y data-caras ${r.escritas}`);
        if (suma !== r.total) errores.push(`D${lados}: el texto dice ${r.total} y las caras suman ${suma}`);
      }
      await pagina.click('[data-modo="rol"]');
      await pagina.fill('#rol-tirada', '1d20+1d8+1d4+2');
      await pagina.click('#btn-roll');
      await pagina.waitForSelector('#dice-result.is-shown', { timeout: 20000 });
      const r = await leer();
      const suma = r.caras.reduce((a, c) => a + c.valor, 0) + 2;
      if (r.caras.map((c) => c.lados).join(',') !== '20,8,4') errores.push(`1d20+1d8+1d4+2: en la mesa hay ${r.caras.map((c) => 'D' + c.lados).join(', ')}`);
      if (r.caras.some((c) => !c.plana)) errores.push('1d20+1d8+1d4+2: algún dado no quedó plano');
      if (suma !== r.total) errores.push(`1d20+1d8+1d4+2: el texto dice ${r.total} y las caras más 2 suman ${suma}`);
      return errores.length
        ? { ok: false, mensaje: errores.join('; ') }
        : { ok: true, mensaje: 'en D4, D8, D10, D12, D20 y en 1d20+1d8+1d4+2 el texto es lo que enseñan las caras' };
    },
  },
  {
    // Modo rol: lo que crea el JS (fila de personaje, tirada guardada) y el
    // dado descartado apagado, que con opacity se habría aplanado
    ruta: '/dados',
    nombre: 'rol-personaje-y-guardada',
    antes: ['[data-modo="rol"]'],
    escribir: [{ sel: '#rol-tirada', texto: '1d20+5' }, { sel: '#rol-nombre', texto: 'Ataque espada' }],
    clics: ['#btn-rol-guardar', '#btn-ventaja'],
    esperarSelector: '.dice.is-descartado',
    comprobar: [
      { sel: '.dice.is-descartado .rol-fill', props: ['backgroundColor'] },
      { sel: '.dice.is-descartado', props: ['transformStyle', 'opacity'] },
      { sel: '.rol-face', props: ['position', 'backfaceVisibility'] },
      { sel: '.rol-num.is-max', props: ['color', 'fontFamily'] },
      { sel: '.guardada-row', props: ['display', 'borderBottomWidth'] },
      { sel: '.guardada-expr', props: ['color'] },
      { sel: '#rol-tirada', props: ['fontSize', 'borderBottomWidth'] },
    ],
  },
  {
    // Dado de opciones: el texto que dice la página es el de la cara que
    // quedó ARRIBA (misma lectura de la matriz que con los números). Con 4
    // opciones hay caras «otra vez», así que también se cubre el relanzado.
    ruta: '/dados',
    nombre: 'opciones-cara-coincide-con-el-texto',
    viewport: { width: 390, height: 844 },
    verificarRelacion: async (pagina) => {
      const opciones = ['Cine', 'Parque', 'Biblioteca municipal', 'Museo'];
      // Al entrar en el modo, el dado llega con el ejemplo de seis opciones
      await pagina.click('[data-modo="opciones"]');
      for (let i = 0; i < 6; i++) await pagina.fill(`[data-op-casilla="${i + 1}"]`, opciones[i] ?? '');
      const errores = [];
      for (let t = 0; t < 4; t++) {
        await pagina.click('#btn-roll');
        await pagina.waitForSelector('#dice-result[data-opcion]', { timeout: 30000 });
        const r = await pagina.evaluate(() => {
          const NORMAL = { 1: [0, 0, 1], 2: [1, 0, 0], 3: [0, -1, 0], 4: [0, 1, 0], 5: [-1, 0, 0], 6: [0, 0, -1] };
          const dados = [...document.querySelectorAll('[data-die]:not([hidden])')];
          const m = new DOMMatrix(getComputedStyle(dados[0]).transform);
          const fila = [m.m13, m.m23, m.m33];
          let mejor = 0;
          let max = -2;
          for (const [cara, n] of Object.entries(NORMAL)) {
            const v = fila[0] * n[0] + fila[1] * n[1] + fila[2] * n[2];
            if (v > max) { max = v; mejor = cara; }
          }
          return {
            visibles: dados.length,
            plana: max > 0.99,
            arriba: dados[0].querySelector(`.dice-face[data-face="${mejor}"] .dice-texto`)?.textContent,
            opcion: document.getElementById('dice-result').dataset.opcion,
            escrito: document.getElementById('dice-result-main').textContent,
          };
        });
        if (r.visibles !== 1) errores.push(`tirada ${t + 1}: ${r.visibles} dados en la mesa, se esperaba 1`);
        if (!r.plana) errores.push(`tirada ${t + 1}: el dado no quedó plano`);
        if (r.arriba !== r.opcion || r.escrito !== r.opcion) errores.push(`tirada ${t + 1}: arriba «${r.arriba}», data-opcion «${r.opcion}», escrito «${r.escrito}»`);
        if (!opciones.includes(r.opcion)) errores.push(`tirada ${t + 1}: salió «${r.opcion}», que no es una opción`);
      }
      return errores.length
        ? { ok: false, mensaje: errores.join('; ') }
        : { ok: true, mensaje: 'en 4 tiradas del dado de opciones el texto es el de la cara de arriba' };
    },
  },
  {
    // Enlace compartido: el dado llega a la mesa con sus caras escritas,
    // la pregunta en el resultado y el botón principal lo lanza
    ruta: '/dados#para=%C2%BFQui%C3%A9n+lava%3F&opcion=Ana&opcion=Luis&opcion=Sof%C3%ADa',
    nombre: 'opciones-enlace-compartido',
    clics: ['#btn-roll'],
    esperarSelector: '#dice-result[data-opcion]',
    comprobar: [
      { sel: '#dice-stage', props: ['height'] },
      { sel: '[data-die="0"]', props: ['width', 'transformStyle'] },
      { sel: '[data-die="1"]', props: ['display'] },
      { sel: '[data-die="0"] .dice-face--texto', props: ['display', 'alignItems', 'backgroundColor'] },
      { sel: '[data-die="0"] .dice-texto', props: ['fontFamily', 'fontWeight', 'fontSize', 'color', 'textAlign'] },
      { sel: '#op-para', props: ['fontSize', 'borderBottomWidth'] },
      { sel: '[data-op-casilla="1"]', props: ['fontSize', 'borderBottomWidth'] },
      { sel: '[data-op-ejemplo="comida"]', props: ['borderRadius', 'borderTopWidth'] },
      { sel: '#btn-op-share', props: ['borderBottomWidth', 'backgroundColor'] },
      { sel: '.dice-modos', props: ['display', 'borderTopWidth', 'borderRadius'] },
      { sel: '.dice-modos [aria-pressed="true"]', props: ['backgroundColor', 'color', 'fontFamily'] },
      { sel: '[data-panel="normales"]', props: ['display'] },
      { sel: '[data-panel="opciones"]', props: ['display'] },
    ],
  },
  ...estadosAccionVisible('/dados', '#btn-roll'),
  // Quien abre un dado compartido ve la pregunta en el resultado y un dado
  // más grande: el botón tiene que seguir cabiendo en la primera pantalla
  ...estadosAccionVisible('/dados#para=%C2%BFQui%C3%A9n+lava%3F&opcion=Ana&opcion=Luis', '#btn-roll'),
  ...estadosResponsive('/dados', '#btn-roll', [
    {
      nombre: 'seis-dados-fold-cerrado-344x680',
      viewport: { width: 344, height: 680 },
      preparar: async (pagina) => {
        await pagina.click('[data-dice-count="6"]');
        await pagina.waitForTimeout(2200);
      },
    },
  ]),
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
    // Cada quinta consulta sin pregunta es un gato: la primera vez siempre
    // la misma frase, y cada uno con su contador de colección
    ruta: '/si-o-no',
    nombre: 'gato',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      const gatos = [];
      for (let i = 1; i <= 10; i++) {
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
        && gatos[0].i === 5 && /gato jugando/.test(gatos[0].texto) && gatos[0].lado === 'Frase de gato 1 de 8'
        && gatos[1].i === 10 && gatos[1].lado === 'Frase de gato 2 de 8';
      return { ok, mensaje: `gatos en 10 consultas vacías: ${JSON.stringify(gatos)}` };
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
  // Migrado al sistema editorial con la estructura de la moneda. El
  // resultado, el ganador y las filas del historial los pone
  // piedra-papel-tijera.js; la acción principal son tres botones iguales.
  {
    ruta: '/piedra-papel-tijera',
    nombre: 'jugada',
    contexto: { reducedMotion: 'reduce' },
    clics: ['.ppt-choice[data-choice="piedra"]'],
    esperarSelector: '#ppt-result[data-estado="final"]',
    comprobar: [
      { sel: '#ppt-result', props: ['opacity', 'textAlign'] },
      { sel: '#ppt-result-main', props: ['fontFamily', 'fontWeight', 'color'] },
      { sel: '#ppt-hand-1', props: ['display', 'width'] },
      { sel: '.ppt-choice', props: ['borderTopWidth', 'borderRadius'] },
      { sel: '.history-row', props: ['display', 'borderBottomWidth', 'borderBottomStyle'] },
      { sel: '.history-label', props: ['color'] },
      { sel: '#ppt-name-input-1', props: ['display'] },
    ],
  },
  {
    // Dos jugadores: la jugada del primero no se marca en ningún botón y la
    // ronda solo se resuelve cuando elige el segundo
    ruta: '/piedra-papel-tijera',
    nombre: 'dos-jugadores',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      await pagina.click('[data-mode="dos"]');
      await pagina.fill('#ppt-name-input-1', 'Ana');
      await pagina.fill('#ppt-name-input-2', 'Luis');
      await pagina.click('.ppt-choice[data-choice="tijera"]');
      // Entre turnos no debe quedar a la vista ningún botón de jugada: en
      // móvil el :hover de un toque se queda pegado y delataba la elección
      const entre = await pagina.evaluate(() => ({
        filaVisible: document.getElementById('ppt-choices').checkVisibility(),
        pasar: document.getElementById('btn-pass').checkVisibility(),
        resuelta: document.getElementById('ppt-result').dataset.estado === 'final',
      }));
      if (entre.filaVisible || !entre.pasar || entre.resuelta) {
        return { ok: false, mensaje: `tras elegir el jugador 1 la fila de jugadas sigue a la vista o la ronda ya se resolvió (${JSON.stringify(entre)})` };
      }
      await pagina.click('#btn-pass');
      const pulsados = await pagina.evaluate(() => document.querySelectorAll('.ppt-choice[aria-pressed="true"]').length);
      if (pulsados) return { ok: false, mensaje: 'al pasar el móvil un botón sigue marcado con la jugada del jugador 1' };
      await pagina.click('.ppt-choice[data-choice="papel"]');
      await pagina.waitForSelector('#ppt-result[data-estado="final"]');
      const texto = await pagina.textContent('#ppt-result-main');
      return { ok: texto === 'Gana Ana', mensaje: `tijera contra papel debería decir «Gana Ana» y dice «${texto}»` };
    },
  },
  {
    // Reto a distancia recibido por enlace: se responde, se revela y
    // reabrir el mismo enlace en este navegador ya no deja elegir otra vez
    ruta: '/piedra-papel-tijera',
    nombre: 'reto-a-distancia',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      const token = crearReto({ id: nuevoId(), a: 'Ana', b: 'Luis', q: 'lava los platos', e1: 'tijera' });
      const url = `${new URL(pagina.url()).origin}/piedra-papel-tijera#reto=${token}`;
      // La página ya está abierta en /piedra-papel-tijera: ir a la misma URL
      // con #reto= solo cambia el fragmento y la recarga la hace el script
      // (hashchange). Pasar por about:blank fuerza una carga limpia, como
      // cuando se abre el enlace desde WhatsApp, y la espera cubre el resto.
      await pagina.goto('about:blank');
      await pagina.goto(url);
      await pagina.waitForFunction(() => document.getElementById('ppt-turn')?.textContent.includes('Ana te reta'), null, { timeout: 5000 }).catch(() => {});
      const turno = await pagina.textContent('#ppt-turn');
      if (!turno.includes('Ana te reta')) return { ok: false, mensaje: `al abrir el reto la línea de turno dice «${turno}»` };
      await pagina.click('.ppt-choice[data-choice="papel"]');
      await pagina.waitForSelector('#ppt-result[data-estado="final"]');
      const veredicto = await pagina.textContent('#ppt-result-stake');
      if (veredicto !== 'Luis: lava los platos') return { ok: false, mensaje: `el veredicto dice «${veredicto}»` };
      if (!(await pagina.isVisible('#btn-share'))) return { ok: false, mensaje: 'tras responder no aparece el botón para devolver el resultado' };
      await pagina.goto('about:blank');
      await pagina.goto(url);
      await pagina.waitForSelector('#ppt-result[data-estado="final"]');
      const otraVez = await pagina.isVisible('#ppt-choices');
      return { ok: !otraVez, mensaje: otraVez ? 'al reabrir un reto ya respondido deja elegir otra vez' : 'reto respondido, revelado y bloqueado al reabrir' };
    },
  },
  ...estadosAccionVisible('/piedra-papel-tijera', '#ppt-choices'),
  ...estadosResponsive('/piedra-papel-tijera', '#ppt-choices'),
  // --- Temporizador --------------------------------------------------------
  // Migrado al sistema editorial con la estructura de la moneda. El aviso a
  // pantalla completa, el resultado y las filas del historial los pone
  // temporizador.js. El rango llega por la URL (1–2 s) para que la ronda
  // termine sin esperar; la zona horaria fija el nombre del juego.
  {
    ruta: '/temporizador?modo=papa&min=1&max=2',
    nombre: 'papa-quemada',
    viewport: { width: 393, height: 659 },
    contexto: { reducedMotion: 'reduce', timezoneId: 'America/Bogota' },
    escribir: [{ sel: '#timer-stake', texto: 'canta una canción' }],
    clics: ['#timer-start'],
    esperarSelector: '#timer-alert.is-shown',
    comprobar: [
      { sel: '#timer-alert', props: ['display', 'position', 'backgroundColor', 'color'] },
      { sel: '#timer-alert-title', props: ['fontFamily', 'fontWeight', 'color'] },
      { sel: '#timer-alert-close', props: ['display'] },
      { sel: '#timer-alert-ganas', props: ['display'] },
      { sel: '#timer-result', props: ['display', 'textAlign'] },
      { sel: '#timer-result-stake', props: ['display'] },
      { sel: '.history-row', props: ['display', 'borderBottomWidth', 'borderBottomStyle'] },
      { sel: '.history-label', props: ['color'] },
      { sel: '#timer-start', props: ['backgroundColor', 'borderRadius'] },
      { sel: '#timer-fieldset', props: ['opacity'] },
    ],
  },
  {
    // Mismo final, mirando el texto: en Colombia el juego es el tingo tango.
    // Va aparte porque un estado con verificarRelacion no mide estilos.
    ruta: '/temporizador?modo=papa&min=1&max=2',
    nombre: 'papa-nombre-colombia',
    contexto: { reducedMotion: 'reduce', timezoneId: 'America/Bogota' },
    escribir: [{ sel: '#timer-stake', texto: 'canta una canción' }],
    clics: ['#timer-start'],
    esperarSelector: '#timer-alert.is-shown',
    verificarRelacion: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        titulo: document.getElementById('timer-alert-title').textContent,
        texto: document.getElementById('timer-alert-text').textContent,
        modo: document.getElementById('timer-mode-papa').textContent,
      }));
      const ok = r.titulo === '¡Tango!' && r.texto === 'A quien le caiga: canta una canción' && r.modo === 'Tingo tango';
      return { ok, mensaje: `en Colombia el aviso dice ${JSON.stringify(r)}` };
    },
  },
  {
    // Aguantar un impulso: las ganas de antes y de después quedan juntas
    ruta: '/temporizador?modo=impulso&min=1&max=1',
    nombre: 'impulso-registrado',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      await pagina.fill('#timer-urge', 'mirar el móvil');
      await pagina.click('[data-ganas="7"]');
      await pagina.click('#timer-start');
      await pagina.waitForSelector('#timer-alert.is-shown', { timeout: 5000 });
      if (!(await pagina.isVisible('#timer-alert-ganas'))) {
        return { ok: false, mensaje: 'el aviso del impulso no pregunta por las ganas de después' };
      }
      await pagina.click('[data-ganas-despues="3"]');
      await pagina.click('#timer-alert-again');
      const fila = await pagina.textContent('.history-row');
      const ok = /Ganas de mirar el móvil/.test(fila) && /Ganas 7 → 3/.test(fila);
      return { ok, mensaje: `fila del historial: «${fila}»` };
    },
  },
  {
    // Avisos al azar: suena varias veces sin parar hasta que se pulsa Parar
    ruta: '/temporizador?modo=avisos&min=1&max=1',
    nombre: 'avisos-repetidos',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      await pagina.click('#timer-start');
      await pagina.waitForFunction(() => /^2 avisos/.test(document.getElementById('timer-status').textContent), null, { timeout: 6000 });
      const alerta = await pagina.isVisible('#timer-alert');
      await pagina.click('#timer-start');
      const res = await pagina.textContent('#timer-result-main');
      const ok = !alerta && /avisos$/.test(res);
      return { ok, mensaje: `aviso bloqueante durante la sesión: ${alerta}; resultado: «${res}»` };
    },
  },
  {
    // Respiración cuadrada: tras inhalar 4 s llega una retención («Mantén»)
    ruta: '/temporizador?modo=impulso&min=30&max=30',
    nombre: 'respiracion-cuadrada',
    verificarRelacion: async (pagina) => {
      await pagina.click('[data-resp="cuadrada"]');
      await pagina.click('#timer-start');
      try {
        await pagina.waitForFunction(() => document.getElementById('timer-breath-text').textContent === 'Mantén', null, { timeout: 7000 });
      } catch (e) {
        const t = await pagina.textContent('#timer-breath-text');
        return { ok: false, mensaje: `con 4-4-4-4 no llega la fase «Mantén» (se ve «${t}»)` };
      }
      const cuenta = await pagina.textContent('#timer-breath-count');
      await pagina.click('#timer-start');
      return { ok: /^[1-4]$/.test(cuenta), mensaje: `fase Mantén con cuenta «${cuenta}»` };
    },
  },
  {
    // Tu evidencia: con esperas guardadas, la frase de medias y el desglose
    ruta: '/temporizador?modo=impulso',
    nombre: 'impulso-evidencia',
    verificarRelacion: async (pagina) => {
      await pagina.evaluate(() => {
        const e = (de, antes, despues) => ({ t: Date.now(), de, antes, despues, seg: 300, parada: false });
        localStorage.setItem('decidelo_temporizador_esperas', JSON.stringify([
          e('comer algo dulce', 8, 4), e('comer algo dulce', 6, 4), e('mirar el móvil', 7, 4)]));
      });
      await pagina.reload();
      await pagina.waitForSelector('#timer-evidencia:not([hidden])', { timeout: 5000 });
      const main = await pagina.textContent('#timer-evid-main');
      const filas = await pagina.$$eval('#timer-evid-tipos li', (l) => l.length);
      const ok = main === 'En tus últimas 3 esperas, las ganas bajaron de 7 a 4 de media.' && filas === 2;
      return { ok, mensaje: `evidencia «${main}» con ${filas} tipos` };
    },
  },
  {
    // Avisos: al parar la sesión pregunta por la atención y la cuenta queda
    ruta: '/temporizador?modo=avisos&min=1&max=1',
    nombre: 'avisos-atencion',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      await pagina.click('#timer-start');
      await pagina.waitForFunction(() => /^1 aviso/.test(document.getElementById('timer-status').textContent), null, { timeout: 6000 });
      await pagina.click('#timer-start');
      await pagina.waitForSelector('#timer-alert.is-shown');
      if (!(await pagina.isVisible('#timer-alert-atencion'))) {
        return { ok: false, mensaje: 'al terminar la sesión no pregunta por la atención' };
      }
      await pagina.click('[data-atencion="respiracion"]');
      await pagina.click('#timer-alert-again');
      const ses = await pagina.textContent('#timer-ses-side');
      return { ok: ses === 'En 1 de 1 estabas en la respiración casi siempre.', mensaje: `tus sesiones: «${ses}»` };
    },
  },
  ...estadosAccionVisible('/temporizador', '#timer-start'),
  ...estadosResponsive('/temporizador', '#timer-start', [
    // El modo impulso muestra más campos; el botón no debe moverse de sitio
    { nombre: 'impulso-android-360x560', viewport: { width: 360, height: 560 }, preparar: (p) => p.click('#timer-modes [data-mode="impulso"]') },
  ]),
];
