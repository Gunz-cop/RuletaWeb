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
    nombre: 'reposo',
    clics: [],
    comprobar: [
      // Contraste del anterior: sin pulsar nada, nada está oculto.
      { sel: '.hero', props: ['display'] },
      { sel: '.hub-section', props: ['display'] },
      { sel: '.header-inner', props: ['justifyContent'] },
      { sel: '#tab-manage-content', props: ['display'] },
    ],
  },
];
