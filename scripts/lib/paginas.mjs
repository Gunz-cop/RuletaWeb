/**
 * Las páginas que vigilan los tests, en un solo sitio.
 *
 * Estuvieron duplicadas entre css-snapshot y visual-diff, y se desincronizaron:
 * las dos legales estaban en los snapshots pero no en las capturas, así que una
 * migración que solo tocaba esas dos páginas dio "cero diferencias" sin haber
 * mirado ninguna de las dos. Un verde que no significa nada es peor que un rojo.
 *
 * Los 52 posts del blog comparten BlogPost.astro, así que vigilar uno cubre el
 * layout sin meter 52 entradas casi idénticas.
 */
export const PAGINAS = [
  'index', 'ruleta', 'amigo-secreto', 'dados', 'equipos', 'moneda', 'numeros',
  'piedra-papel-tijera', 'si-o-no', 'temporizador',
  'contacto', 'sobre', 'politica-privacidad', 'terminos-condiciones',
  'blog', 'blog/moneda/decision-moneda',
  'blog/amigo-secreto/amigo-secreto-online-guia',
  'blog/equipos/dinamicas-de-grupo-aleatoriedad-equipos',
  'blog/temporizador/metodo-pomodoro-tdah-temporizador',
  'blog/si-o-no/desbloqueo-oraculo',
];

/** La misma lista como rutas del sitio: 'index' es '/'. */
export const RUTAS = PAGINAS.map((p) => (p === 'index' ? '/' : `/${p}`));
