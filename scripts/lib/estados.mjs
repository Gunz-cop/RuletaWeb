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
// --- Medidas de geometría -------------------------------------------------
// getComputedStyle no puede expresar "un elemento no tapa a otro" ni "este
// elemento cae dentro de la ventana": son relaciones entre rects, no
// propiedades de uno solo. Los estados con `verificarRelacion` o `invariante`
// reciben la página de Playwright directamente (ver estado-dom.mjs) y usan
// estas medidas.
async function medirRect(pagina, selector) {
  return pagina.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }, selector);
}

const TOLERANCIA_PX = 2;

// Holgura mínima bajo la acción principal: un ancho de dedo, no 0. Con >= 0
// el invariante solo avisaría cuando el botón YA está cortado; una auditoría
// externa midió una holgura que venía bajando sin cruzar nunca el cero.
// Si algún formato queda en rojo con este umbral, la holgura real es
// demasiado chica para un dedo: no se baja el umbral, se agranda la holgura.
const HOLGURA_MINIMA_PX = 16;

// --- Ruleta: ayudas de los estados ----------------------------------------
// Fuerza el azar que decide ganador y final: crypto.getRandomValues saca antes
// los valores que el estado deje en `window.__azar` (se ejecuta en la página,
// antes de cargar nada).
function forzarAzar() {
  const real = crypto.getRandomValues.bind(crypto);
  window.__azar = [];
  crypto.getRandomValues = (a) => {
    if (window.__azar.length && a instanceof Uint32Array) { a[0] = window.__azar.shift(); return a; }
    return real(a);
  };
}

// Deja la rueda con N opciones («Opción 1»…) escribiéndolas en «Pegar lista».
async function ponerLista(pagina, n) {
  const cerrado = await pagina.evaluate(() => document.getElementById('ruleta-pegar-panel').hidden);
  if (cerrado) await pagina.click('#ruleta-pegar-toggle');
  await pagina.fill('#ruleta-opciones', Array.from({ length: n }, (_, i) => `Opción ${i + 1}`).join('\n'));
}

// Qué gajo señala el puntero según la matriz REAL del rotor y si su etiqueta
// es el texto del resultado. Con el reposo en marcha la matriz incluye el
// balanceo: RNF-03 garantiza que no saca al puntero del gajo.
async function coherenciaRueda(pagina) {
  const r = await pagina.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.getElementById('wheel-rotor')).transform);
    return {
      grados: (Math.atan2(m.b, m.a) * 180) / Math.PI,
      n: document.querySelectorAll('#wheel-slices path').length,
      texto: document.getElementById('ruleta-result-main').textContent,
    };
  });
  const gajo = gajoBajoPuntero(r.grados, r.n);
  const etiqueta = await pagina.evaluate((i) => document.querySelector(`#wheel-labels [data-i="${i}"]`)?.textContent ?? null, gajo);
  if (etiqueta !== r.texto) {
    return { gajo, error: `el puntero señala el gajo ${gajo} («${etiqueta}») con la rueda a ${r.grados.toFixed(2)}° y N=${r.n}, pero el resultado dice «${r.texto}»` };
  }
  return { gajo };
}

// RNF-05: la rueda entera (puntero incluido) dentro de la ventana y sin que el
// botón principal la tape.
async function ruedaEntera(pagina) {
  const rueda = await medirRect(pagina, '#wheel-box');
  const puntero = await medirRect(pagina, '#wheel-pointer');
  const boton = await medirRect(pagina, '#ruleta-girar');
  if (!rueda || !puntero || !boton) return { ok: false, mensaje: '#wheel-box, #wheel-pointer o #ruleta-girar no existen en el DOM' };
  const { ancho, alto } = await pagina.evaluate(() => ({ ancho: window.innerWidth, alto: window.innerHeight }));
  const dentro = puntero.top >= -TOLERANCIA_PX && rueda.left >= -TOLERANCIA_PX && rueda.right <= ancho + TOLERANCIA_PX
    && rueda.bottom <= alto + TOLERANCIA_PX && rueda.bottom <= boton.top + TOLERANCIA_PX;
  return {
    ok: dentro,
    mensaje: `rueda top=${puntero.top.toFixed(1)} (con el puntero) bottom=${rueda.bottom.toFixed(1)} left=${rueda.left.toFixed(1)} right=${rueda.right.toFixed(1)} ` +
      `en una ventana de ${ancho}×${alto}, botón top=${boton.top.toFixed(1)}: la rueda tiene que verse entera y sin tapar por el botón`,
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
import { crearReto, nuevoId } from '../../src/scripts/ppt-reto.js';
import { forma } from '../../src/scripts/dados-poliedros.js';
import { NORMAL } from '../../src/scripts/dados-fisica.js';
import { gajoBajoPuntero, leerEnlace } from '../../src/scripts/ruleta-logica.js';
import { readFileSync } from 'node:fs';
import { crearV2, urlV2, leerEnlace as leerEnlaceAmigo } from '../../src/scripts/amigo-secreto-enlace.js';

const ENLACE_V1 = JSON.parse(readFileSync(new URL('../../tests/fixtures/amigo-secreto-enlaces-v1.json', import.meta.url)))
  .casos.find((c) => c.forma === 'mas-como-espacio');
const ENLACE_V2_HASH = urlV2('', await crearV2({ nombre: 'Ñandú José 🎁', presupuesto: '50000' }, { aleatorio: (n) => new Uint8Array(n).fill(7) })).slice(1);
const SEL_NOMBRE_REVELADO = '#revealed-name';


// El aviso "Deshacer" es position:fixed. Si un ancestro tiene `transform`
// (.reveal.revealed), ese ancestro pasa a ser su bloque contenedor y el aviso
// se ancla al fondo de la sección en vez de al de la ventana: a 1280×720
// salía en top=762px, fuera de la pantalla. El aviso dura 7 s, así que se
// mide el mismo aviso en los dos tamaños sin volver a abrirlo.
async function avisoDentroDeLaVentana(pagina) {
  const fallos = [];
  for (const vp of [{ width: 1280, height: 720 }, { width: 360, height: 560 }]) {
    await pagina.setViewportSize(vp);
    await pagina.waitForTimeout(100);
    const r = await medirRect(pagina, '#ruleta-aviso');
    if (!r) { fallos.push(`${vp.width}×${vp.height}: #ruleta-aviso no existe en el DOM`); continue; }
    const dentro = r.top >= -TOLERANCIA_PX && r.left >= -TOLERANCIA_PX &&
      r.bottom <= vp.height + TOLERANCIA_PX && r.right <= vp.width + TOLERANCIA_PX;
    // Un aviso ya oculto (display:none) mide todo 0 y "cae dentro": sin esto
    // el test pasaría sin haber medido nada si el aviso expirara antes.
    if (r.bottom === 0 && r.right === 0) {
      fallos.push(`${vp.width}×${vp.height}: #ruleta-aviso ya estaba oculto al medir`);
      continue;
    }
    if (!dentro) {
      fallos.push(`${vp.width}×${vp.height}: #ruleta-aviso cae en top=${r.top.toFixed(0)} bottom=${r.bottom.toFixed(0)} ` +
        `left=${r.left.toFixed(0)} right=${r.right.toFixed(0)}, fuera de la ventana`);
    }
  }
  return {
    ok: !fallos.length,
    mensaje: fallos.join('; ') + ' -- algún ancestro con `transform` (.reveal) lo ancla a la sección en vez de a la ventana.',
  };
}

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
  // --- Ruleta ------------------------------------------------------------
  // Migrada al sistema editorial: la rueda es SVG + etiquetas HTML (Wheel.astro)
  // y ruleta.js solo la gira, escribe el resultado y crea las filas del editor
  // y del historial. Los estados que giran leen la matriz REAL del rotor y la
  // comparan con el texto del resultado (SDD de la ruleta, O2 y RNF-02).
  {
    // Modo foco (RF-12): oculta todo lo que no es la rueda, el resultado y el
    // botón. El interruptor vive en la herramienta, no en la cabecera.
    ruta: '/ruleta',
    nombre: 'modo-foco',
    clics: ['#ruleta-foco'],
    espera: 400,
    comprobar: [
      { sel: 'header', props: ['display'] },
      { sel: '.hub-section', props: ['display'] },
      { sel: '.seo-section', props: ['display'] },
      { sel: 'footer', props: ['display'] },
      { sel: '.ruleta-hero', props: ['display'] },
      { sel: '.ruleta-inputs', props: ['display'] },
      { sel: '.ruleta-hist', props: ['display'] },
      { sel: '.ruleta-tool', props: ['display', 'gridTemplateColumns'] },
      { sel: '#ruleta-foco', props: ['color'] },
      { sel: '#ruleta-girar', props: ['display', 'backgroundColor'] },
    ],
    // RF-12: Esc sale del modo foco, y el icono de la rueda lo dice
    invariante: async (pagina) => {
      const etiqueta = await pagina.getAttribute('#wheel-fullscreen', 'aria-label');
      await pagina.keyboard.press('Escape');
      const sigue = await pagina.evaluate(() => document.body.classList.contains('is-foco'));
      return { ok: !sigue && etiqueta === 'Salir del modo foco', mensaje: `modo foco: icono «${etiqueta}», tras Esc el foco sigue activo=${sigue} (se esperaba «Salir del modo foco» y que Esc lo quite)` };
    },
  },
  {
    // Ocultar una opción sin borrarla (RF-08): la fila se tacha y su punto se
    // vacía, y la rueda pierde ese gajo.
    ruta: '/ruleta',
    nombre: 'ocultar-opcion',
    clics: ['.ruleta-opt-row:nth-child(2) .ruleta-opt-vis'],
    espera: 250,
    comprobar: [
      { sel: '.ruleta-opt-row:nth-child(2) .ruleta-opt-text', props: ['color', 'textDecorationLine'] },
      { sel: '.ruleta-opt-row:nth-child(2) .ruleta-opt-dot', props: ['backgroundColor', 'borderTopWidth'] },
      { sel: '.ruleta-opt-row:nth-child(3) .ruleta-opt-dot', props: ['backgroundColor'] },
      { sel: '.ruleta-opt-row:nth-child(2) .ruleta-opt-vis', props: ['color'] },
    ],
    invariante: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        gajos: document.querySelectorAll('#wheel-slices path').length,
        etiqueta: document.getElementById('ruleta-etq-opciones').textContent,
        oculta: document.querySelectorAll('.ruleta-opt-row.is-oculta').length,
      }));
      const ok = r.gajos === 5 && r.oculta === 1 && r.etiqueta === 'Opciones · 5 de 6';
      return { ok, mensaje: `tras ocultar una de 6 opciones: ${r.gajos} gajos, ${r.oculta} fila(s) oculta(s), etiqueta «${r.etiqueta}» (se esperaban 5, 1 y «Opciones · 5 de 6»)` };
    },
  },
  {
    // Aviso «Deshacer» tras «Vaciar» (RF-09). El aviso es position: fixed: si
    // un ancestro tiene `transform` (.reveal.revealed), ese ancestro pasa a
    // ser su bloque contenedor y el aviso se ancla a la sección en vez de a la
    // ventana (a 1280×720 salía en top=762px, fuera de la pantalla).
    ruta: '/ruleta',
    nombre: 'deshacer-limpiar',
    viewport: { width: 1280, height: 720 },
    clics: ['#ruleta-vaciar'],
    esperarSelector: '#ruleta-aviso:not([hidden])',
    espera: 250,
    comprobar: [
      { sel: '#ruleta-aviso', props: ['display', 'position', 'zIndex'] },
      { sel: '#ruleta-aviso-deshacer', props: ['display', 'cursor', 'minHeight'] },
    ],
    // RNF-11: el aviso tiene que caer dentro de la ventana en escritorio
    // (1280×720) y en el móvil de referencia (360×560).
    invariante: avisoDentroDeLaVentana,
  },
  {
    // Reposo de /ruleta: sin pulsar nada, el resultado y el historial están
    // vacíos y los puntos de color de las filas heredan la paleta del objeto.
    ruta: '/ruleta',
    nombre: 'reposo',
    clics: [],
    comprobar: [
      { sel: '#ruleta-result', props: ['opacity'] },
      { sel: '.ruleta-hist-vacio', props: ['display', 'color'] },
      { sel: '#ruleta-borrar-hist', props: ['display'] },
      { sel: '#ruleta-girar', props: ['backgroundColor', 'color', 'borderRadius', 'height'] },
      { sel: '.ruleta-mode[aria-pressed="true"]', props: ['backgroundColor', 'fontWeight'] },
      { sel: '.ruleta-opt-row:nth-child(1) .ruleta-opt-dot', props: ['backgroundColor'] },
      { sel: '.ruleta-opt-count', props: ['display'] },
      { sel: '#ruleta-reiniciar', props: ['display'] },
      { sel: '#wheel-sound', props: ['display', 'width', 'height'] },
      { sel: '#wheel-slices path:nth-child(1)', props: ['fill', 'opacity'] },
    ],
    // El tic viene apagado (D1) y no se guarda nada hasta que el visitante toca algo.
    invariante: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        sonido: document.getElementById('wheel-sound').getAttribute('aria-pressed'),
        guardado: localStorage.getItem('decidelo_ruleta_sonido'),
        gajos: document.querySelectorAll('#wheel-slices path').length,
      }));
      const ok = r.sonido === 'false' && r.guardado === null && r.gajos === 6;
      return { ok, mensaje: `reposo: sonido aria-pressed=${r.sonido}, guardado=${r.guardado}, ${r.gajos} gajos (se esperaba apagado, sin guardar y 6)` };
    },
  },
  {
    // El h1 tiene que seguir en pantalla a 390px: antes de la migración,
    // `main.wrap { display: none }` bajo 859px lo sacaba del árbol de
    // accesibilidad entero y ningún test lo vigilaba.
    ruta: '/ruleta',
    nombre: 'h1-visible-390x844',
    viewport: { width: 390, height: 844 },
    clics: [],
    comprobar: [
      { sel: 'h1', props: ['display'] },
    ],
  },
  {
    // Giro de verdad (animado): al resolver `.finished` aparece el resultado,
    // el ganador se marca (contorno de 3 px, el resto atenuado, etiqueta 700)
    // y la fila entra en el historial.
    ruta: '/ruleta',
    nombre: 'girada',
    clics: ['#ruleta-girar'],
    // El giro dura 5–7 s más la anticipación y el aterrizaje: se espera al
    // resultado, no a un reloj.
    esperarSelector: '#ruleta-result.is-shown',
    espera: 300,
    comprobar: [
      { sel: '#ruleta-result', props: ['opacity', 'textAlign'] },
      { sel: '#ruleta-result-main', props: ['fontFamily', 'fontWeight', 'color', 'fontSize'] },
      { sel: '#ruleta-result-side', props: ['color', 'fontSize'] },
      { sel: '#ruleta-girar', props: ['backgroundColor', 'color'] },
      { sel: '#ruleta-historial li', props: ['display', 'borderBottomWidth'] },
      { sel: '#ruleta-borrar-hist', props: ['display'] },
      { sel: '#wheel-slices .is-ganador', props: ['strokeWidth', 'stroke'] },
      { sel: '#wheel-slices path:not(.is-ganador)', props: ['opacity'] },
      { sel: '#wheel-labels .is-ganador', props: ['fontWeight'] },
    ],
    invariante: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        boton: document.getElementById('ruleta-girar').textContent,
        filas: document.querySelectorAll('#ruleta-historial li:not(.ruleta-hist-vacio)').length,
        cuenta: document.getElementById('ruleta-hist-count').textContent,
        ganadores: document.querySelectorAll('#wheel-slices .is-ganador').length,
        desactivado: document.getElementById('ruleta-girar').disabled,
      }));
      const ok = r.boton === 'Girar otra vez' && r.filas === 1 && r.cuenta === '1 resultado' && r.ganadores === 1 && !r.desactivado;
      return { ok, mensaje: `tras girar: botón «${r.boton}», ${r.filas} fila(s) de historial, contador «${r.cuenta}», ${r.ganadores} gajo(s) ganador(es), desactivado=${r.desactivado}` };
    },
  },
  {
    // O2 / RNF-02: lo que enseña la rueda coincide con lo que dice el texto.
    // Lee la matriz real del rotor (incluido el balanceo de reposo), calcula
    // qué gajo queda bajo el puntero con la lógica pura y compara su etiqueta
    // con el resultado. Giros animados de verdad con los cuatro finales, tres con
    // suspenso y el normal: se fuerza el
    // azar que decide el ganador y el final (crypto.getRandomValues con una
    // cola), y se recarga entre giros porque «nunca dos finales distintos de
    // normal seguidos» los convertiría en normal. Cada giro dura unos 6 s, así
    // que son cuatro; los 30 de movimiento reducido van en el estado siguiente.
    ruta: '/ruleta',
    nombre: 'ganador-coincide-con-la-rueda',
    init: forzarAzar,
    verificarRelacion: async (pagina) => {
      const errores = [];
      const giros = [
        { n: 13, ganador: 4, final: 'casi', roll: 70 },
        { n: 2, ganador: 1, final: 'pelos', roll: 85 },
        { n: 6, ganador: 3, final: 'atras', roll: 97 },
        { n: 6, ganador: 2, final: 'normal', roll: 10 },
      ];
      for (const [k, g] of giros.entries()) {
        if (k > 0) await pagina.reload({ waitUntil: 'load' });
        await pagina.waitForTimeout(900); // que el calentamiento del plan no se coma el azar forzado
        await ponerLista(pagina, g.n);
        await pagina.evaluate(([ganador, roll]) => { window.__azar.push(ganador, roll); }, [g.ganador, g.roll]);
        await pagina.click('#ruleta-girar');
        await pagina.waitForSelector('#ruleta-result.is-shown', { timeout: 20000 });
        const usado = await pagina.evaluate(() => document.getElementById('wheel-box').dataset.final);
        const c = await coherenciaRueda(pagina);
        if (usado !== g.final) errores.push(`giro ${k + 1} (N=${g.n}): se forzó el final ${g.final} y salió ${usado}`);
        else if (c.error) errores.push(`giro ${k + 1} (N=${g.n}, final ${g.final}): ${c.error}`);
        else if (c.gajo !== g.ganador) errores.push(`giro ${k + 1} (N=${g.n}, final ${g.final}): el azar forzado eligió el gajo ${g.ganador} y el puntero señala el ${c.gajo}`);
      }
      return errores.length
        ? { ok: false, mensaje: errores.join('; ') }
        : { ok: true, mensaje: 'en 4 giros animados (los cuatro finales: normal, casi, por los pelos y vuelta atrás) el puntero señala el gajo del resultado' };
    },
  },
  {
    // Lo mismo con movimiento reducido (RF-14): 30 giros rápidos, con N = 1, 2
    // y 40 (el círculo entero, dos gajos de 180° y el máximo con etiquetas).
    ruta: '/ruleta',
    nombre: 'ganador-coincide-con-la-rueda-reducido',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      const errores = [];
      let giros = 0;
      for (const n of [1, 2, 40]) {
        await ponerLista(pagina, n);
        for (let k = 0; k < 10; k++) {
          await pagina.click('#ruleta-girar');
          await pagina.waitForFunction(() => !document.getElementById('ruleta-girar').disabled
            && document.getElementById('ruleta-result').classList.contains('is-shown'), null, { timeout: 5000 });
          giros++;
          const c = await coherenciaRueda(pagina);
          if (c.error) errores.push(`N=${n}, giro ${k + 1}: ${c.error}`);
        }
      }
      return errores.length
        ? { ok: false, mensaje: errores.slice(0, 5).join('; ') }
        : { ok: true, mensaje: `${giros} giros con movimiento reducido (N = 1, 2 y 40): el puntero señala siempre el gajo del resultado` };
    },
  },
  {
    // «¿Qué se decide?» (RF-03): el resultado lo repite debajo del ganador y
    // el historial lo guarda.
    ruta: '/ruleta',
    nombre: 'pregunta-en-resultado',
    contexto: { reducedMotion: 'reduce' },
    escribir: [{ sel: '#ruleta-pregunta', texto: '¿Quién friega?' }],
    clics: ['#ruleta-girar'],
    esperarSelector: '#ruleta-result.is-shown',
    verificarRelacion: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        lado: document.getElementById('ruleta-result-side').textContent,
        historial: document.querySelector('#ruleta-historial .ruleta-hist-para')?.textContent,
        guardada: localStorage.getItem('decidelo_ruleta_pregunta'),
      }));
      const ok = r.lado === '¿Quién friega?' && r.historial === '¿Quién friega?' && r.guardada === '¿Quién friega?';
      return { ok, mensaje: `resultado «${r.lado}», historial «${r.historial}», guardada «${r.guardada}» (se esperaba «¿Quién friega?» en las tres)` };
    },
  },
  {
    // «Quitar «X»» tras un resultado (RF-07): oculta la opción sin borrarla,
    // la rueda se repinta y el resultado vigente se oculta con ella (RF-06).
    ruta: '/ruleta',
    nombre: 'quitar-ganador',
    contexto: { reducedMotion: 'reduce' },
    clics: ['#ruleta-girar'],
    esperarSelector: '#ruleta-result.is-shown',
    verificarRelacion: async (pagina) => {
      await pagina.click('#ruleta-quitar');
      const r = await pagina.evaluate(() => ({
        ocultas: document.querySelectorAll('.ruleta-opt-row.is-oculta').length,
        filas: document.querySelectorAll('.ruleta-opt-row').length,
        gajos: document.querySelectorAll('#wheel-slices path').length,
        resultado: document.getElementById('ruleta-result').classList.contains('is-shown'),
        aviso: !document.getElementById('ruleta-aviso').hidden,
        boton: document.getElementById('ruleta-girar').textContent,
      }));
      const ok = r.ocultas === 1 && r.filas === 6 && r.gajos === 5 && !r.resultado && r.aviso && r.boton === 'Girar ruleta';
      return { ok, mensaje: `tras quitar al ganador: ${r.ocultas} oculta(s) de ${r.filas} filas, ${r.gajos} gajos, resultado visible=${r.resultado}, aviso=${r.aviso}, botón «${r.boton}»` };
    },
  },
  {
    // «Activar todas» (RF-08): visible solo con alguna oculta, activa todas, se
    // deshace devolviendo exactamente las ocultas de antes y, sin ocultas, no ocupa sitio.
    ruta: '/ruleta',
    nombre: 'activar-todas',
    contexto: { reducedMotion: 'reduce' },
    init: () => {
      localStorage.setItem('decidelo_ruleta_opciones', 'A\nB\nC\nD\nE\nF');
      localStorage.setItem('decidelo_ruleta_ocultas', JSON.stringify({ v: 2, indices: [1, 4, 5] }));
    },
    verificarRelacion: async (pagina) => {
      const leer = () => pagina.evaluate(() => {
        const b = document.getElementById('ruleta-activar').getBoundingClientRect();
        return {
          ocultas: [...document.querySelectorAll('.ruleta-opt-row')].flatMap((f, k) => (f.classList.contains('is-oculta') ? [k] : [])).join(','),
          gajos: document.querySelectorAll('#wheel-slices path').length,
          ocupa: b.width > 0 && b.height > 0,
        };
      });
      const a = await leer();
      await pagina.focus('#ruleta-activar'); // con teclado el botón tiene el foco: al desaparecer pasa a «Pegar lista»
      await pagina.click('#ruleta-activar');
      const b = await leer();
      const foco = await pagina.evaluate(() => document.activeElement.id);
      await pagina.click('#ruleta-aviso-deshacer');
      const c = await leer();
      // Maquetación de la cabecera con ocultas: ningún texto se parte (una línea) y sin scroll horizontal
      const cabecera = [];
      for (const vp of [{ width: 360, height: 640 }, { width: 320, height: 640 }]) {
        await pagina.setViewportSize(vp);
        await pagina.waitForTimeout(100);
        const m = await pagina.evaluate(() => {
          const lineas = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size; };
          // Los botones, pegados al borde derecho de la cabecera también en la 2.ª línea (ml-auto)
          const hueco = Math.round(document.querySelector('.ruleta-editor-head').getBoundingClientRect().right - document.getElementById('ruleta-pegar-toggle').getBoundingClientRect().right);
          return {
            hueco,
            lineas: lineas(document.getElementById('ruleta-etq-opciones')) + lineas(document.getElementById('ruleta-activar')) + lineas(document.getElementById('ruleta-pegar-toggle')),
            scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        if (m.lineas !== 3 || m.scroll > 0 || Math.abs(m.hueco) > 1) cabecera.push(`${vp.width}px: ${m.lineas} líneas de 3 textos, ${m.scroll}px de scroll horizontal, ${m.hueco}px entre los botones y el borde derecho`);
      }
      if (cabecera.length) return { ok: false, mensaje: `cabecera del editor con ocultas: ${cabecera.join('; ')}` };
      const ok = a.ocultas === '1,4,5' && a.ocupa && b.ocultas === '' && !b.ocupa && b.gajos === 6
        && c.ocultas === '1,4,5' && c.ocupa && c.gajos === 3 && foco === 'ruleta-pegar-toggle';
      return { ok, mensaje: `foco tras activar «${foco}»; ocultas antes «${a.ocultas}» (botón ${a.ocupa}), tras activar «${b.ocultas}» (botón ${b.ocupa}, ${b.gajos} gajos), tras deshacer «${c.ocultas}» (botón ${c.ocupa}, ${c.gajos} gajos)` };
    },
  },
  {
    // Con 130 opciones y 100 activas «Activar todas» no activa ninguna más (RF-01):
    // sin cambio ni «Deshacer», y el aviso del máximo sigue a la vista.
    ruta: '/ruleta',
    nombre: 'activar-todas-limite',
    contexto: { reducedMotion: 'reduce' },
    init: () => {
      localStorage.setItem('decidelo_ruleta_opciones', Array.from({ length: 130 }, (_, i) => `Op ${i + 1}`).join('\n'));
      localStorage.setItem('decidelo_ruleta_ocultas', JSON.stringify({ v: 2, indices: [] }));
    },
    verificarRelacion: async (pagina) => {
      const leer = () => pagina.evaluate(() => ({
        ocultas: document.querySelectorAll('.ruleta-opt-row.is-oculta').length,
        gajos: document.querySelectorAll('#wheel-slices path').length,
        max: !document.getElementById('ruleta-aviso-max').hidden,
        deshacer: !document.getElementById('ruleta-aviso').hidden,
        boton: !document.getElementById('ruleta-activar').hidden,
      }));
      const a = await leer();
      await pagina.click('#ruleta-activar');
      const b = await leer();
      const ok = a.ocultas === 30 && a.gajos === 100 && a.boton && b.ocultas === 30 && b.gajos === 100 && b.max && !b.deshacer && b.boton;
      return { ok, mensaje: `antes ${a.ocultas} ocultas/${a.gajos} gajos; tras pulsar ${b.ocultas} ocultas/${b.gajos} gajos, aviso de máximo=${b.max}, «Deshacer»=${b.deshacer}` };
    },
  },
  {
    // Modo Eliminar (SDD §6.14.3): el ganador se oculta solo como cambio
    // pendiente (RF-05): el resultado sigue sobre la rueda que giró (6 gajos)
    // y se repinta en la siguiente acción.
    ruta: '/ruleta',
    nombre: 'modo-eliminar',
    contexto: { reducedMotion: 'reduce' },
    antes: ['.ruleta-mode[data-modo="eliminar"]'],
    clics: ['#ruleta-girar'],
    esperarSelector: '#ruleta-result.is-shown',
    espera: 300,
    comprobar: [
      { sel: '.ruleta-mode[aria-pressed="true"]', props: ['backgroundColor', 'fontWeight'] },
      { sel: '.ruleta-opt-row.is-oculta .ruleta-opt-text', props: ['textDecorationLine', 'color'] },
      { sel: '#ruleta-aviso', props: ['display', 'position'] },
      { sel: '#ruleta-acciones-resultado', props: ['display'] },
    ],
    invariante: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        ocultas: document.querySelectorAll('.ruleta-opt-row.is-oculta').length,
        gajos: document.querySelectorAll('#wheel-slices path').length,
        boton: document.getElementById('ruleta-girar').textContent,
        lado: document.getElementById('ruleta-result-side').textContent,
        quitar: !document.getElementById('ruleta-quitar').hidden,
      }));
      const ok = r.ocultas === 1 && r.gajos === 6 && r.boton === 'Girar otra vez' && /^Se eliminó «.+» · quedan 5$/.test(r.lado) && !r.quitar;
      return { ok, mensaje: `modo Eliminar: ${r.ocultas} oculta(s), ${r.gajos} gajos, botón «${r.boton}», lado «${r.lado}», «Quitar» visible=${r.quitar}` };
    },
  },
  {
    // Modo Contar (SDD §6.14.3): cada opción acumula sus victorias en la lista
    // y en el historial.
    ruta: '/ruleta',
    nombre: 'modo-contar',
    contexto: { reducedMotion: 'reduce' },
    antes: ['.ruleta-mode[data-modo="contar"]'],
    clics: ['#ruleta-girar'],
    esperarSelector: '#ruleta-result.is-shown',
    espera: 300,
    comprobar: [
      { sel: '.ruleta-opt-count', props: ['display', 'color', 'fontSize'] },
      { sel: '#ruleta-reiniciar', props: ['display'] },
      { sel: '#ruleta-acciones-resultado', props: ['display'] },
    ],
    invariante: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        cuentas: [...document.querySelectorAll('.ruleta-opt-count')].map((c) => c.textContent),
        historial: document.querySelector('#ruleta-historial .ruleta-hist-op')?.textContent,
      }));
      const unaVictoria = r.cuentas.filter((c) => c === '×1').length === 1 && r.cuentas.filter((c) => c === '×0').length === 5;
      const ok = unaVictoria && /×1$/.test(r.historial ?? '');
      return { ok, mensaje: `modo Contar: cuentas ${r.cuentas.join(' ')}, historial «${r.historial}» (se esperaba un ×1 y cinco ×0, y el historial terminando en ×1)` };
    },
  },
  {
    // «Añadir opción» (SDD §6.14.5): Intro añade y deja el teclado abierto, es
    // decir, el foco se queda en el campo para escribir la siguiente.
    ruta: '/ruleta',
    nombre: 'anadir-opcion-teclado-abierto',
    viewport: { width: 390, height: 844 },
    verificarRelacion: async (pagina) => {
      await pagina.fill('#ruleta-nueva', 'Ramen');
      await pagina.press('#ruleta-nueva', 'Enter');
      const r = await pagina.evaluate(() => ({
        foco: document.activeElement?.id,
        valor: document.getElementById('ruleta-nueva').value,
        filas: document.querySelectorAll('.ruleta-opt-row').length,
        ultima: document.querySelector('.ruleta-opt-row:last-child .ruleta-opt-text')?.value,
        gajos: document.querySelectorAll('#wheel-slices path').length,
      }));
      const ok = r.foco === 'ruleta-nueva' && r.valor === '' && r.filas === 7 && r.ultima === 'Ramen' && r.gajos === 7;
      return { ok, mensaje: `tras añadir «Ramen» con Intro: foco en #${r.foco}, campo «${r.valor}», ${r.filas} filas (última «${r.ultima}»), ${r.gajos} gajos (se esperaba el foco en #ruleta-nueva, campo vacío, 7 filas y 7 gajos)` };
    },
  },
  {
    // Girar arrastrando (SDD §6.14.1): pointerdown, un arco con el puntero y
    // pointerup (Playwright los emite como eventos de puntero reales). Gira
    // una sola vez (el `click` que sigue al soltar se suprime) y el resultado
    // coincide con la rueda.
    ruta: '/ruleta',
    nombre: 'girar-arrastrando',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      const c = await pagina.evaluate(() => {
        const r = document.getElementById('wheel-box').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
      });
      await pagina.mouse.move(c.x + c.r * 0.7, c.y);
      await pagina.mouse.down();
      for (let k = 1; k <= 8; k++) {
        const a = (k * 12 * Math.PI) / 180;
        await pagina.mouse.move(c.x + c.r * 0.7 * Math.cos(a), c.y + c.r * 0.7 * Math.sin(a));
      }
      await pagina.mouse.up();
      await pagina.waitForSelector('#ruleta-result.is-shown', { timeout: 5000 });
      await pagina.waitForTimeout(300); // por si un segundo giro (el click suprimido) llegara tarde
      const filas = await pagina.evaluate(() => document.querySelectorAll('#ruleta-historial li:not(.ruleta-hist-vacio)').length);
      const coh = await coherenciaRueda(pagina);
      if (coh.error) return { ok: false, mensaje: `arrastrando: ${coh.error}` };
      return filas === 1
        ? { ok: true, mensaje: 'arrastrar la rueda gira una vez y el puntero señala el resultado' }
        : { ok: false, mensaje: `arrastrar la rueda produjo ${filas} resultados en el historial (se esperaba 1: el click tras soltar debe suprimirse)` };
    },
  },
  {
    // RNF-10: ir y volver (View Transitions re-lanzan `astro:page-load`) no
    // duplica listeners, y `astro:before-swap` suelta los de document.
    ruta: '/ruleta',
    nombre: 'ida-y-vuelta',
    contexto: { reducedMotion: 'reduce' },
    verificarRelacion: async (pagina) => {
      await pagina.goto(pagina.url().replace('/ruleta', '/moneda'), { waitUntil: 'load' });
      await pagina.goto(pagina.url().replace('/moneda', '/ruleta'), { waitUntil: 'load' });
      await pagina.evaluate(() => {
        document.dispatchEvent(new Event('astro:page-load'));
        document.dispatchEvent(new Event('astro:page-load'));
      });
      await pagina.click('#ruleta-girar');
      await pagina.waitForSelector('#ruleta-result.is-shown', { timeout: 5000 });
      await pagina.waitForTimeout(300);
      const filas = await pagina.evaluate(() => document.querySelectorAll('#ruleta-historial li:not(.ruleta-hist-vacio)').length);
      // Tras `astro:before-swap` el atajo ya no debe girar
      await pagina.evaluate(() => document.dispatchEvent(new Event('astro:before-swap')));
      await pagina.keyboard.press('Control+Enter');
      await pagina.waitForTimeout(500);
      const despues = await pagina.evaluate(() => document.querySelectorAll('#ruleta-historial li:not(.ruleta-hist-vacio)').length);
      const errores = [];
      if (filas !== 1) errores.push(`un giro tras volver y relanzar astro:page-load dejó ${filas} filas (se esperaba 1: listeners duplicados)`);
      if (despues !== 1) errores.push(`tras astro:before-swap, Ctrl+Intro todavía gira (${despues} filas)`);
      return errores.length ? { ok: false, mensaje: errores.join('; ') } : { ok: true, mensaje: 'ida y vuelta sin listeners duplicados ni vivos' };
    },
  },
  {
    // O5: nadie pierde su lista. Siembra el formato de antes del rediseño
    // (`ruleta_opciones`, `ruleta_ocultas` v1 con textos, `ruleta_titulo`)
    // antes de cargar y comprueba lista, ocultas y pregunta.
    ruta: '/ruleta',
    nombre: 'claves-viejas-migradas',
    init: () => {
      localStorage.setItem('ruleta_opciones', 'Ana\nLuis\nMarta');
      localStorage.setItem('ruleta_ocultas', JSON.stringify(['Luis']));
      localStorage.setItem('ruleta_titulo', '¿Quién friega?');
    },
    verificarRelacion: async (pagina) => {
      const r = await pagina.evaluate(() => ({
        textos: [...document.querySelectorAll('.ruleta-opt-text')].map((i) => i.value),
        ocultas: [...document.querySelectorAll('.ruleta-opt-row')].map((f) => f.classList.contains('is-oculta')),
        pregunta: document.getElementById('ruleta-pregunta').value,
        etiqueta: document.getElementById('ruleta-etq-opciones').textContent,
        gajos: document.querySelectorAll('#wheel-slices path').length,
        vieja: localStorage.getItem('ruleta_opciones'),
      }));
      const ok = r.textos.join('|') === 'Ana|Luis|Marta' && r.ocultas.join() === 'false,true,false'
        && r.pregunta === '¿Quién friega?' && r.etiqueta === 'Opciones · 2 de 3' && r.gajos === 2
        && r.vieja === 'Ana\nLuis\nMarta';
      return { ok, mensaje: `claves viejas: lista «${r.textos.join(', ')}», ocultas ${r.ocultas.join()}, pregunta «${r.pregunta}», etiqueta «${r.etiqueta}», ${r.gajos} gajos, clave vieja intacta=${r.vieja !== null}` };
    },
  },
  {
    // Compartir sin `navigator.share` (escritorio): copia un enlace que
    // `leerEnlace` lee igual (solo las activas y la pregunta) y avisa. Se
    // oculta una opción antes para comprobar que las ocultas no viajan.
    ruta: '/ruleta',
    nombre: 'compartir-copia',
    contexto: { permissions: ['clipboard-read', 'clipboard-write'] },
    init: () => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); },
    verificarRelacion: async (pagina) => {
      await pagina.fill('#ruleta-pregunta', '¿Quién friega?');
      await pagina.click('.ruleta-opt-row:nth-child(2) .ruleta-opt-vis');
      await pagina.click('#ruleta-compartir');
      await pagina.waitForSelector('#ruleta-aviso:not([hidden])', { timeout: 5000 });
      const r = await pagina.evaluate(async () => ({
        url: await navigator.clipboard.readText(),
        aviso: document.getElementById('ruleta-aviso-texto').textContent,
        deshacer: !document.getElementById('ruleta-aviso-deshacer').hidden,
        activas: [...document.querySelectorAll('.ruleta-opt-row:not(.is-oculta) .ruleta-opt-text')].map((i) => i.value),
      }));
      let leido = null;
      try { leido = leerEnlace(new URL(r.url).hash); } catch { /* url rota: leido queda en null */ }
      const ok = !!leido && leido.opciones.join('|') === r.activas.join('|') && r.activas.length > 0
        && leido.para === '¿Quién friega?' && r.aviso === 'Enlace copiado' && !r.deshacer;
      return { ok, mensaje: `enlace copiado «${r.url.replace(/^https?:\/\/[^/]+/, "")}», leído ${JSON.stringify(leido)}, activas ${JSON.stringify(r.activas)}, aviso «${r.aviso}» (con Deshacer: ${r.deshacer})` };
    },
  },
  {
    // Quien abre una ruleta compartida: opciones y pregunta cargadas, aviso
    // con «Deshacer», fragmento limpio, y «Deshacer» devuelve su lista propia.
    ruta: '/ruleta#para=%C2%BFQui%C3%A9n+friega%3F&opcion=Ana&opcion=Luis&opcion=Sof%C3%ADa',
    nombre: 'compartida-por-enlace',
    init: () => {
      // Su lista propia: solo en la primera carga (el init corre en cada navegación del contexto)
      if (!localStorage.getItem('decidelo_ruleta_pregunta')) localStorage.setItem('ruleta_opciones', 'Uno\nDos');
    },
    verificarRelacion: async (pagina) => {
      const leer = () => pagina.evaluate(() => ({
        opciones: [...document.querySelectorAll('.ruleta-opt-text')].map((i) => i.value),
        pregunta: document.getElementById('ruleta-pregunta').value,
        gajos: document.querySelectorAll('#wheel-slices path').length,
        aviso: document.getElementById('ruleta-aviso').hidden ? null : document.getElementById('ruleta-aviso-texto').textContent,
        hash: location.hash,
      }));
      await pagina.waitForSelector('#ruleta-aviso:not([hidden])', { timeout: 5000 });
      const a = await leer();
      await pagina.click('#ruleta-aviso-deshacer');
      const b = await leer();
      const ok = a.opciones.join('|') === 'Ana|Luis|Sofía' && a.pregunta === '¿Quién friega?' && a.gajos === 3
        && a.aviso === 'Se cargó la ruleta compartida' && a.hash === ''
        && b.opciones.join('|') === 'Uno|Dos' && b.pregunta === '' && b.gajos === 2 && b.aviso === null;
      return { ok, mensaje: `al abrir: ${JSON.stringify(a)}; tras Deshacer: ${JSON.stringify(b)}` };
    },
  },
  // La rueda entera (no solo el botón) en la primera pantalla de los tres
  // móviles de referencia y de un portátil de 1280×720 (RNF-05).
  ...[
    ...Object.entries(VIEWPORTS_MOVIL),
    ['portatil-1280x720', { width: 1280, height: 720 }],
  ].map(([nombre, viewport]) => ({
    ruta: '/ruleta',
    nombre: `rueda-entera-visible-${nombre}`,
    viewport,
    verificarRelacion: ruedaEntera,
  })),
  ...estadosAccionVisible('/ruleta', '#ruleta-girar'),
  ...estadosResponsive('/ruleta', '#ruleta-girar'),
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
  // Rediseño (SDD de amigo secreto): las fichas, las filas de enlaces y las de
  // la verificación se clonan de <template> con lo que escribe el visitante,
  // así que en reposo no existen y ninguna captura las ve.
  {
    ruta: '/amigo-secreto',
    nombre: 'sorteo-hecho',
    escribir: [{ sel: '#participants-textarea', texto: 'Ana\nBruno, 3001234567\nCarla\nDiego' }],
    clics: ['#btn-draw'],
    esperarSelector: '#links-list-container .link-row',
    espera: 600,
    comprobar: [
      { sel: '.participant-tag', props: ['display', 'borderRadius'] },
      { sel: '.link-row', props: ['display', 'flexDirection', 'alignItems'] },
      { sel: '.row-name', props: ['fontWeight', 'color'] },
      { sel: '.row-actions', props: ['display', 'gap'] },
      { sel: '#results-section', props: ['display'] },
      { sel: '#reveal-screen', props: ['display'] },
      { sel: '#matrix-tbody tr', props: ['display'] },
    ],
    // Cada fila lleva un enlace v2 que abre el nombre de alguien distinto de
    // quien lo recibe, y entre todos forman una sola cadena.
    invariante: async (pagina) => {
      const r = await pagina.evaluate(async () => {
        const s = JSON.parse(localStorage.getItem('decidelo_amigo_sorteo'));
        return s.enlaces.map((e) => ({ da: e.nombre, url: e.url }));
      });
      const mapa = new Map();
      for (const { da, url } of r) {
        const l = await leerEnlaceAmigo(url);
        mapa.set(da, l?.datos?.nombre);
      }
      let n = 0, actual = r[0].da;
      const vistos = new Set();
      while (!vistos.has(actual)) { vistos.add(actual); actual = mapa.get(actual); n++; }
      const ok = r.length === 4 && n === 4 && actual === r[0].da && [...mapa].every(([a, b]) => a !== b && b);
      return { ok, mensaje: `enlaces: ${JSON.stringify([...mapa])} (se esperaba una sola cadena de 4 sin nadie consigo mismo)` };
    },
  },
  {
    ruta: '/amigo-secreto',
    nombre: 'sorteo-hecho-movil',
    viewport: { width: 390, height: 844 },
    escribir: [{ sel: '#participants-textarea', texto: 'Ana\nBruno\nCarla\nDiego' }],
    clics: ['#btn-draw'],
    esperarSelector: '#links-list-container .link-row',
    espera: 600,
    comprobar: [
      { sel: '.link-row', props: ['flexDirection'] },
      { sel: '.row-actions', props: ['display'] },
    ],
  },
  {
    // Pasa el teléfono: una persona abre su sobre y queda tachada.
    ruta: '/amigo-secreto',
    nombre: 'pasa-el-telefono',
    viewport: { width: 390, height: 844 },
    escribir: [{ sel: '#participants-textarea', texto: 'Ana\nBruno\nCarla\nDiego' }],
    clics: ['#btn-draw', '#as-tab-telefono', '#as-empezar-telefono', '#as-tel-lista li:nth-child(2) button', '#as-tel-si'],
    esperarSelector: '#as-tel-sobre:not([hidden])',
    comprobar: [{ sel: '#as-telefono', props: ['display'] }],
    invariante: async (pagina) => {
      await pagina.click('#as-tel-env', { force: true });
      await pagina.waitForSelector('#as-tel-listo:not([hidden])', { timeout: 5000 });
      const nombre = (await pagina.textContent('#as-tel-nombre')).trim();
      await pagina.click('#as-tel-listo');
      const tachado = await pagina.evaluate(() => document.querySelector('#as-tel-lista li:nth-child(2) button').disabled);
      return { ok: Boolean(nombre) && nombre !== 'Bruno' && tachado, mensaje: `Bruno abrió «${nombre}» y quedó tachado=${tachado}` };
    },
  },
  {
    // RF-13: un sorteo guardado con el formato de antes se recupera con sus
    // URLs originales y su estado «enviado».
    ruta: '/amigo-secreto',
    nombre: 'recuperar-sorteo-viejo',
    init: `localStorage.setItem('amigo-secreto:ultimo-sorteo', ${JSON.stringify(JSON.stringify({
      date: 1764000000000, text: 'Ana\nBruno\nCarla', exclusions: '',
      matrixRows: [{ giverAnon: 'Participante #1', receiverAnon: 'Participante #2' }],
      links: [
        { name: 'Ana', contact: '', url: 'https://decidelo.app/amigo-secreto#revelar=JhcWBws%3D', sent: true },
        { name: 'Bruno', contact: '', url: 'https://decidelo.app/amigo-secreto#revelar=JwQRBQU%3D', sent: false },
        { name: 'Carla', contact: '', url: 'https://decidelo.app/amigo-secreto#revelar=JQsC', sent: false },
      ],
    }))})`,
    clics: ['[data-saved-restore]'],
    esperarSelector: '#links-list-container .link-row',
    comprobar: [{ sel: '.link-row[data-enviado="true"] [data-estado]', props: ['display'] }],
    invariante: async (pagina) => {
      const r = await pagina.evaluate(() => JSON.parse(localStorage.getItem('decidelo_amigo_sorteo'))?.enlaces);
      const ok = r?.[0]?.url === 'https://decidelo.app/amigo-secreto#revelar=JhcWBws%3D' && r[0].enviado === true;
      return { ok, mensaje: `sorteo recuperado: ${JSON.stringify(r?.[0])}` };
    },
  },
  {
    ruta: '/amigo-secreto#v=2&d=IAAAAAAA',
    nombre: 'enlace-danado',
    esperarSelector: '#reveal-screen:not([hidden])',
    comprobar: [{ sel: '#as-sobre-zona', props: ['display'] }],
    invariante: async (pagina) => {
      const titulo = (await pagina.textContent('#as-abrir-titulo')).trim();
      return { ok: titulo === 'Este enlace no funciona', mensaje: `un enlace dañado muestra «${titulo}»` };
    },
  },
  ...estadosAccionVisible('/amigo-secreto', '#btn-draw'),
  ...estadosResponsive('/amigo-secreto', '#btn-draw'),
  // Enlaces que ya están repartidos (SDD de amigo secreto §5.1): uno v1 fijo,
  // generado con el código de 2026 y con «+» convertido en espacio, que el
  // lector viejo no abría; y uno v2. Los dos tienen que abrir el sobre con
  // el nombre exacto.
  ...[
    { nombre: 'revelar-v1-fijo', hash: ENLACE_V1.url.split('#')[1], esperado: ENLACE_V1.nombre },
    { nombre: 'revelar-v2', hash: ENLACE_V2_HASH, esperado: 'Ñandú José 🎁' },
  ].map(({ nombre, hash, esperado }) => ({
    ruta: `/amigo-secreto#${hash}`,
    nombre,
    esperarSelector: SEL_NOMBRE_REVELADO,
    comprobar: [{ sel: SEL_NOMBRE_REVELADO, props: ['display'] }],
    invariante: async (pagina) => {
      await pagina.waitForFunction((sel) => document.querySelector(sel)?.textContent.trim().length > 0, SEL_NOMBRE_REVELADO);
      const texto = (await pagina.textContent(SEL_NOMBRE_REVELADO)).trim();
      return { ok: texto === esperado, mensaje: `el enlace abre «${texto}» (se esperaba «${esperado}»)` };
    },
  })),
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
