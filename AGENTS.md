# AGENTS.md

Guía para cualquier agente de código que trabaje en este repositorio.
Es agnóstica de herramienta: sirve para Claude Code, Cursor, Codex, Copilot
o cualquier otro. Si tu herramienta busca un archivo con otro nombre, ese
archivo debe limitarse a apuntar aquí en lugar de duplicar contenido.

Este archivo es la guía de trabajo: stack, comandos, arquitectura, reglas
del proyecto. La referencia visual — tokens, escala de espaciado y
tipografía, la estética del sitio y cómo decidir entre CSS propio y
utilidad de Tailwind — vive en **[DESIGN.md](./DESIGN.md)**.

---

## Qué es este proyecto

**Decídelo.app** (https://decidelo.app) es un hub de herramientas de decisión
aleatoria: ruleta, dados, moneda, equipos, amigo secreto, temporizador y
otras. Todo se ejecuta en el navegador del visitante. No hay backend, ni
base de datos, ni cuentas de usuario, ni estado en servidor.

El repositorio se llama `RuletaWeb` por razones históricas: nació siendo
solo la ruleta. El nombre del producto es Decídelo.app.

### Contexto de uso real

La herramienta con tracción medible es **amigo secreto**, con uso
concentrado en Colombia y picos de cientos de visitas diarias incluso fuera
de temporada. La temporada fuerte es noviembre y diciembre. Buena parte del
tráfico es móvil, en redes que no siempre son rápidas: **el peso de página
es un requisito de producto, no una optimización opcional.**

---

## Stack

| Pieza | Versión | Notas |
|---|---|---|
| Astro | 7.x | `output: 'static'`, sin adaptador SSR |
| Tailwind CSS | 4.x | Plugin de Vite, en convivencia con CSS propio |
| @astrojs/sitemap | 3.x | Sitemap filtrado, ver más abajo |
| sharp | 0.35.x | Optimización de imágenes en build |
| wrangler | 4.x | Solo para desarrollo y despliegue manual |

No hay framework de UI (ni React, ni Vue, ni Svelte). La interactividad es
**JavaScript vanilla** en `src/scripts/`. Esto es deliberado: mantiene el
sitio en HTML estático que carga rápido en móvil. **No introduzcas un
framework de UI sin que se haya pedido explícitamente.**

### Comandos

```bash
npm run dev          # servidor de desarrollo
npm run build        # build de producción a dist/
npm run preview      # previsualiza el build con Astro
npm run preview:cf   # previsualiza en el runtime real de Cloudflare
npm run deploy       # build + despliegue manual con wrangler
npm test             # build + paridad de tokens + snapshots de CSS
npm run test:update  # reescribe la línea base de snapshots
npm run test:visual  # compara capturas contra main (lento, dos builds)
npm run test:estado  # estilos computados tras pulsar (modo foco, pestañas)
```

No hay linter. Los tests que hay vigilan el CSS, que es lo único que puede
romperse en silencio en un sitio sin backend, y corren en CI en cada push.

### Qué comprueban los tests

`scripts/token-parity.mjs` compara los tokens de `:root` en `global.css`
con los del `@theme` de `tailwind.css`. Los nombres no coinciden entre los
dos archivos, así que la correspondencia va escrita en el propio script. Si
cambias un color en un sitio y no en el otro, falla.

`scripts/class-collisions.mjs` avisa cuando una clase del proyecto se llama
igual que una utilidad de Tailwind. Como las utilidades se importan sin capa
para poder ganarle a `global.css`, en un empate de especificidad gana
Tailwind y la clase propia deja de hacer lo que dice, sin error de build. Las
colisiones ya revisadas están en la constante `ACEPTADAS` del script, cada
una con su motivo. Hubo una sexta, `.container`, que no era
inofensiva: la utilidad de Tailwind pisaba el `max-width: 1200px` del
proyecto con su propia escala. Se resolvió renombrando la clase propia a
`.wrap`, que es lo que hay que hacer con una colisión de verdad: quitarle
el nombre disputado a uno de los dos, no taparla con especificidad.

`scripts/css-snapshot.mjs` recoge, página por página, todas las reglas que
el navegador va a aplicar, y las compara con `tests/css-snapshots/`. Recoge
tanto las hojas enlazadas con `<link>` como el `<style>` que Astro inlinea:
con `inlineStylesheets: 'auto'`, una hoja que baja de 4 KB deja de existir
como archivo y viaja dentro del HTML. **Mirar solo `dist/_astro/*.css`
engaña**: una página puede quedarse sin su `.css` y estar perfecta.

Los selectores scopeados por Astro se guardan con `[S]` en lugar del hash
`data-astro-cid-XXXX`, que cambia cada vez que se edita el archivo.

`scripts/estado-dom.mjs` es el único que mira estados que hay que provocar:
pulsa el botón de modo foco y la pestaña de gestionar, y compara los estilos
computados con `tests/estado-dom.json`. Cubre el fallo que ningún otro test
ve: cuando una regla deja de encontrar su elemento —por ejemplo al mover una
sección a un componente, que le cambia el hash de scope de Astro— el CSS se
sigue emitiendo igual, así que los snapshots no notan nada, pero el elemento
deja de recibir la regla. Corre en CI.

**No uses capturas de píxeles para estados de la home.** Se intentó: la
marquesina y el logo tienen animaciones infinitas y la ruleta es un canvas
cuyo ángulo depende del momento, así que dos capturas del mismo commit
diferían en miles de píxeles. Los estilos computados sí son estables. Y cada
estado necesita su propio contexto de navegador: el modo foco se recuerda, y
compartir contexto lo filtraba al estado siguiente.

`scripts/visual-diff.mjs` compara píxeles, que es lo que los otros dos no
hacen: construye la rama de referencia en un worktree aparte, fotografía las
13 páginas a 390, 768, 1280 y 1536px con Playwright, y señala dónde cambia
la imagen. **No guarda capturas de referencia en el repositorio**: serían
megabytes que caducan a cada retoque, así que la referencia se construye en
el momento. Cuesta dos builds, por eso no está en `npm test` ni en CI; se
lanza a mano con `npm run test:visual` antes de migrar una página.

Dos cosas que hace a propósito y conviene saber. Bloquea toda la red
externa, así que las capturas no llevan la tipografía real de Google Fonts
ni los anuncios: la comparación es justa porque las dos versiones se
capturan igual, pero no sirve para juzgar la tipografía. Y marca a mano los
elementos `.reveal` con `.revealed`, porque el observador de scroll no se
dispara en una captura de página completa.

Si un cambio de CSS es intencionado, revisa el diff que imprime el test
regla por regla y luego `npm run test:update`. Actualizar la línea base sin
leerla convierte el test en decoración.

---

## Arquitectura

```
src/
  pages/          Una ruta por herramienta (index.astro es la ruleta)
  scripts/        La lógica de cada herramienta, JS vanilla, un archivo por página
  components/     Header, Footer, HubGrid, SeoArticle, AdSlot
  layouts/        Layout.astro (base) y BlogPost.astro
  content/blog/   52 posts en Markdown, organizados por categoría
  assets/blog/    Imágenes de cabecera, procesadas por Astro
  lib/            Utilidades compartidas
  styles/         global.css (sistema propio) y tailwind.css (capa Tailwind)
  data/           adsenseEditorial.ts, listas de slugs editoriales
```

---

## Reglas del proyecto

### 1. Imágenes: siempre en `src/assets/`, nunca en `public/`

Astro **no procesa nada que esté en `public/`**: lo copia crudo. Una imagen
puesta ahí se sirve como el PNG de 1 MB que es. En `src/assets/` se sirve
como AVIF/WebP con `srcset` responsive, y la diferencia real medida en este
proyecto fue de **762 KB a 22 KB** por imagen en móvil.

Usa el componente `<Picture>` de `astro:assets` con `formats={['avif','webp']}`
y `fallbackFormat="webp"`. Si dejas que el fallback sea el formato original,
Astro emite también el PNG sin comprimir.

`src/lib/heroImages.ts` traduce las rutas del frontmatter de los posts
(`/blog/x.png`) a metadatos de imagen. Es lo que evita tener que reescribir
los 52 archivos de contenido. Si añades una imagen de blog, basta con
dejarla en `src/assets/blog/` y referenciarla con la misma convención.

**Cuidado:** el JSON-LD y las etiquetas Open Graph necesitan una URL
absoluta ya generada, no un `srcset`. Usa `getSocialImageUrl()` de
`heroImages.ts`. Referenciar `.src` del asset original obliga a Astro a
emitir el PNG pesado aunque ningún navegador vaya a descargarlo.

### 2. Tailwind convive con el CSS existente, no lo reemplaza

`src/styles/tailwind.css` está montado de una forma poco habitual y a
propósito. Léelo antes de tocarlo; lleva las razones escritas dentro. En
resumen:

- **No se importa el preflight.** Reseteaŕia el diseño que `global.css` ya
  define a mano.
- **Las utilidades se importan sin capa.** El CSS existente no está en
  capas, y en la cascada lo que no está en capa gana a lo que sí. Si las
  utilidades estuvieran en `@layer utilities`, `class="p-4"` perdería
  siempre contra `global.css`.
- **Los tokens están duplicados a propósito** entre `:root` de `global.css`
  y `@theme` de `tailwind.css`, con los mismos valores. Si cambias un color
  o un radio, **cámbialo en los dos sitios** o el sistema de diseño se parte
  en dos. Hay un test que lo comprueba (`npm run test:tokens`). La tabla de
  equivalencias completa y cómo decidir entre CSS propio y utilidad están
  en [DESIGN.md](./DESIGN.md).
- **`tests/` está excluido del rastreo** con `@source not`. Tailwind 4
  detecta las fuentes rastreando el proyecto salvo lo ignorado por git, y
  los snapshots contienen CSS compilado con nombres de clase dentro:
  sin esa exclusión, Tailwind genera utilidades que nadie usa y el snapshot
  acaba alimentando al build que vigila.

Las páginas de herramientas siguen con su CSS propio y su bloque `<style>`.
La migración a Tailwind es gradual, una herramienta a la vez, verificando
visualmente cada una. No hagas una migración masiva.

### 3. Despliegue: Cloudflare Workers desde `main`

**Todo push a `main` va a producción automáticamente.** No hay staging. El
repositorio está enlazado a Cloudflare, que construye y publica solo.

En `wrangler.jsonc`, el campo `name` es `azares` — un nombre heredado que
**no coincide con el del producto y aun así no debe cambiarse**. Es el
Worker real al que está atado el dominio. Renombrarlo crearía un Worker
nuevo y vacío y dejaría decidelo.app apuntando al viejo.

No hay workflows de GitHub Actions y no hacen falta.

### 4. El sitemap está filtrado a mano

`astro.config.mjs` contiene una lista explícita de URLs de blog que sí
entran al sitemap, heredada de un intento de aprobación en AdSense. Hay 52
posts pero no todos se indexan. Si añades un post y quieres que Google lo
vea, tienes que añadirlo también a esa lista y a `src/data/adsenseEditorial.ts`.

### 5. Vulnerabilidades de npm

`npm audit` reporta avisos en `svgo` y `miniflare`. Ambos son dependencias
transitivas de `astro` y `wrangler` en sus últimas versiones, solo se usan
en build y desarrollo, y **nada de eso llega al navegador**: las únicas
dependencias de producción son `astro` y `@astrojs/sitemap`, y el resultado
del build es HTML estático. No fuerces `npm audit fix --force`: rompería
Astro sin ganar seguridad real.

---

## Cómo se trabajan estos proyectos

El propietario aplica la misma secuencia a todos sus sitios. Cuando trabajes
en uno, ubica en qué fase está antes de proponer nada:

1. **Actualizar el stack** a versiones actuales, y dejar el build verde.
2. **Convertir el proyecto en agente integrado.**
3. **Hacer el sitio legible para LLMs**, de forma que un modelo pueda
   recorrer y entender el contenido sin fricción.
4. **Analizar Search Console y Bing Webmaster Tools** para subir el CTR.

Google Search Console y Cloudflare Web Analytics ya están configurados y con
datos. No propongas instalarlos.

### Otros proyectos del mismo propietario

Fuente AI · Cuida a tu perro viejo · Hora 3:24. Siguen esta misma secuencia.

---

## Convenciones

- **Todo el contenido de cara al usuario va en español**, incluyendo textos
  de interfaz y los mensajes de commit.
- Los comentarios en código explican **por qué**, no qué. Este repositorio
  tiene varias decisiones contraintuitivas y todas llevan su razón escrita
  al lado.
- Confirma antes de mergear a `main`: es producción directa.
