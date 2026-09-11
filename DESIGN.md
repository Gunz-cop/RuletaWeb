# DESIGN.md

Referencia visual de Decídelo.app: qué tokens existen, qué escala de espaciado
y tipografía se usa, cómo se ve la estética del sitio y cómo decidir entre
CSS propio y utilidad de Tailwind al tocar una página.

Este archivo documenta el **qué** (el sistema de diseño tal y como existe hoy
en el código). La guía de trabajo — stack, tests, arquitectura, reglas del
proyecto — vive en **[AGENTS.md](./AGENTS.md)**; léelo primero si vas a tocar
código. No dupliques contenido entre los dos: si algo es "cómo trabajar",
va en AGENTS.md; si es "cómo se ve o qué valor tiene", va aquí.

---

## Los tokens viven duplicados a propósito

Hay dos archivos de tokens con los mismos valores y nombres distintos:

- `src/styles/global.css` — variables en `:root`, consumidas por el CSS
  propio de cada página (`var(--accent-mint)`, `var(--radius-lg)`, etc.).
- `src/styles/tailwind.css` — el mismo valor otra vez dentro de `@theme`,
  que es lo que le da a Tailwind sus utilidades (`bg-mint`, `rounded-lg`).

No es un descuido: es la forma en que este proyecto hace convivir CSS propio
y Tailwind sin que Tailwind gane la cascada por accidente (la razón completa
está escrita en los comentarios de `tailwind.css`). El coste es que **cambiar
un valor implica tocar los dos archivos**, y hay un test que lo vigila
(`npm run test:tokens`, vía `scripts/token-parity.mjs`). Si añades un token
nuevo, decide primero si de verdad hace falta una utilidad de Tailwind para
él: si no, con `global.css` basta y no hay nada que duplicar.

### Tabla de equivalencias

| Valor | `global.css` (`:root`) | `tailwind.css` (`@theme`) | Utilidad |
|---|---|---|---|
| `#07070a` | `--bg-body` | `--color-ink` | `bg-ink` |
| `#0f0f15` | `--bg-surface` | `--color-surface` | `bg-surface` |
| `#14141d` | `--bg-surface-alt` | `--color-surface-alt` | `bg-surface-alt` |
| `#1c1c27` | `--bg-surface-hover` | `--color-surface-hover` | `bg-surface-hover` |
| `#222230` | `--bg-elevated` | `--color-elevated` | `bg-elevated` |
| `#ff5e62` | `--accent-coral` | `--color-coral` | `text-coral` / `bg-coral` |
| `#00f2fe` | `--accent-mint` (alias `--accent-cyan`) | `--color-mint` | `text-mint` / `bg-mint` |
| `#b366ff` | `--accent-purple` | `--color-purple` | `text-purple` / `bg-purple` |
| `#ff9966` | — | `--color-peach` | `text-peach` / `bg-peach` |
| `#f0f0f5` | `--text-primary` | `--color-ink-primary` | `text-ink-primary` |
| `#8b8b9e` | `--text-secondary` | `--color-ink-secondary` | `text-ink-secondary` |
| `#5a5a6e` | `--text-tertiary` | `--color-ink-tertiary` | `text-ink-tertiary` |
| `#ef4444` | `--accent-danger` | `--color-danger` | `text-danger` |
| `#39ff14` | `--accent-success` | `--color-success` | `text-success` |
| `6px / 12px / 16px / 24px` | `--radius-sm/md/lg/xl` | `--radius-sm/md/lg/xl` | `rounded-sm/md/lg/xl` |
| sombras | `--shadow-sm/md/lg` | `--shadow-sm/md/lg` | `shadow-sm/md/lg` |
| tipografías | `font-family` a mano en cada regla | `--font-sans` / `--font-display` | `font-sans` / `font-display` |

Lo que **no** está duplicado porque no tiene equivalente de utilidad directo:
`--card-border` (borde por defecto de tarjeta, `rgba(255,94,98,0.08)`),
`--accent-gradient` (el degradado de marca, ver más abajo) y `--transition`
(`all 0.3s cubic-bezier(0.4,0,0.2,1)` — coincide exactamente con
`transition-all duration-300 ease-in-out` de Tailwind si necesitas
reproducirlo con utilidades).

---

## Escala de espaciado

El proyecto no define una escala propia de espaciado: usa directamente la
de Tailwind (`--spacing: 0.25rem`, así que `p-6` = 1.5rem = 24px, `gap-12` =
3rem = 48px, etc.) tanto en utilidades como, de facto, en los valores en rem
que aparecen sueltos por el CSS propio del sitio. Antes de escribir un valor
arbitrario (`p-[1.3rem]`), comprueba si el múltiplo de 0.25rem más cercano
ya existe en la escala — casi siempre lo hace y evita inflar la hoja de
utilidades con una regla que nadie más va a reutilizar.

Radios y sombras (`--radius-*`, `--shadow-*`) están definidos explícitamente
en los dos archivos de tokens porque el tema por defecto de Tailwind ya trae
esos mismos nombres con otros valores; redefinirlos es lo que hace que
`rounded-lg` y `var(--radius-lg)` signifiquen lo mismo.

## Escala de tipografía

Tampoco hay una escala tipográfica cerrada: los tamaños de fuente del sitio
son valores en rem elegidos caso por caso (0.72rem, 0.82rem, 0.85rem,
0.9rem, 1.05rem, 1.15rem, 1.45rem...), no una progresión regular tipo
`text-sm/base/lg`. Esto es intencionado en el sentido de que así nació el
sitio, pero tiene una consecuencia práctica: como estos tamaños no
coinciden con la escala de Tailwind, cada uno que migres a una utilidad
arbitraria (`text-[0.82rem]`) genera una regla nueva en la hoja de
utilidades **compartida por todo el sitio**, no solo por la página que la
usa. Ver la sección "CSS propio vs. utilidad" más abajo — esto es la razón
principal para dejar la tipografía fina en CSS.

Dos familias, cargadas desde Google Fonts en `Layout.astro`:
- **Inter** (`--font-sans`, utilidad `font-sans`) — texto de cuerpo.
- **Outfit** (`--font-display`, utilidad `font-display`) — titulares,
  nombres de tarjeta, cualquier texto en mayúscula o con peso 700+.

---

## La estética: "arcade neón"

Fondo casi negro (`--bg-body: #07070a`), tarjetas ligeramente más claras
(`--bg-surface`, `--bg-surface-alt`) con un borde apenas visible
(`--card-border`, 8% de opacidad) y acentos saturados que hacen de neón:
coral, menta y púrpura. El degradado de marca
(`--accent-gradient: linear-gradient(135deg, #ff9966 0%, #ff5e62 50%, #b366ff 100%)`)
aparece como barra superior en las tarjetas principales, en botones de
llamada a la acción y en el efecto de letra capital de los posts del blog.

### Patrones recurrentes

**Tarjeta base** (`.game-board`, `.history-card`, `.blog-post-card`,
`.sticky-sidebar-card`...): fondo `--bg-surface` o `--bg-surface-alt`,
borde `--card-border`, `border-radius` de `--radius-md` o `--radius-lg`,
`box-shadow` de `--shadow-md` o `--shadow-lg`. Las tarjetas "principales" de
cada página suelen llevar una barra de 3-4px en `--accent-gradient` como
`::before` absoluto — es un pseudo-elemento con fondo en degradado, así que
vive en CSS, no como utilidad (ver más abajo).

**Botones**: `.primary-btn`/`.btn-spin` (fondo en degradado, texto oscuro,
para la acción principal de cada herramienta), `.secondary-btn` (fondo
translúcido blanco al 5%), `.danger-btn` (rojo translúcido). Los CTA dentro
de contenido (`.tool-cta`) reutilizan el mismo degradado que las barras de
tarjeta.

**Acentos de texto**: `--accent-mint` para enlaces y etiquetas info,
`--accent-coral` para blockquotes y variantes de alerta suave,
`--accent-purple` como tercer acento en botones/iconos. Un badge o tag
(`.tag-badge`) es texto del color de acento sobre un fondo del mismo color
al 6% de opacidad y borde al 15% — ese patrón (texto sólido / fondo muy
translúcido / borde algo menos translúcido, los tres del mismo color) se
repite en varios sitios y vale la pena reconocerlo antes de inventar uno
nuevo.

**Reveal on scroll** (`.reveal`, `.reveal-scale`, `.slide-up` +
`.delay-1`…`.delay-9`): animaciones de entrada compartidas desde
`global.css`, no se reinventan por página.

---

## Cómo decidir entre CSS propio y utilidad de Tailwind

Esta es la pregunta que te vas a hacer en cada línea al migrar una página.
Reglas, en orden:

1. **¿La regla tiene un gradiente, `@keyframes`, o una pseudo-clase/elemento
   con `content`?** CSS propio. No hay utilidad de Tailwind para
   `background: var(--accent-gradient)` ni para animaciones con keyframes
   propios, y forzarlo con valores arbitrarios no ahorra nada.

2. **¿La regla apunta a HTML que no está en el `.astro` que estás editando**
   (contenido Markdown vía `:global()`, HTML inyectado por JS)?
   CSS propio, sin excepción: no hay marcado propio donde poner una clase.

3. **¿Es tipografía fina** — un `font-size`/`line-height`/`letter-spacing`
   en un valor que no está en la escala de espaciado de Tailwind (no es
   múltiplo limpio de 0.25rem) y que no se repite en ningún otro sitio?
   CSS propio. Cada valor arbitrario de este tipo (`text-[0.82rem]`,
   `tracking-[0.08em]`) es una regla nueva en la hoja de utilidades
   **compartida por todo el sitio** — la paga hasta la página que menos
   tiene que ver con la que estás migrando. Esto ya pasó migrando
   `BlogPost.astro`: mover la tipografía fina a utilidades encareció
   `amigo-secreto` (que ni siquiera renderiza ese layout) más del doble de
   lo que costó mover solo el layout/espaciado/color. Ver AGENTS.md,
   sección de tests de CSS, para cómo medirlo.

4. **¿Un selector con clase scopeada por Astro convive con `.wrap` (u otra
   clase compartida) en el mismo elemento, y su padding/margin tiene algún
   lado puesto a `0` a propósito?** Cuidado antes de migrar: el selector
   scopeado (`.clase[data-astro-cid-xxx]`) tiene más especificidad que una
   clase suelta como `.wrap`, así que puede estar anulando silenciosamente
   una propiedad de `.wrap` en ese elemento. Migrar solo esa regla a una
   utilidad (que no repite el mismo `0`) deja de anular esa propiedad y
   cambia el layout sin que ningún diff de una sola regla lo delate. Antes
   de dar por buena una migración así, compara con `getComputedStyle` en
   el navegador (o con el visual diff) que el resultado final es idéntico,
   no solo que la regla migrada "se ve razonable" aislada.

5. **Si nada de lo anterior aplica — es layout (flex/grid/gap), espaciado
   en la escala de Tailwind, color por token, radio o sombra ya existentes
   — usa la utilidad.** Es el caso normal y es el que de verdad aprovecha
   Tailwind: no hay que inventar nombre de clase, es grep-eable, y si el
   valor coincide con uno que ya usa otra página no añade una sola regla
   nueva a la hoja compartida.

6. **Nunca partas una regla entre CSS y clases.** Si una única regla mezcla
   una propiedad "utilidad-worthy" (color, spacing de escala) con una
   fine-typography o un valor que debe quedarse en CSS por las razones de
   arriba, la regla entera se queda en CSS. Un selector medio en cada sitio
   es más difícil de leer que cualquiera de las dos opciones puras — y es
   la manera más fácil de dejar un valor a medio migrar sin que se note.

### Verificación

`npm run test:visual` compara píxeles contra `main` en 4 anchos. Un cambio
de **tamaño de página** (no solo de píxeles) en ese test — aunque sea de
pocos px — casi siempre significa que una regla que "se veía igual" leída
aislada, cambió el layout real. Investígalo con `getBoundingClientRect()` /
`getComputedStyle()` en el navegador antes de asumir que es ruido menor.

---

Para el resto — comandos, arquitectura de carpetas, reglas de imágenes,
despliegue, qué comprueba cada test — ver **[AGENTS.md](./AGENTS.md)**.
