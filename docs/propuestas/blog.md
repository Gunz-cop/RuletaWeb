# Propuesta: blog con contenido editorial de valor

**Estado hoy.** 30 artículos en `src/content/blog/` repartidos por
herramienta (ruleta, equipos, temporizador, sí o no, amigo secreto). Hay que
auditar antes de escribir.

**Auditoría (primer paso):**

- Diseño de `src/pages/blog/index.astro` y `[...slug].astro` frente al
  sistema editorial: tipografía de lectura, ancho de línea, índice, autor,
  fecha de actualización, tiempo de lectura.
- Calidad: artículos delgados, sin fuentes o con temas forzados (p. ej.
  «tarot sí o no», «IA para decisiones de carrera»), solapamientos que se
  canibalizan, títulos que prometen lo que no dan.
- SEO técnico: JSON-LD `Article` y `BreadcrumbList`, canónicas, imágenes,
  enlaces internos a la herramienta, sitemap.
- Search Console: qué artículos tienen impresiones y cuáles nunca las
  tuvieron.

**Después:**

- Por cada artículo: **mejorar, fusionar o retirar** (con redirección 301).
- Línea editorial: guías prácticas con experiencia propia, datos medidos
  (p. ej. la uniformidad del sorteo, el sesgo de la ruleta vieja) y fuentes
  verificables, como el texto de las herramientas (`decidelo-textos`).
- Plantilla con índice, «Pruébalo» con la herramienta incrustada o enlazada,
  FAQ y fecha de revisión.
