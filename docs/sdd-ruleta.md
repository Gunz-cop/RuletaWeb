# SDD — Rediseño de la ruleta (`/ruleta`)

| | |
|---|---|
| Estado | v1.2 (auditado §14; bloqueantes resueltos §15) — pendiente de las decisiones del propietario de §12 |
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
- O2. Lo que enseña la rueda coincide siempre con el texto del resultado,
  verificado leyendo la matriz real del rotor en un test de estado.
- O3. Acción principal y rueda **enteras** en la primera pantalla de los tres
  móviles de referencia y de un portátil de 1280×720.
- O4. La página cumple la anatomía, el color, el responsive y el ciclo de
  movimiento de `DESIGN.md`, y la checklist de la skill.
- O5. Nadie pierde su lista: las opciones, ocultas y título guardados con
  las claves viejas se leen tras el cambio.
- O6. Sin crecer de peso aunque gane funciones: JS de la página ≤ 6,3 KB
  gzip (lo de hoy; objetivo 5 KB) y la hoja compartida crece ≤ 0,3 KB gzip.

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
| RF-05 | Durante el giro el botón queda desactivado y la lista no cambia la rueda: lo escrito se guarda y se aplica al terminar (comportamiento actual de `pendingResync`). |
| RF-06 | El resultado aparece bajo la rueda: el texto de la opción grande en Outfit; debajo, en terciario, «¿Qué se decide?» o «1 de N opciones». Se anuncia por `aria-live="polite"`. |
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
| RNF-03 | Ni el rebote del aterrizaje ni el balanceo de reposo cruzan a otro gajo (desfase de destino en [0,15; 0,85] del gajo; rebote y balanceo ≤ 0,1 del gajo). | `ruleta-check.mjs` |
| RNF-04 | Acción principal visible con ≥ 16 px de holgura en 360×560, 375×548 y 393×659, y en los formatos de `estadosResponsive`; sin scroll horizontal a 344 px. | `estadosAccionVisible` + `estadosResponsive` |
| RNF-05 | La rueda entera (no solo el botón) dentro de la primera pantalla en los tres móviles de referencia y en 1280×720. | Invariante nuevo `rueda-entera-visible` (§9) |
| RNF-06 | Peso: JS ≤ 5 KB gzip; `Layout.*.css` crece ≤ 0,3 KB gzip; el HTML de `/ruleta` no crece más de 1 KB gzip sin el artículo. | Medición en cada PR, anotada en el commit |
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
  con CSS: `--wheel-d: min(100%, calc(100svh - 264px), 32rem)` (el valor exacto
  se ajusta con el invariante, nunca bajando el umbral). `svh` y no `dvh`:
  el tamaño de la rueda no debe saltar cuando aparece o se va la barra de
  Safari.
- **Desde 640 px** (`sm:`): una columna, rueda mayor, márgenes de la escala.
- **Desde 1024 px** (`lg:`): dos columnas; entradas a la izquierda, rueda,
  resultado y botón a la derecha. La rueda se limita por alto
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
  (como hoy: 16/13/11/9 px) mediante `data-densidad` en el rotor. Con
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
| `planGiro({ anguloActual, ganador, n, rnd })` | Ángulo final = vueltas enteras (5–7) + el que deja el puntero en `ganador`, con desfase en [0,15; 0,85] del gajo. Devuelve los fotogramas del rotor (muestreados a 60 Hz sobre una curva de **deceleración constante**, `θ(t) = θ_total · (1 − (1 − t/T)²)`, con `easing: linear` entre muestras; la velocidad inicial es el doble de la media. No se usa una cúbica: arrancaría al triple de la media y con ~13 opciones la rueda parecería girar hacia atrás por efecto rueda de carro; #14), los del puntero (un golpe en cada cruce de frontera, calculado con la misma curva; si dos cruces caen a menos de 50 ms, el puntero se queda levantado en vez de golpear: con 100 opciones y 6 vueltas hay 600 cruces en 4 s, más que fotogramas), la duración y el ángulo final normalizado a `[0, 360)`. |
| `gajoBajoPuntero(angulo, n)` | Inverso de lo anterior; lo usan el test de Node y el test de estado. |
| `aterrizaje(n)` | Rebote máximo = `min(2°, 0,1 × gajo)`. |
| `amplitudReposo(n)` | Amplitud del balanceo de reposo = `min(1,5°, 0,1 × gajo)`. Menor que el margen mínimo del desfase (0,15 × gajo), así que el puntero nunca sale del gajo ganador mientras la rueda respira (#14). |
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
| Entrada | La rueda rueda desde la izquierda (`translateX` + `rotate`), se pasa un poco y vuelve; dentro de `.wheel-stage` con `overflow-x: clip` | 1,0 s |
| Reposo | Balanceo de ±`amplitudReposo(n)` del rotor en bucle (como mucho ±1,5°, ≤ 6 px en el borde); el puntero quieto. Arranca tras la entrada **y vuelve tras cada resultado**, como en la moneda; por eso su amplitud está acotada al gajo (#14) | ciclo de 3 s |
| Anticipación | El rotor retrocede 8° y el puntero se levanta | 0,2 s |
| Acción | El giro planificado: 5–7 vueltas con frenado; el puntero golpea en cada frontera | 3,5–4,5 s (§12, D4) |
| Aterrizaje | Rebote de `aterrizaje(n)` y asiento; el ganador se marca con el acento y se escribe el resultado | 0,35 s |

- **Interrumpible**: pulsar «Girar ruleta» cancela entrada y reposo
  (`getAnimations().forEach(a => a.cancel())`); el reposo no arranca si una
  acción interrumpió la entrada.
- **Al terminar**, la pose final se escribe a mano en `style.transform`
  (ángulo normalizado) y se cancela la animación (lección de los dados en
  Safari: nada de `commitStyles()`).
- **Reducido**: sin entrada, reposo ni anticipación; la rueda aparece en la
  pose final con un fundido de 200 ms y el resultado.
- **Interrumpir un giro en curso** no está previsto (el botón está
  desactivado); el giro es corto.

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

## 7. Accesibilidad

- La rueda: `role="img"`, `aria-label="Ruleta con 6 opciones: Pizza,
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

| Id | Pregunta | Recomendación |
|---|---|---|
| D1 | ¿Se quita el sonido (tic por gajo y arpegio)? | Quitarlo todo, como manda la regla 6. Si se quiere conservar el tic, sería una excepción documentada como la del temporizador: desactivado por defecto, sin arpegio. |
| D2 | Paleta de la rueda | Prototipar dos: **A** (recomendada) tonos de tinta alternos (2–3 tonos de superficie y uno cálido apagado) con el ganador en `--accent-warm`; **B** seis tonos apagados variados como paleta local. Se elige en el iPhone. |
| D3 | ¿Se quita la hoja inferior de móvil? | Sí: las entradas van debajo de la acción como en el resto de herramientas. Coste: para editar con la rueda a la vista hay que subir; a cambio, la rueda deja de quedar tapada y desaparecen ~250 líneas de CSS y JS de casos límite. |
| D4 | Duración de la acción | 3,5–4,5 s. El estándar dice 1–2 s, pero una ruleta que para en 2 s no se lee; el temporizador ya tiene su excepción. Se documenta en DESIGN.md. |
| D5 | Compartir: ¿botón de WhatsApp además de `navigator.share`? | Solo `navigator.share` + copiar: en móvil el menú del sistema ya ofrece WhatsApp. |

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
