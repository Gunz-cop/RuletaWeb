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
    ruta: '/',
    nombre: 'reposo',
    clics: [],
    comprobar: [
      // Contraste del anterior: sin pulsar nada, nada está oculto.
      { sel: '.hero', props: ['display'] },
      { sel: '.hub-section', props: ['display'] },
      { sel: '.header-inner', props: ['justifyContent'] },
      { sel: '#tab-manage-content', props: ['display'] },
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
];
