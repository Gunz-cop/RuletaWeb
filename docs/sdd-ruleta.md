# SDD — Rediseño de la ruleta (`/ruleta`)

| | |
|---|---|
| Estado | v1.5 (decisiones del propietario §12; auditado §14; bloqueantes §15) — pendiente de las decisiones del propietario de §12 |
| Fecha | 2026-10-05 |
| Alcance | `src/pages/ruleta.astro`, sus componentes y su JS, tests de estado de `/ruleta`, texto SEO de la página |
| Normas que manda | `AGENTS.md` → `DESIGN.md` → skill `decidelo-herramienta` → skills de terceros |
| Issues | Épica #4 · fase 0a #5 · 0b #6 · 1 #7 · 2 #8 · 3 #9 · 4 #10 · 5 #11 |
| Referencia de implementación | La moneda (`moneda.astro` + `Coin.astro` + `moneda.js`) y, para el objeto simulado, los dados (`dados-fisica.js`) |

Este documento describe **qué** se va a construir y **por qué**; el **cómo
paso a paso** lo pone la skill `decidelo-herramienta`, que no se repite aquí.
Si algo de este SDD contradice `AGENTS.md` o `DESIGN.md`, ganan ellos.

---

## 1. Resumen

La ruleta es la herramienta que da nombre al repositorio y la única que
sigue sin pasar por el sistema editorial completo: tiene la cabina arcade
quitada a medias (paleta arcoíris, emojis como iconos, modal «¡Tenemos un
ganador!» con confeti y fanfarria, sonido) y una arquitectura distinta a la
del resto (canvas dibujado por JS, giro con `requestAnimationFrame`, hoja
inferior propia en móvil, controles en la cabecera).

El rediseño la lleva a la anatomía estándar de herramienta, con:

1. **Azar justo y decidido antes**: el ganador sale de `crypto.getRandomValues`
   y la animación lo enseña; hoy el ganador lo decide la física y está
   sesgado (§2.1).
2. **La rueda como objeto vivo** en SVG + HTML, animada con la Web Animations
   API y con el ciclo de movimiento de cinco fases.
3. **Resultado en la página**, en las palabras del usuario, con historial, sin
   modal, confeti ni sonido.
4. **Mobile first** con un solo corte en 640px (y dos columnas desde 1024px),
   acción principal visible sin scroll en los tres móviles de referencia.
5. **Nuevas capacidades** que piden los usos reales de la página: «¿Qué se
   decide?», ocultar al ganador para eliminatorias y compartir la ruleta por
   enlace.

## 2. Auditoría del estado actual

Medido sobre `main` (`d8c1551`) con `npm run build && astro preview` y
Playwright, red externa bloqueada.

### 2.1 Hallazgo crítico: el giro no es justo

`roulette.js` elige una velocidad inicial al azar (`0.35 + r·0.25` rad/frame,
con `crypto`) y la frena con rozamiento `0.984` por frame. El ganador es el
gajo donde se para. El recorrido total es casi lineal en la velocidad, así
que cubre un tramo de **≈ 2,49 vueltas**: una parte del círculo se recorre 3
veces y el resto 2. Simulando el mismo bucle 200 000 veces desde reposo
(ángulo 0, 6 opciones):

| Gajo | 1 | 2 | 3 | 4 | 5 | 6 | Esperado |
|---|---|---|---|---|---|---|---|
| Frecuencia | 20,1 % | 17,9 % | 13,4 % | 13,4 % | 14,9 % | 20,1 % | 16,7 % |

Una opción sale **1,5 veces más** que otra, y cuáles salen más depende de
dónde quedó la rueda en el giro anterior. La página promete «imparcialidad
absoluta» en el artículo SEO. Esto es un bug de producción con arreglo
propio (§10, issue de corrección inmediata) además de motivo del rediseño.

### 2.2 Medidas en los formatos de referencia

| Formato | Cabecera | Rueda (diámetro / borde inferior) | Botón GIRAR (borde inferior / holgura) |
|---|---|---|---|
| Android 360×560 | 84 px | 318 px / **606 px** (cortada) | 487 px / 73 px |
| iPhone SE 375×548 | 85 px | 333 px / **621 px** (cortada) | 495 px / 53 px |
| iPhone 393×659 | 72 px | 351 px / 627 px | 491 px / 168 px |
| Portátil 1280×720 | 72 px | 470 px / **767 px** (cortada) | 572 px / 148 px |

- El botón GIRAR entra en pantalla, pero **la mitad inferior de la rueda
  queda tapada** por la manija de la hoja inferior en móvil y por el borde
  de la ventana en un portátil de 720 px.
- A 360 y 375 px la cabecera mide 84–85 px porque «Volver al Hub» parte en
  dos líneas con los botones Foco y Sonido al lado. Sin esos dos botones
  (la cabecera de la moneda) mide 64 px.
- **El aviso «Deshacer» sale fuera de la pantalla en escritorio**: a
  1280×720, tras «Limpiar», aparece en `top = 762 px`. `#undo-toast` es
  `position: fixed` pero vive dentro de `.roulette-section.reveal`, y el
  `transform` de `.reveal.revealed` convierte la sección en su bloque
  contenedor; el parche que lo anula solo existe bajo 860 px.
- **La regla que oculta la entradilla en móvil no aplica nunca**: el `<p>`
  llega por `<slot>` desde `ruleta.astro` y el selector scopeado de
  `RouletteMachine.astro` (`.section-header p`) no lo alcanza. Ocupa tres
  líneas (~70 px) en 360 px.
- Usa cortes de 480 px y 860 px; el estándar es solo 640 px (y 1024 px
  para dos columnas).
- Peso actual: JS de la página 17,7 KB (6,3 KB gzip), HTML 8,8 KB gzip,
  hoja compartida `Layout.*.css` 7,75 KB gzip.

### 2.3 Inventario frente al estándar

| Tema | Hoy | Estándar (fuente) | Acción |
|---|---|---|---|
| Azar | Velocidad aleatoria + física decide el ganador (sesgado) | Resultado decidido antes con `crypto` (AGENTS regla 6; DESIGN «Objeto con física simulada») | Rehacer |
| Animación | `requestAnimationFrame` + rozamiento; resultado al parar el bucle | `element.animate()`, resultado al resolver `.finished` (regla 6) | Rehacer |
| Dibujo | Canvas pintado por JS (`wheel-canvas.js`) | «El JS decide y escribe; no dibuja» (regla 6) | Rehacer en SVG/HTML |
| Ciclo de movimiento | Solo acción | Entrada, reposo, anticipación, acción, aterrizaje (DESIGN) | Nuevo |
| Resultado | Modal «¡Tenemos un ganador!», emoji 🎉, confeti, arpegio | Resultado en página, en palabras del usuario, sin celebración (DESIGN «Anatomía» 4) | Rehacer |
| Sonido | Tic por gajo + arpegio, activado por defecto | Sin sonidos; la única excepción es el temporizador (regla 6) | Quitar (ver §12, D1) |
| Paleta | Arcoíris por ángulo áureo, `hsl(·, 58 %, 46 %)` | Un solo acento; el objeto ilustrado puede tener paleta local (DESIGN) | Decidir en prototipo (§12, D2) |
| Iconos | ✏️ 📝 👁️ 🔀 🗑️ ✅ 🎯 🔊 | Sin emojis como iconos (skill) | Quitar |
| Opciones por defecto | «Pizza 🍕», «Tacos 🌮»… | Ejemplo neutro | Quitar emojis del ejemplo |
| Acción principal | Botón circular «GIRAR» en el centro de la rueda | Píldora `--accent-warm`, verbo + objeto (DESIGN «Anatomía» 5) | Píldora «Girar ruleta» bajo la rueda |
| Título | `<h3>` `contenteditable` «Ruleta de Opciones» (~150 líneas de JS) | Campo subrayado tipo «¿Qué se decide?» (dados de opciones, PPT) | Rehacer como `<input>` |
| Historial | No hay | Lista numerada dividida (DESIGN «Anatomía» 6) | Nuevo |
| Móvil | Hoja inferior fija con manija, `inert`, `z-index`, parche del `transform` de `.reveal` | Controles secundarios debajo de la acción (DESIGN «Responsive») | Quitar la hoja (§12, D3) |
| Cortes | 480 / 860 px | 640 px (`sm:`) y 1024 px (`lg:`) | Rehacer |
| Marcado por JS | Checklist con `createElement` | Marcado en `.astro`, `<template>` si se repite | Mover a `<template>` |
| Claves de `localStorage` | `ruleta_*` | `decidelo_ruleta_*`, leyendo el formato viejo (regla 6) | Migrar (§6.9) |
| Controles en cabecera | Foco y Sonido en `Header.astro` (`showRouletteControls`) | Controles de la herramienta dentro de la herramienta | Mover Foco; quitar Sonido |
| Tests de estado | 13 estados de `/ruleta`, ninguno con `estadosAccionVisible`/`estadosResponsive` | Ambos obligatorios (skill §3) | Añadir y actualizar (§9) |
| Texto SEO | Habla de Canvas, 60 fps, confeti, sonido y «Offline-ready» | Verdadero y orientado a CTR (skill `decidelo-textos`) | Reescribir (§10, fase 5) |

Afirmaciones falsas hoy en la página: **«Offline-ready: una vez cargada,
funciona sin conexión»** (no hay service worker) e **«imparcialidad
absoluta»** (falsa por §2.1 hasta que se corrija el sesgo). La primera se
quita y la segunda pasa a ser verdad en la fase 0 (§10).

Afirmaciones que **dejarán de ser verdad** cuando se quiten sonido, confeti,
canvas y título editable: la meta description («con modo foco y sonido
opcional»), la FAQ del JSON-LD («preferencias de sonido/foco», «editar el
título»), el artículo de la página (Canvas a 60 fps, «¡Resultado con
confeti!», sonidos sintéticos) y tres posts del blog que enlazan a
`/ruleta` y prometen sonido: `ruleta/ruleta-retos.md` (l. 78),
`ruleta/ruleta-de-nombres-para-profesores.md` (l. 20 y 48, que además
señala «el botón 🔊 en el encabezado») y `ruleta/sorteo-ruleta.md` (l. 25).
Se corrigen en el mismo PR que quita cada cosa (§10, fase 3), no en la
fase de texto.

## 3. Objetivos y no objetivos

**Objetivos**

- O1. Sorteo uniforme demostrable: cada opción activa sale con probabilidad
  1/N, verificado con un test estadístico en Node.
- O2. Lo que enseña la rueda coincide siempre con el texto del resultado
  mientras ese resultado esté a la vista (RF-05 y RF-06 garantizan que no
  hay resultado visible sobre una rueda distinta),
  verificado leyendo la matriz real del rotor en un test de estado.
- O3. Acción principal y rueda **enteras** en la primera pantalla de los tres
  móviles de referencia y de un portátil de 1280×720.
- O4. La página cumple la anatomía, el color, el responsive y el ciclo de
  movimiento de `DESIGN.md`, y la checklist de la skill.
- O5. Nadie pierde su lista: las opciones, ocultas y título guardados con
  las claves viejas se leen tras el cambio.
- O6. Peso contenido aunque gane funciones: JS de la página ≤ 10 KB gzip
  (hoy 6,3 KB; los dados pesan 13 KB; objetivo 8 KB) y la hoja compartida
  crece ≤ 0,3 KB gzip. Subido en la v1.4 por el editor en lista, los modos,
  el arrastre y la pantalla completa que pidió el propietario (D7).

**No objetivos**

- Pesos por opción (opciones «más probables»): contradice la promesa de
  azar justo y complica el objeto. Se descarta.
- Imágenes o colores por opción elegidos por el usuario.
- Cuentas, servidor o sincronización: el sitio es estático a propósito.
- Pantalla completa (Fullscreen API) para proyectar: posible mejora
  posterior; el modo foco cubre el caso hoy.
- Cambiar la ruta `/ruleta`, el `name` del Worker o el sitemap.

## 4. Requisitos funcionales

| Id | Requisito |
|---|---|
| RF-01 | El visitante escribe opciones, una por línea, en un `<textarea>`; se ignoran líneas vacías y espacios sobrantes. La rueda se actualiza al escribir. |
| RF-02 | Sin opciones activas, la rueda muestra un estado vacío con texto («Escribe al menos una opción») y el botón principal queda desactivado. Con una sola opción, la rueda es un círculo completo y el giro funciona (gana esa). |
| RF-03 | Campo «¿Qué se decide?» (opcional, máx. 60 caracteres). Si tiene texto, el resultado lo repite encima del ganador. |
| RF-04 | «Girar ruleta» elige un ganador uniforme entre las opciones **activas**, anima la rueda hasta que el puntero señala ese gajo y escribe el resultado al resolver `.finished`. |
| RF-05 | Durante el giro el botón queda desactivado y la lista no cambia la rueda: lo escrito se guarda (`localStorage`) pero **no se aplica al aterrizar**. El resultado se muestra sobre la rueda que giró, con las opciones, N y la pregunta congeladas al empezar. Lo pendiente se aplica en la **siguiente acción** del visitante: al volver a escribir, al ocultar/activar una opción o al pulsar «Girar ruleta» (se repinta la rueda antes de planificar el giro). Así nunca hay un resultado sobre una rueda que no lo produjo (§15). |
| RF-06 | El resultado aparece bajo la rueda: el texto de la opción grande en Outfit; debajo, en terciario, «¿Qué se decide?» o «1 de N opciones». Se anuncia por `aria-live="polite"`. Un texto largo usa el patrón `.is-largo` de los dados: tamaño menor y hasta dos líneas dentro del mismo alto reservado; solo pasado eso, elipsis. **El resultado vigente se oculta en cuanto la rueda se repinta con otra lista** (queda en el historial), y con él la marca `is-ganador`. |
| RF-07 | Tras un resultado, botón de texto «Quitar «X» y seguir»: oculta esa opción (no la borra) para eliminatorias; deshacible con el aviso existente, que deja de ser solo de «Vaciar»: guarda una foto genérica `{tipo, texto, ocultas}` y su mensaje dice qué se deshace. |
| RF-08 | Lista «Ocultas»: ver todas las opciones con casilla para ocultar/activar sin borrar, y «Activar todas». Mantiene la identidad por índice y el emparejamiento por texto actuales (`updateFromTextarea`). |
| RF-09 | «Mezclar» reordena las líneas (Fisher-Yates con `crypto`). «Vaciar» vacía y ofrece «Deshacer» durante 7 s, como hoy (incluido el WCAG 2.2.1 del foco). |
| RF-10 | Historial: últimos 20 resultados, numerados, con la pregunta si la había; contador en texto plano y «Borrar» como texto subrayado. |
| RF-11 | Compartir: enlace `/ruleta#para=…&opcion=…&opcion=…` (mismo formato que el dado de opciones). Al abrirlo carga esas opciones, ofrece «Deshacer» para recuperar la lista propia y limpia el fragmento de la barra. Escucha `hashchange`. |
| RF-12 | Modo foco: oculta todo salvo la rueda, el resultado y el botón, con la rueda al mayor tamaño que quepa. Se recuerda. Su interruptor vive en la herramienta, no en la cabecera. |
| RF-13 | Todo lo anterior se recuerda en `localStorage` (§6.9) y sobrevive a una recarga. |
| RF-14 | Con `prefers-reduced-motion`: sin entrada, reposo ni anticipación; fundido de 200 ms a la posición final y el resultado. |
| RF-15 | Al aterrizar, `navigator.vibrate(15)` si existe. Sin sonidos ni celebraciones. |

## 5. Requisitos no funcionales

| Id | Requisito | Cómo se verifica |
|---|---|---|
| RNF-01 | Uniformidad: χ² de 60 000 sorteos con N ∈ {2, 3, 6, 7, 13, 50} no rechaza uniformidad a α = 0,001. Sin sesgo de módulo (muestreo por rechazo). | `scripts/ruleta-check.mjs` en `npm test` |
| RNF-02 | Coherencia objeto–texto: el gajo bajo el puntero tras el aterrizaje es el del resultado, también con N = 1, N = 2 y N = 40. | Estado `ganador-coincide-con-la-rueda` en `test:estado`: 3 giros animados de verdad y 30 con `reducedMotion: 'reduce'` (cada giro animado dura ~4 s; 30 alargarían CI dos minutos) |
| RNF-03 | La pose final siempre queda dentro del gajo ganador a ≥ `max(0,03 × gajo, 1,5°)` de la frontera, y el balanceo de reposo nunca la saca de él. Durante la animación sí puede cruzar (finales de §6.13); el resultado se escribe solo con la pose final. | `ruleta-check.mjs` |
| RNF-04 | Acción principal visible con ≥ 16 px de holgura en 360×560, 375×548 y 393×659, y en los formatos de `estadosResponsive`; sin scroll horizontal a 344 px. | `estadosAccionVisible` + `estadosResponsive` |
| RNF-05 | La rueda entera (no solo el botón) dentro de la primera pantalla en los tres móviles de referencia y en 1280×720. | Invariante nuevo `rueda-entera-visible` (§9) |
| RNF-06 | Peso: JS ≤ 10 KB gzip (objetivo 8; igual que O6); `Layout.*.css` crece ≤ 0,3 KB gzip; el HTML de `/ruleta` no crece más de 3 KB gzip sin el artículo (plantillas del editor). | Medición en cada PR, anotada en el commit |
| RNF-07 | Contraste AA (≥ 4,5:1) de cada etiqueta sobre su gajo, para toda N. | `scripts/wheel-contrast.mjs`, reescrito para la paleta nueva |
| RNF-08 | Accesibilidad: el resultado se anuncia una vez; todos los controles con nombre accesible y 44 px de toque; foco visible en `--accent-warm`; campos a 16 px; la rueda es `role="img"` con `aria-label` que lista las opciones activas (resumida si N > 12). | Revisión manual con VoiceOver/TalkBack + estados |
| RNF-09 | Sin dependencias de npm en el navegador; sin `innerHTML` con marcado; `localStorage` en `try/catch`. | Revisión de PR |
| RNF-10 | Con View Transitions, ir y volver no duplica listeners ni deja animaciones vivas (inicialización con `dataset.ready` y limpieza en `astro:before-swap`). | Estado que navega fuera y vuelve, y gira una vez |
| RNF-11 | Ningún elemento `position: fixed` (aviso «Deshacer») vive dentro de un ancestro con `transform`: el contenedor de la herramienta no lleva `.reveal` y el aviso cuelga de `<body>` o del `<main>`. | Estado `deshacer-limpiar` comprueba que el aviso cae dentro de la ventana a 1280×720 y a 360×560 |

## 6. Diseño

### 6.1 Anatomía de la página

Orden del HTML (el de móvil); en escritorio solo cambia la colocación con
`grid-template-areas`, como en la moneda.

```
MÓVIL (base, < 640px)                 ESCRITORIO (≥ 1024px)
┌──────────────────────────┐          ┌───────────────────────┬──────────────────────┐
│ cabecera del sitio       │          │ h1  Ruleta aleatoria, │        ▼             │
├──────────────────────────┤          │     que decida el azar│     ╭───────╮        │
│ h1 Ruleta aleatoria,     │          │ entradilla            │    ╱  rueda  ╲       │
│    que decida el azar    │          │                       │    ╲         ╱       │
│ (entradilla: se oculta   │          │ ¿QUÉ SE DECIDE? ____  │     ╰───────╯        │
│  si alto ≤ 620px)        │          │ OPCIONES · OCULTAS (2)│   Sushi              │
│          ▼               │          │ ┌───────────────────┐ │   ¿Qué comemos hoy?  │
│       ╭───────╮          │          │ │ textarea          │ │  ( Girar ruleta )    │
│      ╱ rueda   ╲         │          │ └───────────────────┘ │  Quitar «Sushi»…     │
│      ╲         ╱         │          │ Mezclar  Vaciar  Comp.│                      │
│       ╰───────╯          │          ├───────────────────────┴──────────────────────┤
│ Sushi   (resultado)      │          │ Últimos resultados (lista dividida)          │
│ ¿Qué comemos hoy?        │          └──────────────────────────────────────────────┘
│ ( Girar ruleta )         │
│ Quitar «Sushi» y seguir  │
├──────────────────────────┤
│ ¿QUÉ SE DECIDE? ______   │
│ OPCIONES · OCULTAS (2)   │
│ textarea                 │
│ Mezclar · Vaciar ·       │
│ Compartir · Modo foco    │
├──────────────────────────┤
│ Últimos resultados       │
├──────────────────────────┤
│ AdSlot · SeoArticle ·    │
│ HubGrid                  │
└──────────────────────────┘
```

- **Hero corto**: `<h1>` en Outfit con énfasis en `<em>` Newsreader
  (`<link>` en `slot="head"`, como hoy). Mantiene «Ruleta aleatoria» al
  principio por SEO (es la consulta principal). El texto exacto lo fija la
  fase 5 con `decidelo-textos`; hasta entonces se conserva el actual.
- **Entradas debajo de la acción en móvil** (DESIGN, «Controles
  secundarios debajo de la acción principal»): el `<textarea>` es alto y no
  cabe encima sin empujar el botón.
- **Presupuesto vertical en 360×560** (con la cabecera de 64 px que queda
  sin los botones Foco y Sonido, ver §6.8): hero ≈ 52 px + rueda +
  resultado reservado 48 px + botón 48 px + huecos ≈ 36 px + holgura 16 px
  ⇒ la rueda puede medir hasta ≈ 296 px (hoy 318 px, pero cortada). Se fija
  con CSS: `--wheel-d: min(100%, calc(100svh - 324px), 32rem)` con la entradilla visible y
  `calc(100svh - 272px)` cuando se oculta (medido en el prototipo #7: holgura
  de 17,4–17,6 px en los tres móviles y 34 px en 1280×720; el valor exacto
  se ajusta con el invariante, nunca bajando el umbral). `svh` y no `dvh`:
  el tamaño de la rueda no debe saltar cuando aparece o se va la barra de
  Safari.
- **Desde 640 px** (`sm:`): una columna, rueda mayor, márgenes de la escala.
- **Desde 1024 px** (`lg:`): dos columnas, **rueda a la izquierda y
  más grande** (`3fr`), editor a la derecha (`2fr`), como Wheel of Names y
  Picker Wheel: es la colocación que el visitante ya conoce (v1.4; cambia
  respecto a la moneda y se documenta). La rueda crece con la pantalla
  hasta `min(calc(100svh - Xpx), 44rem)`, con X ajustado con la medida para
  que en 1280×720 queden rueda y botón enteros con holgura ≥ 16 px (el
  valor de 200 px de la v1.4 no deja holgura; #15). La rueda se limita por alto
  (`calc(100svh - 240px)`) para que quepa entera en 1280×720.
- Debajo, sin cambios: `AdSlot`, `SeoArticle`, `HubGrid` (con el `AdSlot`
  superior después de la herramienta, como en la moneda).

### 6.2 El objeto: `Wheel.astro`

Componente nuevo en `src/components/Wheel.astro`, prefijo de clases
`wheel-` (ya no lo usa nadie fuera de `RouletteMachine.astro`, que
desaparece). Estructura:

```
.wheel-stage (overflow-x: clip, para la entrada lateral)
  .wheel-pointer        SVG fijo arriba (no gira)
  .wheel-rotor          div que gira (lo anima el JS)
    svg.wheel-slices    viewBox 0 0 200 200, un <path> por gajo
    .wheel-labels       una <span class="wheel-label"> por gajo
  .wheel-hub            círculo central decorativo (no es botón)
<template id="wheel-slice-tpl"><svg><path class="wheel-slice"/></svg></template>
  (se clona el <path> hijo del <svg>: un <path> suelto en un <template>
   HTML se parsea sin espacio de nombres SVG y no se pinta; #14)
<template id="wheel-label-tpl"> <span class="wheel-label"></span> </template>
```

- **Por qué SVG + HTML y no canvas**: la regla 6 pide que el JS no dibuje;
  el texto en HTML se trunca con `text-overflow: ellipsis` (hoy se trunca
  midiendo con `measureText` en un bucle), se ve nítido a cualquier
  densidad de píxeles sin `devicePixelRatio`, lo lee el test de estado y
  desaparecen `ResizeObserver`, el canvas fuera de pantalla y su caché.
- **Lo que hace el JS** con el objeto: clonar `N` plantillas, poner el
  atributo `d` de cada `<path>` (calculado por la lógica pura, §6.3), el
  texto de cada etiqueta, `--a` (ángulo) y una clase de tono. Nada de
  `innerHTML`.
- **Etiquetas**: radiales, del borde hacia el centro, ancho fijo por CSS
  (radio − cubo − margen) con elipsis. Tamaño de letra por escalones de N
  (como hoy: 16 px; 13 px con N > 10; 11 px con N > 18; 9 px con N > 25) mediante `data-densidad` en el rotor. Medidas internas en `cqw` del contenedor de la rueda (requiere iOS 16+, igual que `overflow-x: clip`). Con
  N > 40 no se pintan etiquetas (la rueda sigue y el resultado nombra al
  ganador); se avisa en texto terciario bajo el `<textarea>`.
- **Ninguna etiqueta boca abajo en reposo** (hoy se resuelve en canvas):
  al aterrizar, el JS pone `.is-volteada` a las etiquetas que quedan en la
  mitad izquierda; la regla gira 180° y cambia la alineación con un fundido
  de 150 ms. Durante el giro no se voltea nada.
- **Paleta**: variables locales `--wheel-*` dentro del componente (excepción
  de objeto ilustrado), nunca tokens globales. Ver §12, D2. El tono de cada
  gajo lo da `tonoDe(i, N)`, que garantiza que dos gajos vecinos (también el
  último y el primero) no comparten tono.
- **Ganador marcado con el acento** al aterrizar: el gajo ganador recibe
  `.is-ganador` (borde o relleno `--accent-warm`, texto `#1a0e06`), el resto
  no cambia. Nunca verde/rojo.
- **Puntero** arriba (ángulo de lectura −90°), como hoy.

### 6.3 Lógica pura: `src/scripts/ruleta-logica.js`

Módulo sin DOM, probado con Node en `scripts/ruleta-check.mjs` (mismo
patrón que `dados-fisica.js`/`dados-check.mjs`). Funciones:

| Función | Qué hace |
|---|---|
| `leerOpciones(texto)` | El `parseOptionsText` actual: split, trim, sin vacías. |
| `indiceAlAzar(n, rnd)` | Entero uniforme en `[0, n)` con muestreo por rechazo sobre `Uint32`. `rnd` inyectable para los tests. |
| `geometria(n)` | Para cada gajo: ángulo inicial, final y medio; `d` del `<path>` (con N = 1, círculo completo). |
| `tonoDe(i, n)` | Índice de tono con vecinos distintos, incluido el cierre del círculo (N impar). |
| `planGiro({ anguloActual, ganador, n, rnd })` | Ángulo final = vueltas enteras (5–7) + el que deja el puntero en `ganador`, con desfase en [0,15; 0,85] del gajo. Devuelve los fotogramas del rotor (muestreados a 60 Hz, `easing: linear` entre muestras) sobre una **curva por tramos** (#15): (1) **fase rápida** en el primer 70 % del tiempo `T₁ = 0,7·T`, con deceleración constante de `v₀` a `v₁`; (2) **cola** en el 30 % final `T_c = 0,3·T`, `θ(τ) = θ_c · (1 − (1 − τ)³)` con `τ = t'/T_c`, que recorre `θ_c = min(90°, 1,5 × gajo)` si N ≤ 30 y `θ_c = 90°` si N > 30. Empalme sin salto de velocidad: `v₁ = 3·θ_c / T_c`, y `v₀ = 2·(θ_total − θ_c)/T₁ − v₁`. Con 5–7 vueltas en 5–7 s el arranque queda en ≈ 14–15°/fotograma, menos que con la curva única de la v1.3 (antes 20°) y muy por debajo de una cuártica (22°), los del puntero (un golpe en cada cruce de frontera, calculado con la misma curva; si dos cruces caen a menos de 50 ms, el puntero se queda levantado en vez de golpear: con 100 opciones y 6 vueltas hay 600 cruces en 4 s, más que fotogramas), la duración y el ángulo final normalizado a `[0, 360)`. |
| `gajoBajoPuntero(angulo, n)` | Inverso de lo anterior; lo usan el test de Node y el test de estado. |
| `aterrizaje(n)` | Rebote máximo = `min(2°, 0,1 × gajo)`. |
| `amplitudReposo(margen)` | Amplitud del balanceo de reposo = `min(1,5°, 0,4 × margen)`, donde `margen` es la distancia real del puntero a la frontera más cercana en la pose de reposo. Con los finales de §6.13 el puntero puede quedar cerca del borde, así que la amplitud se calcula con la pose, no con N (#14, v1.4). |
| `elegirFinal(historial, n, rnd)` | Tipo de final (§6.13), **independiente del ganador**. |
| `migrarGuardado(leer)` | Lee claves nuevas o, si faltan, las viejas (§6.9). Devuelve el estado normalizado. |
| `enlace(base, {para, opciones})` / `leerEnlace(hash)` | Formato de §6.10. Reutiliza `limpiar` de `dados-opciones.js`, pero **no** su `validar` ni su `leerEnlace`, que limitan a 6 opciones (las caras de un dado); los límites de la ruleta son los de §6.10. |
| `reasignarOcultas(antes, despues, ocultas)` | El emparejamiento por índice/texto de `updateFromTextarea`, sacado tal cual para poder probarlo. |

### 6.4 Controlador: `src/scripts/ruleta.js`

Un archivo, JS vanilla, cargado con `<script src="../scripts/ruleta.js">`
al final de la página. Inicializa en `DOMContentLoaded` y `astro:page-load`
con `dataset.ready`; limpia animaciones y listeners en `astro:before-swap`
(`AbortController`, como hoy). Responsabilidades: leer y guardar estado,
clonar plantillas, pedir el plan a la lógica pura, animar, escribir el
resultado y el historial, y poner clases de estado propias (`is-shown`,
`is-ganador`, `is-volteada`, `is-girando`) — nunca clases de Tailwind.

Se borran: `roulette.js`, `roulette/audio.js`, `roulette/confetti.js`,
`roulette/wheel-canvas.js`, `roulette/storage.js`, `roulette/random.js`
(lo útil pasa a `ruleta-logica.js`), `RouletteMachine.astro` y
`WinnerModal.astro` (solo los usa `/ruleta`; comprobado con `grep`).

### 6.5 Ciclo de movimiento

Todas las fases con `element.animate()`, solo `transform` y `opacity`.

| Fase | Qué hace | Duración |
|---|---|---|
| Entrada | La rueda llega rodando desde la izquierda (`translateX` + `rotate`) con un fundido de opacidad en el primer 30 % y se asienta con **un solo** rebote suave, sin frenazo (curva de muelle con `linear()` y respaldo `cubic-bezier(0.22, 1, 0.36, 1)`); el cubo la acompaña. Dentro de `.wheel-stage` con `overflow-x: clip` (D6) | 1,2–1,4 s |
| Reposo | Balanceo de ±`amplitudReposo(margen)` del rotor en bucle (como mucho ±1,5°, ≤ 6 px en el borde); el puntero quieto. Arranca tras la entrada **y vuelve tras cada resultado**, como en la moneda; por eso su amplitud está acotada al gajo (#14) | ciclo de 3 s |
| Anticipación | El rotor retrocede 8° y el puntero se levanta | 0,2 s |
| Acción | El giro planificado: 5–7 vueltas, arranque rápido y **cola lenta con suspenso** (§6.13); el puntero golpea en cada frontera (y suena el tic si está activado) | 5–7 s (D4) |
| Aterrizaje | Depende del tipo de final (§6.13): asiento corto o vuelta atrás empujada por el puntero. El ganador se marca (§6.12) y se escribe el resultado | 0,35–0,8 s |

- **Interrumpible**: pulsar «Girar ruleta» cancela entrada y reposo
  (`getAnimations().forEach(a => a.cancel())`); el reposo no arranca si una
  acción interrumpió la entrada.
- **Al terminar**, la pose final se escribe a mano en `style.transform`
  (ángulo normalizado) y se cancela la animación (lección de los dados en
  Safari: nada de `commitStyles()`).
- **Reducido**: sin entrada, reposo ni anticipación; la rueda aparece en la
  pose final con un fundido de 200 ms y el resultado.
- **Interrumpir un giro en curso** no está previsto (el botón está
  desactivado).
- **Desenfoque de movimiento sin `filter`**: mientras la rueda avanza más
  de medio gajo por fotograma, las etiquetas bajan a opacidad 0,35 (se
  anima en la misma línea de tiempo). Evita el efecto rueda de carro que
  midió la auditoría del prototipo v1 con 13 opciones.

### 6.6 Resultado e historial

- `<p id="ruleta-result" aria-live="polite">` con
  `.ruleta-result-main` (opción, Outfit grande) y `.ruleta-result-side`
  (pregunta o «1 de N opciones», terciario). Altura reservada en reposo
  para que el botón no salte. El `#sr-announcer` compartido deja de usarse
  para el ganador (el `aria-live` propio basta y evita el doble anuncio);
  se sigue usando para «Deshacer».
- Debajo, «Quitar «X» y seguir» (texto subrayado), visible solo tras un
  resultado y si quedan ≥ 2 opciones activas.
- Historial con el patrón de la moneda (`.history-list`, filas divididas
  por `--divider-line`), clave `decidelo_ruleta_historial`, máx. 20,
  plantilla `<template>` para la fila.

### 6.7 Entradas

> **v1.4**: el editor se rediseña en §6.14 (lista con filas, «Añadir
> opción», «Pegar lista», modos). Lo que sigue vale para el cuadro de texto
> de «Pegar lista» y para lo que §6.14 no cambia; las pestañas «Opciones ·
> Ocultas» se sustituyen por el interruptor de visibilidad de cada fila.

- «¿Qué se decide?»: `<input>` subrayado, 16 px, `maxlength=60`.
- Opciones: `<textarea>` subrayado o con borde `--divider-line`, 16 px
  (hoy 15,2 px: Safari hace zoom al enfocar), alto 8 líneas con
  `field-sizing: content` donde exista.
- Pestañas «Opciones · Ocultas (2)» con el estilo actual (borde inferior en
  acento), sin emojis. La lista de ocultas usa filas divididas (no
  tarjetas) generadas desde un `<template>`.
- Barra de acciones de texto: Mezclar · Vaciar · Compartir · Modo foco.
  «Vaciar» en `--accent-danger` solo como color semántico.
- Opciones por defecto sin emojis: Pizza, Tacos, Sushi, Hamburguesa,
  Ensalada, Pasta.

### 6.8 Cabecera y modo foco

- `ruleta.astro` deja de pasar `showRouletteControls`; se elimina esa prop
  y sus dos bloques de `Header.astro`. Con ello la cabecera de 360 px pasa
  de 84 px a 64 px (medido en la moneda, que ya no los tiene).
- El modo foco pasa a ser un botón de texto de la herramienta
  (`#ruleta-foco`, `aria-pressed`). Las reglas de modo foco se reescriben
  contra la estructura nueva y viven en el `<style>` de la página.
- En modo foco la rueda usa `--wheel-d: min(100%, calc(100svh - 200px))`.

### 6.9 Persistencia y migración

| Hoy | Nuevo | Formato | Migración |
|---|---|---|---|
| `ruleta_opciones` | `decidelo_ruleta_opciones` | texto crudo del `<textarea>` | Si falta la nueva, se copia la vieja |
| `ruleta_ocultas` (v1: `["texto"]`, v2: `{v:2, indices}`) | `decidelo_ruleta_ocultas` | `{v:2, indices}` | Se leen v1 y v2 (la migración v1→v2 actual se conserva) |
| `ruleta_titulo` | `decidelo_ruleta_pregunta` | texto | «Ruleta de Opciones» (el valor por defecto viejo) se convierte en vacío |
| `ruleta_focus` | `decidelo_ruleta_foco` | `"true"/"false"` | Se copia |
| `ruleta_sound` | — | — | Se deja de leer (si D1 conserva el tic: `decidelo_ruleta_sonido`) |
| — | `decidelo_ruleta_modo` | `"normal" / "eliminar" / "contar"` | Nuevo (§6.14) |
| — | `decidelo_ruleta_conteo` | `{v:1, cuentas: {<texto>: n}}` | Nuevo, modo Contar (§6.14) |
| — | `decidelo_ruleta_historial` | `[{opcion, para, t}]`, máx. 20 | Nuevo |

Las claves viejas no se borran: si hubiera que revertir el despliegue, el
código anterior las sigue encontrando.

### 6.10 Compartir por enlace

- Formato: `#para=<pregunta>&opcion=<o1>&opcion=<o2>…` en el fragmento (no
  llega a ningún servidor; las opciones suelen ser nombres de personas).
- Límites: ≤ 100 opciones y ≤ 60 caracteres cada una; si el enlace supera
  ~2 000 caracteres, se avisa en vez de generar un enlace roto.
- Botón «Compartir»: `navigator.share` si existe; si no, copiar al
  portapapeles con aviso. Sin `wa.me` obligatorio (decidir con D5).
- Abrir un enlace: reemplaza la lista con aviso «Se cargó la ruleta
  compartida · Deshacer», reutilizando el aviso existente.

### 6.11 CSS: utilidad o CSS propio

Siguiendo «Cómo decidir entre CSS propio y utilidad de Tailwind»:

| Qué | Dónde |
|---|---|
| Layout de página, áreas de la rejilla, márgenes de la escala, colores por token | Utilidades, base = móvil, `sm:` y `lg:` |
| Rueda, gajos, etiquetas, puntero, paleta `--wheel-*`, `@keyframes` si los hubiera | CSS propio en `Wheel.astro` |
| `<h1>` con `clamp()`, `letter-spacing` de etiquetas | CSS propio |
| Resultado (`.is-shown`), filas del historial y de ocultas (las crea el JS) | CSS propio |
| Botón principal y campos (`:focus`, `:disabled`, `::placeholder`) | CSS propio |
| Media queries propias | Solo `@media (max-width: 639px)` y `(max-width: 639px) and (max-height: 620px)` |

### 6.12 Paleta pastel viva (D2)

- Variables locales `--wheel-p0…p7` en `Wheel.astro` (objeto ilustrado; no
  son tokens globales). Ocho tonos pastel con saturación suficiente para
  verse alegres sobre la tinta del sitio, por ejemplo coral `#ffb4a2`,
  melocotón `#ffd6a5`, limón `#fdffb6`, menta `#caffbf`, agua `#9bf6ff`,
  cielo `#a0c4ff`, lavanda `#bdb2ff`, rosa `#ffc6ff`. Los valores finales se
  fijan en el prototipo v2 con aprobación del propietario.
- Etiquetas en tinta oscura (`#1a1a24`), con contraste ≥ 4,5:1 en cada tono
  (lo comprueba `wheel-contrast.mjs`).
- `tonoDe(i, n, 8)`: dos vecinos nunca comparten tono, tampoco el último y el
  primero.
- **Ganador**: el gajo ganador conserva su color y el resto se atenúa con
  una **capa oscura al 30 %** (al 55 % las etiquetas bajaban a 2,6–4,0:1 e
  incumplían RNF-07; al 30 % el peor caso es 4,85:1, #15). Para que la
  marca siga siendo clara: contorno claro de 3 px en el ganador y su
  etiqueta en peso 700. Con
  una paleta de ocho colores, pintarlo de `--accent-warm` se confundiría con
  un gajo más.
- El botón principal y el foco siguen en `--accent-warm`: el pastel es solo
  del objeto.

### 6.13 Final con suspenso (D4)

El ganador se decide antes con `crypto`, **igual que siempre**; lo que se
sortea aparte, también con `crypto` e independiente del ganador, es **cómo**
termina la animación. Así el suspenso no cambia ninguna probabilidad.

| Final | Qué se ve | Pose final dentro del gajo ganador | Peso |
|---|---|---|---|
| Normal | Frena y se queda | desfase en [0,12; 0,88] | 65 % |
| Casi se pasa | Se arrastra hacia el gajo siguiente y se para justo antes | [0,90; 0,97] | 15 % |
| Por los pelos | Parece que se queda en el gajo anterior, el puntero se apoya en la frontera y al final cae en el ganador | [0,03; 0,10] | 15 % |
| Vuelta atrás | Se pasa al gajo siguiente y el puntero la empuja de vuelta al ganador | [0,85; 0,95], tras pasarse hasta 0,15 gajo | 5 % |

- **Sin abusar**: nunca dos finales distintos de «Normal» seguidos; si toca,
  se cambia por «Normal». En la práctica, uno de cada cuatro o cinco giros.
- **Solo con gajos legibles**: con N > 30 (gajo < 12°) todos los finales son
  «Normal».
- **Margen mínimo**: `max(0,03 × gajo, 1,5°)` a la frontera (RNF-03). Los
  intervalos de la tabla se recortan para respetarlo: con N = 30 (gajo de
  12°), «Por los pelos» queda en [0,125; 0,15] y «Casi se pasa» en
  [0,85; 0,875].
- **Cola lenta**: la cola de `planGiro` (§6.3) recorre en el último 30 % del
  tiempo `θ_c = min(90°, 1,5 gajos)` (90° con N > 30). En «Casi se pasa» y
  «Por los pelos», la frontera decisiva se cruza (o casi) por debajo de
  30°/s, cosa que la cola cúbica garantiza porque el puntero está a menos
  de 0,15 gajo del final.
- **Sentido de los intervalos**: el desfase se mide en el sentido del giro;
  0 es la frontera por la que entra el puntero en el gajo ganador y 1 la de
  salida, hacia el «gajo siguiente».
- El puntero y el tic acompañan: los golpes se espacian al frenar.
- `ruleta-check.mjs` comprueba que la frecuencia de cada final y la de cada
  ganador son independientes (χ² sobre la tabla de contingencia).

### 6.14 Controles y configuración (D7)

**Lo que hace la competencia** (revisado el 2026-10-05):
[Wheel of Names](https://wheelofnames.com/faq) edita en un cuadro de texto y
mete la configuración en un diálogo «Customize» con pestañas (durante el
giro, después del giro, sonido); el ganador sale en una ventana con «Quitar»
o «Cerrar». [Picker Wheel](https://pickerwheel.com/) tiene lista con
ocultar, duplicar y borrar por opción, tres modos (normal, eliminación,
acumulación) y un panel lateral de ajustes con velocidad 1–10 y duración
1–30 s. Varias apps permiten girar arrastrando la rueda con el dedo, y
Ctrl+Enter para girar. Fallos comunes: ajustes enterrados en diálogos,
perillas que nadie entiende (velocidad y duración por separado), ventanas
que tapan el resultado, cuentas y anuncios, y pesos que contradicen la
promesa de azar justo.

**Lo que haremos** (principio: cero configuración para empezar y cada
control donde se usa):

1. **Girar de cuatro formas**: el botón «Girar ruleta», tocar la rueda,
   **arrastrarla con el dedo o el ratón** (la fuerza del gesto solo elige
   cuántas vueltas da, nunca el ganador) y teclado (Espacio o Intro con la
   rueda enfocada, Ctrl/Cmd+Intro desde cualquier sitio).
2. **Controles del objeto sobre el objeto**: en una esquina de la rueda,
   dos iconos de 44 px: sonido (altavoz tachado / activo) y pantalla
   completa (Fullscreen API; en iPhone, donde no existe, activa el modo
   foco). Sin diálogo de ajustes: no hay perillas de velocidad ni duración,
   el suspenso lo diseñamos nosotros.
3. **Modo, arriba y en una pieza** (patrón «Selector de modo» de DESIGN.md):
   **Normal · Eliminar · Contar**. Normal: el ganador sigue en la rueda.
   Eliminar: tras cada giro el ganador se oculta solo (con «Deshacer»). El
   ocultado entra como cambio pendiente (RF-05): el resultado sigue a la
   vista con «Girar otra vez» y la rueda se repinta en la siguiente acción;
   cuando queda una opción, «Ganó X» y «Volver a empezar». Contar: cada
   opción acumula sus victorias en la lista y en el historial.
4. **Acciones tras el resultado, bajo el resultado** (nunca en una ventana):
   «Girar otra vez» y, en Normal, «Quitar «X»». El resultado no se tapa.
5. **Editor de opciones en lista, no solo cuadro de texto**: filas de 44 px
   con el color de su gajo, el texto editable en el sitio, un interruptor de
   visibilidad (ocultar sin borrar) y borrar con «Deshacer». Al final, un
   campo «Añadir opción» que con Intro añade y **deja el teclado abierto**
   para la siguiente: escribir diez nombres en el móvil sin cerrar el
   teclado. «Pegar lista» abre el cuadro de texto para pegar de golpe; los
   dos modos editan la misma lista.
6. **Ejemplos para empezar**: fichas «Comida», «Verdad o reto», «Nombres»
   que llenan la lista (como los ejemplos del dado de opciones).
7. **Herramientas de la lista** en una fila de texto: Mezclar · Ordenar ·
   Vaciar · Compartir. Nada pide confirmación: todo se deshace.
8. **Sin pesos ni probabilidades distintas**: la página promete que todas
   las opciones tienen la misma probabilidad.

## 7. Accesibilidad

- La rueda (v1.4): es también un control de giro, así que el contenedor
  enfocable es un `<button>` con `aria-label="Girar la ruleta"` y la
  descripción de opciones va en `aria-describedby`. Antes: `role="img"`, `aria-label="Ruleta con 6 opciones: Pizza,
  Tacos, …"` (con N > 12, «Ruleta con 30 opciones»).
- El botón principal es el único control que gira; el cubo central es
  decorativo (`aria-hidden`). Hoy el único «botón» es el cubo, sin texto
  visible fuera de la rueda.
- Foco: tras girar, se queda en el botón principal (hoy salta al modal).
- Pestañas con `role="tablist"`, flechas izquierda/derecha y
  `aria-selected` (hoy faltan las flechas).
- Aviso de «Deshacer»: se conserva tal cual (ya cumple 2.2.1 y foco).

## 8. Seguridad y privacidad

- Todo en el navegador. El enlace compartido va en el fragmento.
- Al leer el fragmento: `decodeURIComponent` en `try/catch`, límites de
  §6.10, y el texto solo se escribe con `textContent`.

## 9. Plan de pruebas

**Node (`npm test`)**

- `scripts/ruleta-check.mjs` (nuevo): RNF-01 y RNF-03; `gajoBajoPuntero ∘
  planGiro = ganador` para 10 000 planes con N ∈ [1, 100]; `tonoDe` sin
  vecinos iguales para N ∈ [2, 100]; `migrarGuardado` con las seis
  combinaciones de claves viejas/nuevas; `leerEnlace ∘ enlace = id` y
  rechazo de fragmentos mal formados; `reasignarOcultas` con duplicados.
- `scripts/wheel-contrast.mjs`: reescrito para leer la paleta `--wheel-*`
  de `Wheel.astro` (hoy lee `roulette.js`, que desaparece).

**Estados (`npm run test:estado`, `scripts/lib/estados.mjs`)**

| Estado actual | Destino |
|---|---|
| `modo-foco` | Se conserva con los selectores nuevos (`#ruleta-foco`). |
| `pestana-gestionar` | Se conserva con los selectores nuevos. |
| `modal-ganador` | **Sustituido** por `girada` (resultado `.is-shown`, fila de historial) y `ganador-coincide-con-la-rueda` (lee la matriz del rotor y la compara con el texto, como `suma-coincide-con-las-caras`). |
| `titulo-edicion` | **Sustituido** por `pregunta-en-resultado` (escribe «¿Quién friega?», gira y comprueba que el resultado la repite). |
| `deshacer-limpiar` | Se conserva (`#clear-btn` pasa a `#ruleta-vaciar`, se actualiza) y gana un invariante: el aviso cae dentro de la ventana (RNF-11). |
| `reposo` | Se conserva: sin resultado, historial vacío. |
| `h1-visible-390x844` | Se conserva. |
| `panel-opciones-movil`, `panel-opciones-movil-gestionar`, `panel-fijo-tras-scroll`, `boton-girar-visible-con-panel-*` (×3) | **Sustituidos**, porque la hoja inferior desaparece (D3), por `estadosAccionVisible('/ruleta', '#ruleta-girar')`, `estadosResponsive('/ruleta', '#ruleta-girar')` y `rueda-entera-visible-*` (×3 móviles + 1280×720). El commit explica la sustitución. |
| — | Nuevos: `quitar-ganador`, `compartida-por-enlace`, `ida-y-vuelta` (RNF-10), `claves-viejas-migradas` (siembra `ruleta_opciones`, `ruleta_ocultas` v1 y `ruleta_titulo` en el contexto antes de cargar y comprueba lista, ocultas y pregunta). |

**Manual** (skill §4): móviles de referencia, Fold cerrado y abierto, tablet,
1280×720; girar varias veces y comprobar puntero = texto; sin scroll
horizontal a 360 px; recarga conserva todo; VoiceOver en iPhone y TalkBack
en Android; `npm run test:visual` antes de cada PR de UI.

## 10. Plan de entrega

Cada push a `main` es producción, así que cada fase deja la página
funcionando y se mergea con confirmación del propietario.

| Fase | Entrega | Depende de | Riesgo |
|---|---|---|---|
| 0a. Giro justo ya | En el código actual: el ganador se elige con `crypto` (uniforme, por rechazo), se fija un ángulo destino dentro de su gajo y se busca por bisección la velocidad inicial que, con el mismo rozamiento, para ahí. El giro se ve igual que hoy. Simulado en Node: 30 000/30 000 giros paran en el gajo elegido, frecuencias de 16,57–16,81 % con N = 6 (esperado 16,67 %). Test de uniformidad en `npm test`. Quitar «Offline-ready» del artículo | — | Bajo |
| 0b. Aviso «Deshacer» visible en escritorio | Sacar `#undo-toast` de la sección con `.reveal` (o anular su `transform` en todos los anchos); el estado `deshacer-limpiar` comprueba que el aviso cae dentro de la ventana a 1280×720 | — | Bajo |
| 1. Prototipo del objeto | HTML autónomo publicado aparte (como el de los dados de rol), **no** una página en `src/pages/`: todo push a `main` es producción y el sitemap solo filtra el blog. Muestra la rueda con las paletas A y B, el ciclo de movimiento y la duración propuesta, para que el propietario lo apruebe en su iPhone y cierre D1–D5 | — | Bajo |
| 2. Lógica pura | `ruleta-logica.js` + `ruleta-check.mjs` en `npm test`. Sin cambios visibles | 1 (decisiones de paleta y duración) | Bajo |
| 3. Migración de la página | `Wheel.astro`, `ruleta.astro` con la anatomía, `ruleta.js`, resultado, historial, quitar ganador, ocultas, modo foco en la herramienta, cabecera sin controles, claves migradas; borrar canvas, modal, confeti, audio y hoja inferior; tests de estado de §9; DESIGN.md y AGENTS.md. **En el mismo PR**, las correcciones de hecho del texto que dejan de ser verdad (§2.3: meta description, FAQ, artículo y los tres posts del blog) | 2 | **Alto**: es la página que da nombre al sitio |
| 4. Compartir por enlace | RF-11 + estado `compartida-por-enlace` | 3 | Bajo |
| 5. Texto | Título, meta, H1, artículo, FAQ y JSON-LD con `decidelo-textos`, a partir de un export de Search Console de `/ruleta` | 3 (describe la herramienta nueva) | Medio (SEO) |

La fase 3 podría partirse (objeto y resultado primero; página después),
pero el estado intermedio mezclaría la página vieja con el objeto nuevo y
obligaría a mantener el modal y la hoja inferior un ciclo más. Se recomienda
un solo PR revisado con `test:visual`.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Caída de posiciones o CTR de `/ruleta` | Mantener «Ruleta aleatoria» en `<title>` y `<h1>`; reescribir texto solo en la fase 5 con datos; vigilar Search Console 4 semanas tras cada fase |
| Usuarios que pierden su lista | Migración de claves con tests (§6.9) y claves viejas intactas |
| Un giro de 3,5–4,5 s en WAAPI con muestras a 60 Hz es pesado en gama baja | ~270 fotogramas de un `transform`: trivial para el compositor; se mide en un Android de gama media en el prototipo |
| Etiquetas ilegibles con muchas opciones | Escalones de tamaño, elipsis, sin etiquetas con N > 40 |
| Safari: fantasma al cancelar animaciones | Pose final escrita a mano antes de cancelar (lección de los dados) |
| Profesores que usan el sonido (tres posts del blog lo recomiendan) | D1: el propietario decide; por defecto se quita según la regla 6 y se corrigen los posts |

## 12. Decisiones del propietario

Tomadas por el propietario el 2026-10-05 tras probar el prototipo v1 en su
iPhone. Mandan sobre DESIGN.md donde lo contradicen (precedencia de
AGENTS.md: lo que pide el propietario va primero); cada excepción se
documenta en DESIGN.md en la fase 3.

| Id | Pregunta | Decisión |
|---|---|---|
| D1 | Sonido | **Se conserva el tic** al cruzar cada gajo, **desactivado por defecto** y recordado en `decidelo_ruleta_sonido`. Sin arpegio de ganador. Excepción a la regla 6, como el temporizador. |
| D2 | Paleta de la rueda | **Ni A ni B**: los tonos de tinta «lo hacen ver aburrido». Paleta **pastel viva** (§6.12): una actividad de grupo tiene que disfrutarse. Excepción al «un solo acento» limitada al objeto ilustrado. |
| D3 | Hoja inferior de móvil | Se quita (sin objeción en la prueba). La edición se rediseña en §6.14. |
| D4 | Duración y final | Giro más largo y **final con suspenso** (§6.13): frena despacio, a veces parece que cae en otro gajo y no (o sí), y no siempre para en el centro del gajo, sin abusar del efecto. Se descarta el giro de 2 s. |
| D5 | Compartir | `navigator.share` y, si no existe, copiar el enlace. |
| D6 | Entrada | Se mantiene, pero **más suave y con gracia** (§6.5). |
| D7 | Controles y configuración | «Mucho UX e intuitivo»: investigar a la competencia e implementar la mejor forma aunque nadie lo haga así (§6.14). |
| D8 | Escritorio | Responsive de verdad; el propietario revisa capturas de escritorio en cada iteración. |

## 13. Métricas de éxito

- Uniformidad y coherencia en verde en CI (RNF-01, RNF-02).
- Todos los invariantes móviles en verde (RNF-04, RNF-05).
- JS ≤ 5 KB gzip, hoja compartida +≤ 0,3 KB gzip (RNF-06).
- Search Console a 4 semanas: CTR y posición media de `/ruleta` no peores
  que las 4 semanas previas.

## 14. Registro de auditoría del SDD

La v1 de este documento se auditó contra `AGENTS.md`, `DESIGN.md`, la skill
`decidelo-herramienta` y el código de `main`, **comprobando cada afirmación
en el build** (Playwright sobre `astro preview`) y no a ojo. Lo que se
encontró y cómo quedó en la v1.1:

| # | Hallazgo en la v1 | Gravedad | Corrección en la v1.1 |
|---|---|---|---|
| A1 | La fase 3 quitaba sonido, confeti, canvas y título editable, pero dejaba la meta description, la FAQ del JSON-LD, el artículo y tres posts del blog prometiéndolos hasta la fase 5: semanas de afirmaciones falsas en producción. | Alta | §2.3 los enumera con archivo y línea; la fase 3 los corrige en el mismo PR. |
| A2 | El prototipo era una «página aislada no enlazada»: cualquier archivo en `src/pages/` se publica al mergear a `main`, y el filtro del sitemap solo excluye el blog. | Alta | Fase 1: HTML autónomo publicado aparte, como el prototipo de los dados de rol (commit `5c216ee`). |
| A3 | El aviso «Deshacer» de escritorio sale fuera de la pantalla (medido: `top = 762 px` en 1280×720) y la v1 no lo veía; además, la v1 lo reutilizaba para dos acciones nuevas. | Alta | §2.2, fase 0b, RNF-11 y el estado `deshacer-limpiar` ampliado. |
| A4 | La fase 0 proponía la corrección del sesgo sin método comprobado y a la vez quitaba «imparcialidad absoluta», que la propia fase 0 vuelve verdadera. | Media | Método concreto y simulado (bisección de la velocidad inicial: 30 000/30 000 coincidencias, uniforme); solo se quita «Offline-ready». |
| A5 | La v1 suponía una cabecera de 72 px; medida sin los botones Foco y Sonido es de 64 px. | Media | §2.2, §6.1 (rueda de hasta ≈ 296 px) y §6.8. |
| A6 | RNF-02 pedía 30 giros animados por estado (~4 s cada uno): dos minutos más de CI por un solo estado. | Media | 3 giros animados + 30 con movimiento reducido. |
| A7 | `planGiro` daba un golpe de puntero por frontera: con 100 opciones son 600 golpes en 4 s, más que fotogramas. | Media | Regla de fusión: cruces a menos de 50 ms dejan el puntero levantado. |
| A8 | Se reutilizaba `validar`/`leerEnlace` de `dados-opciones.js`, que cortan a 6 opciones. | Media | Solo se reutiliza `limpiar`; límites propios en §6.10. |
| A9 | «Deshacer» era de un solo uso (`pendingClearUndo`) y la v1 lo usaba también para «Quitar ganador» y para el enlace compartido. | Media | RF-07: foto genérica `{tipo, texto, ocultas}`. |
| A10 | El objetivo de JS ≤ 5 KB gzip no tenía margen: la página gana historial, enlace y ciclo de movimiento. | Baja | O6: techo duro 6,3 KB (no crecer), objetivo 5 KB. |
| A11 | Contaba 14 estados de `/ruleta`; son 13. | Baja | Corregido. |
| A12 | La migración de claves solo se probaba en Node. | Baja | Estado nuevo `claves-viejas-migradas` en el navegador real. |

Comprobado y sin cambios: `WinnerModal.astro` solo lo usa `/ruleta`
(`amigo-secreto` tiene su propio confeti, `.confetti-particle`); la regla que
oculta la entradilla en móvil no aplica por el alcance del `<slot>`
(`display: block` medido a 360 px); el `<textarea>` está a 15,2 px; el
formato `#para=…&opcion=…` coincide con el del dado de opciones; las firmas
`estadosAccionVisible(ruta, selector)` y `estadosResponsive(ruta, selector,
extras)` son las que usa §9.

## 15. Bloqueantes resueltos

Discrepancias que una sesión de implementación encontró y que se
resolvieron cambiando este documento. Cada fila enlaza el issue.

| Issue | Laguna | Decisión | Secciones |
|---|---|---|---|
| #14 | El SDD no decía si el reposo vuelve tras un resultado, y con N ≥ 37 un balanceo de ±1,5° supera el margen mínimo del desfase (0,15 × gajo) y saca al puntero del gajo ganador. | El reposo vuelve tras cada resultado (como la moneda) con amplitud `min(1,5°, 0,1 × gajo)`. Se descartó no reanudarlo (la rueda pierde vida entre giros) y estrechar el desfase (no basta con N = 100). | §6.3 (`amplitudReposo`), §6.5, RNF-03 |
| #14 | La curva de frenado no estaba fijada. | Deceleración constante `θ_total · (1 − (1 − t/T)²)`. | §6.3 (`planGiro`) |
| #14 | La plantilla `<template><path/></template>` no pinta: el `<path>` se parsea sin espacio de nombres SVG. | `<template><svg><path/></svg></template>` y se clona el hijo del `<svg>`. | §6.2 |
| #7 (ciclo 2 de auditoría) | RF-05 («se aplica al terminar») chocaba con O2: al aterrizar, la rueda se repintaba con la lista escrita durante el giro y el resultado quedaba sobre otra rueda. | Lo escrito durante el giro se aplica en la siguiente acción del visitante, no al aterrizar; el resultado vigente se oculta cuando la rueda cambia de lista. Además: resultado largo con `.is-largo`, umbrales de densidad y alto de la rueda medidos en el prototipo. | O2, RF-05, RF-06, §6.1, §6.2 |
| Propietario (prototipo v1) | D1–D8 (§12): paleta pastel, tic opcional, final con suspenso, entrada más suave, controles rediseñados, escritorio. | §6.1, §6.5, §6.12–§6.14, §6.9, O6, RNF-03, RNF-06, §7. Revisión propia de la v1.4: intervalos de los finales recortados al margen mínimo; RNF-06 decía 5 KB mientras O6 decía 6,3 (residuo de A10). | v1.4 |
| #15 | (1) La «cola lenta» de §6.13 era imposible con la curva única de §6.3 (el último 30 % del tiempo recorría el 9 % del total, 162–227°). (2) La atenuación al 55 % de §6.12 dejaba las etiquetas en 2,6–4,0:1, por debajo de RNF-07. Menores: alto de la rueda en escritorio, sentido de los intervalos, ocultado en modo Eliminar. | (1) Curva por tramos con cola cúbica y empalme de velocidad. (2) Atenuación al 30 % con contorno de 3 px y etiqueta 700. Menores confirmados como los leyó la sesión. | §6.3, §6.12, §6.13, §6.14, §6.1 |
