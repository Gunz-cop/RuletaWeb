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
| `#e2905a` | `--accent-warm` | `--color-warm` | `text-warm` / `bg-warm` |
| `6px / 12px / 16px / 24px` | `--radius-sm/md/lg/xl` | `--radius-sm/md/lg/xl` | `rounded-sm/md/lg/xl` |
| sombras | `--shadow-sm/md/lg` | `--shadow-sm/md/lg` | `shadow-sm/md/lg` |
| tipografías | `font-family` a mano en cada regla | `--font-sans` / `--font-display` | `font-sans` / `font-display` |

Lo que **no** está duplicado porque no tiene equivalente de utilidad directo:
`--card-border` (borde por defecto de tarjeta, `rgba(255,94,98,0.08)`),
`--accent-gradient` (el degradado de marca, ver más abajo), `--transition`
(`all 0.3s cubic-bezier(0.4,0,0.2,1)` — coincide exactamente con
`transition-all duration-300 ease-in-out` de Tailwind si necesitas
reproducirlo con utilidades) y `--divider-line` (`rgba(240,240,245,0.12)`,
la línea de 1px del sistema editorial — ver más abajo).

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

Una tercera, cargada solo en las páginas migradas que la usan (hoy la home,
la moneda y el oráculo, cada una con su propio `<link>` en `slot="head"`; no en
`Layout.astro` — ver "La estética: sistema editorial" más abajo):
- **Newsreader**, itálica — acento de énfasis dentro de un titular en
  `Outfit` (`<em>`), nunca cuerpo de texto completo.

---

## La estética: sistema editorial (en migración)

El sitio nació con una estética "arcade neón" (fondo casi negro, tarjetas
con barra en degradado coral/menta/púrpura, glow, partículas difuminadas).
Esa estética leía como una web de casino/gambling en vez de una caja de
herramientas para decidir en grupo, así que se está migrando a un sistema
editorial: la misma base oscura del sitio (no cambia — sigue siendo la
paleta "tinta nocturna" de la tabla de arriba), pero **sin degradados, sin
glow, sin partículas y con un único acento cálido** en vez del trío neón.

**Estado de la migración**: ya usan el sistema nuevo la home (`index.astro`
y sus componentes `HomeHero`, `HomeUseCases`, `HomeHowItWorks`,
`HomeToolsSection`), `HubGrid` (el bloque "más herramientas", compartido
por las 11 páginas que lo importan), la moneda (`moneda.astro` +
`Coin.astro`), que es además la **implementación de referencia** de una
herramienta migrada (ver "Anatomía de una página de herramienta"), y el
oráculo sí o no (`si-o-no.astro` + `OracleBall.astro`), la primera
herramienta con casi todo el marcado en utilidades de Tailwind. El resto
de herramientas (la ruleta, los dados...) sigue con los botones y tarjetas
en degradado de la estética anterior — migrarlas es una tarea aparte, una
herramienta a la vez, porque toca UI interactiva con sus propios tests de
estado (`npm run test:estado`). El procedimiento está en la skill del
proyecto `decidelo-herramienta` (`.claude/skills/decidelo-herramienta/`).

**Excepción: objetos ilustrados.** La moneda de `Coin.astro` sí lleva
degradados (reflejo cónico, estriado del borde, relieve con `text-shadow`):
es la representación de un objeto físico, no UI, y sin reflejos el metal se
lee como un disco plano. La regla de "sin degradados" aplica a botones,
tarjetas y texto; la paleta de latón vive como variables locales
(`--metal-*`) dentro del componente, no como tokens globales.

Las manos de piedra, papel o tijera (`HandShape.astro`) son la otra
salida de la excepción: **cuando un objeto no sale bien dibujado a mano en
SVG, se usan imágenes** servidas con `<Picture>` en AVIF/WebP (regla 1 de
AGENTS.md), con su origen documentado junto al archivo en `src/assets/`.
Aquí son fotogramas propios generados con ChatGPT (ver
`src/assets/ppt/ORIGEN.md`, con el prompt de estilo y el procesado):

- **Varios fotogramas, no un vídeo ni un GIF**: el puño y cinco pasos hacia
  papel y hacia tijera. El JS enciende uno cada vez (`.is-on`) al ritmo de
  la Web Animations API. El penúltimo se pasa un poco: es el rebote.
- **Se piden en una sola hoja** (cuadrícula 3×2 de 512 px, fondo
  transparente, muñeca en el mismo punto): generados por separado salen
  con luz y proporciones distintas y la animación tiembla.
- **Se procesan antes de entrar al repo**: limpiar el alfa (los
  generadores dejan ruido casi transparente en el fondo), alinear por la
  muñeca y bajar a 384 px.
- Amarillo neutro: no asigna tono de piel. **Una mano nunca se apaga con
  opacidad ni filtro** (perdedor, botón desactivado): parecería otro tono
  de piel. Se marca con posición y tamaño (el perdedor baja y se encoge, el
  ganador crece un poco) y con el acento en su nombre.

### El acento: `--accent-warm`

Un solo acento (`#e2905a`, terracota cálido — ver tabla de tokens) hace lo
que antes hacían tres colores neón a la vez: texto enfatizado, iconos,
estado activo, hover. No hay degradado de marca en las piezas migradas: si
una regla necesitaría `--accent-gradient`, en el sistema editorial se
resuelve con `--accent-warm` liso.

### Patrones recurrentes (piezas migradas)

**Sin cards.** Donde la estética anterior usaba una tarjeta con fondo y
borde por elemento, el sistema editorial usa **listas divididas por un
borde de 1px** (`--divider-line`, `rgba(240,240,245,0.12)`) — ver
`HubGrid.astro` (`.hub-list` / `.hub-row`) o el rail de tres columnas de
`HomeHowItWorks.astro` (`.how-rail` / `.how-step`, con `border-left` entre
columnas en vez de una tarjeta por paso). Mucho espacio negativo en vez de
relleno de color.

**Tipografía como protagonista.** Títulos grandes (`clamp(2.4rem, 6vw,
4.4rem)` en el hero) en `Outfit` — la misma familia de titulares que ya
usaba el sitio — con una palabra de énfasis en cursiva `Newsreader`
(`<em>`, color `--accent-warm`). `Newsreader` se carga solo en la home
(`index.astro` la pasa a `Layout` vía `slot="head"`) porque hoy es la
única pieza que la usa; si se migra otra página, su `<link>` de Google
Fonts va con ella, no se sube a `Layout.astro` de forma global hasta que
la mayoría de páginas la necesiten.

**Botones como texto subrayado**, no pastillas rellenas: `.hero-cta` es
texto en negrita con `border-bottom: 1px solid`, sin fondo ni sombra. La
flecha SVG se desplaza `3px` al hover en vez de brillar.

**Numeración en vez de badges de color.** El índice de herramientas usa
`01`/`02`/`03`... (`font-variant-numeric: tabular-nums`) donde antes había
un icono en un chip de color; el estado ("Disponible" / "Próximamente" /
"Estás aquí") es texto plano en `--text-tertiary`, no un badge con fondo
translúcido.

### Patrones recurrentes (piezas aún sin migrar)

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
nuevo. Al migrar una pieza de estas al sistema editorial, este patrón se
reemplaza por texto plano en `--text-tertiary` (ver arriba), no por la
misma forma en el color nuevo.

**Reveal on scroll** (`.reveal`, `.reveal-scale`, `.slide-up` +
`.delay-1`…`.delay-9`): animaciones de entrada compartidas desde
`global.css`, no se reinventan por página. Esto no cambia con la
migración — las piezas nuevas siguen usando `.reveal`.

---

## Color: qué usar para qué

La tabla de equivalencias de arriba dice **qué colores existen**. Esta dice
**cuál usar en cada papel**. En una pieza nueva o migrada solo se usan los
de la columna "Sistema editorial"; los de la última fila existen porque las
páginas sin migrar todavía los necesitan.

| Papel | Sistema editorial (usar) | CSS propio | Utilidad |
|---|---|---|---|
| Fondo de página | tinta nocturna `#07070a` | `--bg-body` | `bg-ink` |
| Superficie elevada (solo si hace falta separar un objeto) | `#0f0f15` / `#14141d` | `--bg-surface` / `--bg-surface-alt` | `bg-surface` / `bg-surface-alt` |
| Texto principal | `#f0f0f5` | `--text-primary` | `text-ink-primary` |
| Texto de apoyo (entradillas, descripciones) | `#8b8b9e` | `--text-secondary` | `text-ink-secondary` |
| Metadatos, etiquetas, contadores, placeholders | `#5a5a6e` | `--text-tertiary` | `text-ink-tertiary` |
| Acento único: énfasis, acción principal, foco, hover, estado activo | terracota `#e2905a` | `--accent-warm` | `text-warm` / `bg-warm` |
| Separadores de lista (en vez de tarjetas) | `rgba(240,240,245,0.12)` | `--divider-line` | — (CSS propio) |
| Error / éxito (solo semántico, nunca decorativo) | `#ef4444` / `#39ff14` | `--accent-danger` / `--accent-success` | `text-danger` / `text-success` |
| **Legado arcade — no usar en piezas nuevas** | coral, menta/cyan, púrpura, melocotón, `--accent-gradient` | `--accent-coral`… | `text-coral`… |

Reglas:

- **Un solo acento por pantalla.** Si parece que hace falta un segundo
  color para distinguir dos cosas (Cara/Cruz, equipo A/B), distínguelas con
  tipografía, posición o texto, no con otro color. La moneda lo resuelve así:
  el historial dice "Cara"/"Cruz" en texto terciario, sin chips de color.
- **Texto sobre `--accent-warm`**: tinta muy oscura (`#1a0e06`), nunca
  blanco — el blanco sobre terracota no llega a contraste AA.
- **Colores nuevos**: no se añaden a `:root` ni a `@theme` por una sola
  pieza. Si un objeto ilustrado necesita su paleta (el latón de la moneda),
  vive como variables locales del componente (`--metal-*` en `Coin.astro`).
  Un color que vayan a usar dos o más páginas se añade en los dos archivos
  de tokens, a la tabla de equivalencias y a esta tabla, en el mismo commit.

## Responsive: mobile first

La mayor parte del tráfico es móvil (ver AGENTS.md), así que el estilo base
es el de móvil y lo de pantallas grandes se añade encima.

- **Un solo punto de corte: 640px** (`sm:` de Tailwind). En utilidades:
  base = móvil, `sm:` = tablet y escritorio (`mb-5 sm:mb-10`). En CSS propio,
  cuando una regla no puede ser utilidad, su media query es
  `@media (max-width: 639px)` para que corte exactamente donde `sm:`. No
  introduzcas cortes nuevos (600px, 768px…) en piezas migradas; las páginas
  sin migrar todavía tienen los suyos.
- **Móviles de referencia, no un solo teléfono.** Se mide la ventana
  *útil* (sin barras del sistema ni del navegador) de tres casos:
  **Android de gama media con Chrome, 360×560** (la mayor parte del
  tráfico), **iPhone SE con Safari, 375×548** (el más bajo aún en uso) e
  **iPhone 15/16 con Safari, 393×659**. En una herramienta, **la acción
  principal (el botón que produce el resultado) tiene que verse entera en
  la primera pantalla de los tres, con al menos 16px de holgura**, contando
  la cabecera del sitio. Lo vigila `npm run test:estado`:
  `estadosAccionVisible(ruta, selector)` de `scripts/lib/estados.mjs` crea
  un invariante por móvil, y cada herramienta migrada lo añade.
- **El resto de formatos también se prueba** (`estadosResponsive` en
  `scripts/lib/estados.mjs`): Galaxy Z Fold cerrado (344×680) y abierto
  (673×760), tablet vertical (768×960) y horizontal (1024×700), escritorio
  (1280×720 y 1920×1000) y móvil en horizontal (740×340). En todos se exige
  que no haya scroll horizontal y, salvo en el móvil en horizontal (340px de
  alto no admiten ninguna herramienta entera), que la acción principal se
  vea sin scroll. Oppo, Xiaomi, Motorola y compañía no llevan fila propia:
  sus ventanas útiles (360–412px de ancho) ya las cubren los móviles de
  referencia.
- **Desde 1024px, dos columnas.** Una sola columna en escritorio deja el
  botón fuera de un portátil de 720px de alto. La moneda usa
  `grid-template-areas` (lo que se escribe y se ajusta a la izquierda, el
  objeto y el botón a la derecha) sin cambiar el orden del HTML, que sigue
  siendo el de móvil.
- **Pantallas bajas**: si no cabe, primero se compacta en móvil (márgenes,
  tamaño del objeto) y como último recurso se oculta la entradilla con
  `@media (max-width: 639px) and (max-height: 620px)`. Nunca se baja el
  umbral ni se quita un móvil de la lista.
- **Controles secundarios debajo de la acción principal** (modo, nombres,
  cantidad): así crecen sin empujar el botón fuera de la pantalla.
- **Nada de scroll horizontal a 360px.** Márgenes laterales los pone `.wrap`;
  no uses el atajo `padding: X 0` en un elemento que también lleva `.wrap`,
  porque le quita el margen lateral (usa `pt-*`/`pb-*` o `padding-block`).
- **Campos de texto a 16px o más** (`1rem`): por debajo, Safari en iPhone
  hace zoom al enfocarlos.

## Variantes regionales sin pedir ubicación

Cuando una herramienta cambia según el país (la moneda: cara o sello en
Colombia, águila o sol en México, cara o cruz en España), la región se
deduce **sin pedir permisos ni usar servidor**:

1. Un enlace compartido que ya trae la variante (`?nombres=`) manda.
2. Después, lo que el visitante eligió antes (guardado en `localStorage`).
3. Después, la **zona horaria del sistema**
   (`Intl.DateTimeFormat().resolvedOptions().timeZone`, p. ej.
   `America/Bogota`): no dispara ningún aviso, no sale del navegador y
   funciona aunque el navegador esté en inglés.
4. Después, la región del idioma del navegador (`es-CO`).
5. Si nada coincide, la variante neutra (cara o cruz).

Tabla vigente (confirmada por el propietario; vive en `POR_PAIS` de
`moneda-serie.js`):

| Países | Expresión |
|---|---|
| Colombia, Chile, Perú, Ecuador, Panamá, Venezuela | Cara o sello |
| México | Águila o sol |
| Costa Rica | Escudo o corona |
| El Salvador | Cara o corona |
| Guatemala, Honduras, Bolivia | Cara o escudo |
| Argentina, Uruguay | Cara o ceca |
| Brasil | Cara ou coroa |
| España, Puerto Rico, Paraguay y cualquier país no listado | Cara o cruz |

Nunca `navigator.geolocation`: pide permiso y la gente desconfía. Tampoco
geolocalización por IP: exige servidor y el sitio es estático a propósito.
El visitante siempre puede cambiar la variante a mano. Implementación de
referencia: `nombresPorDefecto` en `src/scripts/moneda-serie.js`.

## Anatomía de una página de herramienta

Implementación de referencia: `src/pages/moneda.astro`, `Coin.astro` y
`src/scripts/moneda.js`. Una herramienta nueva o migrada sigue este orden,
de arriba abajo:

1. **Hero corto**: `<h1>` en Outfit con una palabra o frase de énfasis en
   `<em>` Newsreader itálica y color `--accent-warm`; una entradilla de una
   o dos líneas en `text-ink-secondary`. Sin imagen, sin badges, sin emojis.
   Lo que dice es lo que el visitante va a decidir, no marketing.
2. **Entradas del usuario** (opciones, participantes…): campos subrayados
   con `--divider-line`, etiqueta en mayúsculas pequeñas `text-ink-tertiary`,
   foco en `--accent-warm`. Se recuerdan en `localStorage`.
3. **El objeto** (moneda, dado, ruleta): su propio componente en
   `src/components/`. Es el único sitio donde se permiten degradados,
   relieve y sombras, porque representa un objeto físico (ver "Excepción:
   objetos ilustrados").
4. **El resultado**: grande, en Outfit, y expresado en las palabras del
   usuario ("Sushi"), con el valor técnico debajo en pequeño ("Cruz"). Nada
   de "¡Ha salido…!", confeti, brillos ni sonidos de premio: la página es
   para decidir, no un casino.
5. **Acción principal**: un botón píldora `--accent-warm` con texto oscuro,
   verbo + objeto ("Lanzar moneda"). Único botón relleno de la página.
6. **Historial**: lista numerada dividida por líneas de 1px (patrón
   `.hub-row`), con un contador en texto plano. Acción secundaria ("Borrar")
   como texto subrayado.
7. Debajo, sin cambios: `AdSlot`, `SeoArticle`, `HubGrid`.

**Controles que dependen del dispositivo** (agitar el móvil en el oráculo):
van ocultos en el HTML y el JS los muestra solo si el dispositivo los
admite (`DeviceMotionEvent` y `pointer: coarse`), así en escritorio no hay
un botón que no hace nada. Se activan siempre con un toque del visitante
(iOS solo concede el permiso del sensor desde un gesto), van debajo de la
acción principal como cualquier control secundario y nunca la sustituyen.

**Resultados de más de dos tipos sin segundo color** (sí / no / ni sí ni
no en el oráculo): la respuesta grande en `--text-primary` y el tipo debajo
en texto terciario, igual que Cara/Cruz en la moneda.

**Acción principal de varias opciones** (piedra, papel o tijera): cuando
la acción es elegir una de N (N ≤ 4), en vez de la píldora rellena van N
botones iguales en una fila (`grid-cols-N`), con borde `--divider-line`,
radio píldora, icono encima del texto; hover y foco en `--accent-warm` y
la opción elegida se rellena de acento solo mientras dura la ronda
(`aria-pressed="true"`). El invariante de acción visible mide el
contenedor de la fila (`#ppt-choices`).

**Dos jugadores en el mismo móvil**: se elige por turnos con los mismos
botones; una línea de texto (`#ppt-turn`) dice a quién le toca y pide que
el otro no mire. La jugada del primero no se marca en ningún sitio hasta
que elige el segundo. Los nombres son entradas del usuario (debajo de la
acción, como todo control secundario) y el resultado los usa ("Gana Ana").

**Resultados de más de dos tipos sin segundo color** (sí / no / ni sí ni
no en el oráculo; ganar / perder / empate en piedra, papel o tijera): la
respuesta grande en `--text-primary` y el tipo o el motivo debajo en texto
terciario, igual que Cara/Cruz en la moneda. Si hay un ganador en el
objeto, se marca con el acento y el perdedor cede (baja, se encoge),
nunca con verde/rojo.

### Ciclo de movimiento (estándar)

Pedido por el propietario tras la moneda y la bola 8: toda herramienta
migrada o nueva tiene **objeto vivo**, con estas fases, todas con
`element.animate()` y en este orden:

| Fase | Qué hace | Duración | Moneda | Bola 8 | Piedra, papel o tijera |
|---|---|---|---|---|---|
| **Entrada** | El objeto llega al cargar, pasa un poco y vuelve | 0,9–1,1 s | Rueda de canto desde la izquierda | Rueda y el 8 gira de frente | Cada mano entra desde su lado |
| **Reposo** | Movimiento mínimo en bucle mientras espera | ciclo de 1,5–3 s, ≤ 6px | Se inclina hacia el cursor, destello | Flota | Respiran a destiempo |
| **Anticipación** | Gesto previo que anuncia la acción | 0,1–0,3 s | Se agacha antes de saltar | Se hunde el dado anterior | La mano se echa atrás en cada golpe |
| **Acción** | La animación con sentido que produce el resultado | 1–2 s en total | Volteo | Agitado + dado que emerge | "Piedra… papel… tijera…" (3 golpes) |
| **Aterrizaje** | Se asienta con un pequeño rebote o aplastamiento y aparece el resultado | 0,3–0,4 s | Asienta | El dado se asienta | Aplastamiento al abrir la mano |

Reglas:

- El resultado se escribe al resolver `.finished` de la última fase,
  nunca con `setTimeout`.
- **Interrumpible**: la acción cancela la entrada y el reposo
  (`getAnimations().forEach(a => a.cancel())`) y el reposo no arranca
  encima si una acción interrumpió la entrada.
- La entrada que llega desde un lado va dentro de un contenedor con
  `overflow-x: clip`, o solo desde la izquierda: si no, crea scroll
  horizontal.
- Solo `transform` y `opacity` (y `filter` corto si hace falta).
- `prefers-reduced-motion`: sin entrada, reposo ni anticipación; un fundido
  de 200 ms y el resultado.
- Nada de celebraciones (confeti, brillos, sonidos). Como mucho
  `navigator.vibrate` corto al terminar.
- Extras que dependen del objeto (burbujas de la bola, cursor de la
  moneda) son opcionales; las cinco fases no.

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

### Ejemplo aplicado: la moneda

Cómo quedó repartida la implementación de referencia, regla por regla:

| Qué | Dónde | Por qué |
|---|---|---|
| Layout del hero, del bloque de opciones, de la herramienta y del historial (`flex`, `grid`, `gap-4`, `mb-5 sm:mb-10`, `max-w-2xl`, `mt-16`) | Utilidades | Regla 5 |
| Colores por token (`text-ink-secondary`, `text-ink-tertiary`) y tamaños de la escala (`text-sm`, `text-lg`) | Utilidades | Regla 5 |
| Moneda 3D, degradados del metal, canto | CSS propio en `Coin.astro` | Regla 1 |
| Tamaño del `<h1>` con `clamp()`, `letter-spacing` de etiquetas | CSS propio | Regla 3 |
| Resultado (`.is-shown`) y filas del historial | CSS propio | Regla 2: los pone o los crea el JS |
| Botón principal y campos de texto (estados `:focus`, `:disabled`, `::placeholder`) | CSS propio | Regla 6: mezcla color literal y estados en una sola regla |

### Verificación

`npm run test:visual` compara píxeles contra `main` en 4 anchos. Un cambio
de **tamaño de página** (no solo de píxeles) en ese test — aunque sea de
pocos px — casi siempre significa que una regla que "se veía igual" leída
aislada, cambió el layout real. Investígalo con `getBoundingClientRect()` /
`getComputedStyle()` en el navegador antes de asumir que es ruido menor.

---

Para el resto — comandos, arquitectura de carpetas, reglas de imágenes,
despliegue, qué comprueba cada test — ver **[AGENTS.md](./AGENTS.md)**.
