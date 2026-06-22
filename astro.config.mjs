import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const adsenseReadyBlogUrls = new Set([
  'https://decidelo.app/blog/ruleta/ruleta-de-nombres-para-profesores',
  'https://decidelo.app/blog/numeros/como-hacer-sorteos-justos',
  'https://decidelo.app/blog/ruleta/ruleta-retos',
  'https://decidelo.app/blog/amigo-secreto/amigo-secreto-online-guia',
  'https://decidelo.app/blog/equipos/formar-grupos-de-trabajo-clase',
  'https://decidelo.app/blog/equipos/como-hacer-equipos-equilibrados-deportes',
  'https://decidelo.app/blog/dados/juegos-de-mesa-dados-virtuales',
  'https://decidelo.app/blog/dados/dados-dnd',
  'https://decidelo.app/blog/dados/dados-virtuales-sistemas-rol',
  'https://decidelo.app/blog/moneda/decision-moneda',
  'https://decidelo.app/blog/moneda/cara-o-cruz-lanzamiento-probabilidad',
  'https://decidelo.app/blog/moneda/cara-o-cruz-ciencia',
  'https://decidelo.app/blog/numeros/sorteo-rifa',
  'https://decidelo.app/blog/numeros/organizar-sorteo-rifa-redes-sociales',
  'https://decidelo.app/blog/temporizador/dinamicas-aula-temporizador-aleatorio',
  'https://decidelo.app/blog/temporizador/patata-caliente',
  'https://decidelo.app/blog/si-o-no/preguntas-divertidas-oraculo-si-o-no',
  'https://decidelo.app/blog/piedra-papel-tijera/reglas-variantes-lagarto-spock',
  'https://decidelo.app/blog/si-o-no/bola-8-decisiones-binarias-neurologia',
  'https://decidelo.app/blog/temporizador/juegos-de-mesa-temporizador-aleatorio',
  'https://decidelo.app/blog/equipos/dinamicas-de-grupo-aleatoriedad-equipos',
  'https://decidelo.app/blog/ruleta/juegos-reuniones-familiares-ruleta',
  'https://decidelo.app/blog/piedra-papel-tijera/arbitro-esports',
  'https://decidelo.app/blog/temporizador/ley-parkinson-procrastinacion-teletrabajo',
  'https://decidelo.app/blog/temporizador/metodo-pomodoro-tdah-temporizador',
  'https://decidelo.app/blog/dados/juegos-de-mesa-clasicos-era-digital',
  'https://decidelo.app/blog/dados/juegos-de-beber-con-dados',
  'https://decidelo.app/blog/equipos/scrum-agile-division-equipos-tareas',
  'https://decidelo.app/blog/amigo-secreto/cultura-organizacional-dinamicas-gratitud-remoto',
  'https://decidelo.app/blog/ruleta/herramientas-digitales-gratuitas-estudiantes',
  'https://decidelo.app/blog/si-o-no/fatiga-de-decision-y-oraculo',
  'https://decidelo.app/blog/amigo-secreto/algoritmos-tradiciones-intercambio-regalos',
  'https://decidelo.app/blog/piedra-papel-tijera/teoria-de-juegos-y-psicologia',
  'https://decidelo.app/blog/piedra-papel-tijera/como-ganar-piedra-papel-o-tijera',
  'https://decidelo.app/blog/piedra-papel-tijera/teoria-de-juegos-resolucion-disputas',
  'https://decidelo.app/blog/equipos/actividades-teambuilding-teletrabajo',
  'https://decidelo.app/blog/si-o-no/ia-toma-decisiones-carrera-profesional',
  'https://decidelo.app/blog/temporizador/entrenamiento-reaccion',
]);

export default defineConfig({
  site: 'https://decidelo.app',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/blog/') || page === 'https://decidelo.app/blog' || adsenseReadyBlogUrls.has(page),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
