---
name: decidelo-herramienta
description: Procedimiento para crear una herramienta nueva de Decídelo.app o migrar una existente (ruleta, dados, equipos, números…) al sistema editorial, con Tailwind donde toca y mobile first. Úsala antes de tocar cualquier página de src/pages/ que sea una herramienta, o su script en src/scripts/, o cuando pidan "rediseñar", "migrar", "modernizar" o "que se vea como la moneda". Manda sobre las skills de diseño de terceros de .claude/skills/.
---

# Crear o migrar una herramienta de Decídelo.app

Esta skill no define el estándar: lo **aplica**. El estándar vive en dos
archivos y hay que leerlos antes de escribir nada:

- `AGENTS.md`: stack, tests, reglas 2 (Tailwind), 6 (JS de herramientas) y
  7 (precedencia de skills).
- `DESIGN.md`: "Color: qué usar para qué", "Responsive: mobile first",
  "Anatomía de una página de herramienta" y "Cómo decidir entre CSS propio y
  utilidad de Tailwind".

Si algo de esta skill contradice esos archivos, ganan ellos y hay que
corregir esta skill en el mismo commit.

La implementación de referencia es la moneda: `src/pages/moneda.astro`,
`src/components/Coin.astro`, `src/scripts/moneda.js`. Ábrela y cópiale la
estructura antes de escribir la tuya.

## 1. Auditar antes de tocar

Anota qué tiene hoy la herramienta:

- Qué parte del `<style>` es layout, espaciado o color de token (irá a
  utilidades), y qué parte es tipografía fina, degradado, 3D o estados que
  pone el JS (se queda en CSS propio).
- Colores del legado arcade (coral, menta, púrpura, `--accent-gradient`,
  glow, `text-shadow` de neón): todos desaparecen.
- Qué genera el JS con `innerHTML`: el marcado largo se muda al `.astro`.
- Qué guarda en `localStorage` y con qué claves: el formato viejo se tiene
  que seguir leyendo.
- Dónde termina el botón principal a 393×659px (móvil de referencia).
- Qué estados cubre ya `scripts/lib/estados.mjs` para esta página: si una
  clase o un id que usan desaparece, el estado se tiene que actualizar, no
  borrar.

## 2. Construir

Sigue la anatomía de DESIGN.md en este orden: hero corto → entradas del
usuario → objeto (componente propio en `src/components/`) → resultado →
acción principal → historial → `AdSlot` / `SeoArticle` / `HubGrid`.

Checklist de marcado y estilo:

- [ ] Layout, espaciado de la escala y colores por token como utilidades,
      **mobile first**: base = móvil, `sm:` = 640px en adelante.
- [ ] Lo que se queda en CSS propio usa `@media (max-width: 639px)`, nunca
      otro corte.
- [ ] Un único acento (`--accent-warm` / `bg-warm`). Nada de coral, menta,
      púrpura ni degradados fuera del objeto ilustrado.
- [ ] Newsreader cargada con su `<link>` en `slot="head"` de la página si
      el `<h1>` usa `<em>`.
- [ ] Campos de texto de 16px o más; foco visible en `--accent-warm`.
- [ ] Sin emojis como iconos, sin badges de color, sin tarjetas con borde
      por elemento (listas divididas por `--divider-line`).
- [ ] Nombres de clase propios con prefijo de la herramienta (`coin-`,
      `dice-`…) para no chocar con utilidades de Tailwind.
- [ ] No uses `padding: X 0` en un elemento que también lleva `.wrap`.

Checklist de JS (regla 6 de AGENTS.md):

- [ ] Un archivo en `src/scripts/`, inicializado en `DOMContentLoaded` y
      `astro:page-load` con marca `dataset.ready`.
- [ ] `crypto.getRandomValues`; `element.animate()` y resultado al resolver
      `.finished`; `prefers-reduced-motion`.
- [ ] `localStorage` en `try/catch`, claves `decidelo_<herramienta>_<dato>`,
      lectura del formato viejo.
- [ ] Sin sonidos ni celebraciones; resultado en las palabras del usuario.
- [ ] El JS no añade clases de Tailwind: usa clases de estado propias
      (`is-shown`).

## 3. Tests nuevos en `scripts/lib/estados.mjs`

Cada herramienta migrada añade como mínimo:

```js
{
  ruta: '/<herramienta>',
  nombre: '<accion-hecha>',            // p. ej. 'lanzada', 'girada'
  escribir: [/* entradas de ejemplo */],
  clics: ['#<boton-principal>'],
  esperarSelector: '<algo que solo existe tras el resultado>',
  comprobar: [/* resultado y filas creadas por el JS */],
},
{
  ruta: '/<herramienta>',
  nombre: 'accion-principal-visible-393x659',
  viewport: VIEWPORT_MOVIL_REFERENCIA,
  verificarRelacion: accionPrincipalVisible('#<boton-principal>'),
},
```

Si el invariante de móvil falla, compacta el hero o el objeto en móvil. No
bajes el umbral ni cambies el viewport.

## 4. Verificar

```bash
npm test                      # build + tokens + colisiones + snapshots
npm run test:update           # solo si el diff de snapshots es el cambio buscado; revísalo
npm run test:estado           # estados tras interactuar + invariante móvil
npm run test:estado:update    # solo tras revisar que las diferencias son las esperadas
```

En este contenedor Playwright necesita
`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (o la
versión que haya en `/opt/pw-browsers`) para `test:estado`.

Además, a mano con `npm run build && npx astro preview`:

- 393×659 y 1280×900: usar la herramienta varias veces y comprobar que el
  resultado mostrado coincide con lo que enseña el objeto.
- Sin scroll horizontal a 360px.
- Que las entradas del usuario sobreviven a una recarga.
- Mide la hoja compartida (`dist/_astro/Layout.*.css`, con gzip) antes y
  después, y di cuánto creció en el commit.

## 5. Documentar en el mismo commit

- DESIGN.md: añade la herramienta a "Estado de la migración". Si
  introdujiste un patrón nuevo (otro tipo de objeto, otro control), añádelo
  a "Anatomía" en vez de dejarlo solo en el código.
- Si añadiste un token de color que usan dos o más páginas: `global.css`,
  `tailwind.css`, la tabla de equivalencias y la tabla de roles de DESIGN.md,
  y el mapa de `scripts/token-parity.mjs`.
- Mensaje de commit en español.
