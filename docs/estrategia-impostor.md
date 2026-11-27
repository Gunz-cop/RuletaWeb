# Estrategia de posicionamiento del impostor

Estado: **plan, no ejecutado** (salvo el texto de la página, que ya está
aplicado). Datos de Ubersuggest consultados el **27 de noviembre de 2026**,
en español, para Colombia (2170), México (2484) y España (2724). Los volúmenes
son estimaciones y cada palabra se midió en un mes distinto: sirven para
ordenar, no para prometer cifras.

## 1. Lo que dicen los datos

**Es un tema de temporada, y la temporada apenas empieza.** El juego fue viral
en noviembre y diciembre de 2025 y cayó en 2026:

| Búsqueda | Pico | Valle | Último dato |
|---|---|---|---|
| «impostor online» (España) | 49.500 (dic. 2025) | 2.900 (sep.–oct. 2026) | 14.800 (nov. 2026) |
| «juego del impostor» (México) | 27.100 (dic. 2025) | 1.900 (jun.–ago. 2026) | 6.600 (sep. 2026) |
| «juego del impostor» (Colombia) | 12.100 (nov.–dic. 2025) | 1.300 (may.–jun. 2026) | 3.600 (jul. 2026) |

Si el patrón se repite, diciembre y enero son varias veces mayores que hoy.
Posicionar una página lleva semanas: lo que se publique ahora llega justo a
tiempo, y lo que se publique a mitad de diciembre llega tarde.

**España es el mercado grande** (más que Colombia y México juntos). Por eso el
texto usa «móvil» y «celular».

**La competencia es débil donde importa.** En España los cinco primeros
resultados de «impostor online» son sitios pequeños (autoridad de dominio entre
5 y 18). En Colombia, los primeros son fichas de Google Play: ninguna ofrece
jugar en el navegador.

**«A distancia» y «videollamada» casi no se buscan** (10 a 30 búsquedas al mes).
Es un buen argumento dentro del texto, pero no una palabra para posicionar.

## 2. Qué palabra va en cada sitio

| Palabra | Colombia | México | España | Va en |
|---|---|---|---|---|
| juego del impostor | 3.600 | 6.600 | 12.100 | Página (H1, intro) |
| impostor online | 2.400 | 1.300 | 14.800 | Página (título, texto) |
| juego del impostor online | 590 | 1.300 | 2.400 | Página (título) |
| juego impostor online | 320 | 260 | 2.900 | Página (texto) |
| el impostor online | 260 | 170 | 1.900 | Página (texto) |
| jugar al impostor online | — | 30 | 880 | Página (texto) |
| juego del impostor palabras | 110 | 590 | 880 | Página + guía de palabras |
| juego del impostor gratis | 170 | 210 | 590 | Página (título, texto) |
| juego del impostor app | — | 320 | 390 | Página (sección «¿Hay app?») |
| impostor online con amigos | — | — | 210 | Página (título, intro) |
| cómo es / cuál es el juego del impostor | — | — | 260 c/u | Guía de reglas |
| palabras para el juego del impostor | — | — | 210 | Guía de palabras |

**No perseguir:** «juego del impostor de mesa / cartas / físico» (buscan un
producto físico; dificultad 33 a 36) ni nada con «apk», «descargar» o «premium».

Regla del sitio (skill `decidelo-textos`): una consulta, una página. La página
del impostor es dueña de todo lo de la tabla marcado «Página»; las guías del
blog **enlazan** a ella en vez de repetir su título.

## 3. Artículos de blog que llevan a la página

Carpeta nueva `src/content/blog/impostor/`. Recordatorio de AGENTS.md (regla 4):
cada guía nueva tiene que añadirse también a la lista de `astro.config.mjs` y a
`src/data/adsenseEditorial.ts`, o no entra al sitemap. Cada una sigue la skill
`decidelo-textos` (fuentes verificadas, enlace a la herramienta).

| # | Título de trabajo | Palabra principal | Por qué |
|---|---|---|---|
| 1 | Cómo se juega al impostor: reglas y ejemplo de una ronda | cómo es el juego del impostor | Pregunta informativa que se repite (260 en España) |
| 2 | Palabras para el juego del impostor: ideas por categoría | palabras para el juego del impostor | 880 en España + 590 en México; **usar palabras distintas a las del juego**, que son secretas |
| 3 | Cuántos impostores poner según el número de jugadores | cuántos impostores | Respalda la tabla de la página con ejemplos de 5, 12 y 22 personas |
| 4 | Juego del impostor sin app: cómo jugar con tu grupo desde el navegador | juego del impostor app | Capta a quien busca «app» (320 y 390) y le ofrece la alternativa |
| 5 | Juego del impostor en Navidad y Año Nuevo: ideas para la cena familiar | juego del impostor para la familia | Estacional: debe publicarse en la primera semana de diciembre |
| 6 | Juego del impostor para reuniones de trabajo y equipos remotos | juego del impostor para equipos | Poca demanda, pero es el caso real del propietario y encaja con la categoría «Oficina y trabajo» |
| 7 | Cómo ganar al impostor: estrategias para el impostor y para el grupo | cómo ganar el juego del impostor | Contenido que se comparte y que se puede trocear en publicaciones |

Orden recomendado por tiempo: **1, 2 y 5 primero** (más demanda y 5 caduca),
luego 4 y 3.

## 4. Estrategias de microblogging

Pensadas para X, Threads, Bluesky y Mastodon (textos cortos con enlace).
**No hay estadísticas propias del impostor todavía**: ninguna de estas ideas
trae un resultado garantizado. Mide antes de repetir.

**Formatos que se pueden repetir**

1. **Hilo de reglas en 5 publicaciones**, una por paso («1. Crea la sala…»), con
   el enlace solo en la última. Se reutiliza el texto de «Cómo se juega».
2. **Encuesta rápida** con una duda real del juego: «Con 12 jugadores, ¿cuántos
   impostores pondrías? 1 / 2 / 3». Genera respuestas y, después, material para
   la guía 3.
3. **El reto de la pista**: se publica una categoría («Comida») y se pide una
   pista de una palabra en las respuestas. **Nunca publicar una palabra real del
   juego**, que son secretas.
4. **Grabación corta de pantalla**: tocar la tarjeta del rol y que aparezca la
   palabra o «IMPOSTOR» (con una partida de prueba, no de usuarios reales).
5. **Truco de la semana**, uno de los cinco de la página, en una sola
   publicación.
6. **Responder a quien pregunta** «¿qué app para el impostor?» con una respuesta
   útil y diciendo que la página es nuestra. Sin menciones masivas ni respuestas
   repetidas: las plataformas lo tratan como spam.
7. **Caso real**, solo si es verdad y con permiso: p. ej. el grupo de 22
   compañeros de trabajo que probó la herramienta.

**Calendario sugerido (4 semanas, a ajustar con los datos)**

| Semana | Foco |
|---|---|
| 1 (desde ya) | Hilo de reglas + grabación de la tarjeta de rol |
| 2 | Encuesta de impostores + artículo 1 y 2 publicados |
| 3 | Reto de la pista + «Navidad y Año Nuevo» (artículo 5) |
| 4 | Truco de la semana + resumen de lo que más funcionó |

**Textos listos para adaptar** (≤ 280 caracteres, con el enlace al final):

- «¿Quieres jugar al impostor con tus amigos sin pasarte el celular? Creas una sala, compartes el código y cada uno ve su palabra en su móvil. Gratis y sin app. https://decidelo.app/impostor»
- «Con 22 personas, 45 segundos por turno son 16 minutos por vuelta. Con 30, son 11. Truco para jugar al impostor con grupos grandes. https://decidelo.app/impostor»
- «Pista para el impostor: escucha antes de hablar. En un turno tardío tienes más información que en uno temprano.»
- «¿Cuántos impostores pondrías con 12 jugadores? 1 · 2 · 3 (encuesta). Cuéntanos tu regla.»

**Cuidados**

- **Enlaces con parámetros** (`?utm_source=x`): no crean páginas duplicadas. El
  canónico se escribe al construir el sitio (`https://decidelo.app/impostor`,
  comprobado en `dist/`) y no cambia con la URL con la que se abra la página.
  Lo que **no** he comprobado es si Cloudflare Web Analytics enseña esos
  parámetros: antes de montar una campaña, abrir un enlace de prueba y mirar
  si aparece. Mientras tanto, los referentes (X, Threads, Bluesky) bastan para
  saber de dónde viene la gente.
- **Etiquetas**: antes de usar `#JuegoDelImpostor` u otras, buscarlas en la propia
  red y ver si se usan; aquí no se ha podido comprobar.
- **Vocabulario**: nada de «suerte», «premio» ni «apuesta» (skill
  `decidelo-textos`): la página es para jugar y decidir, no un sitio de azar.
- **Nada de cuentas falsas ni reseñas inventadas.**

## 5. Cómo se mide

- **Search Console**: consultas que ya traen impresiones a `/impostor` y su
  posición. Con pocas impresiones el efecto tarda semanas en notarse; hay que
  decirlo antes de sacar conclusiones.
- **Canibalización**: si una guía del blog y la página reciben impresiones por
  la misma consulta, se decide una dueña (skill `decidelo-textos`, regla 5).
- **Cloudflare Web Analytics**: visitas a `/impostor` y referentes (X, Threads,
  Bluesky).
- **Revisar el 15 de diciembre**: si la demanda sube como el año pasado, subir
  el ritmo de publicaciones; si no, parar y repensar.
