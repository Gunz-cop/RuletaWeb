# Informe de revisión independiente

Revisión de dos entregas en Gunz-cop/RuletaWeb:

1. `main` en `b281902` (ya en producción) — migración de `BlogPost.astro` a Tailwind + `DESIGN.md`.
2. Rama `claude/header-tailwind` (sin mergear, commit `035754c`) — migración de `Header.astro`.

Todo lo que sigue se reprodujo ejecutando código (build de ambas ramas, Playwright contra servidores `astro preview` reales, comparación byte a byte de `dist/`) salvo donde se indica explícitamente "por lectura". Entorno: clon fresco, `npm install`, `npm test` verde en ambas ramas antes de empezar.

---

## 1. [GRAVE] La afirmación "cada página entregada baja 216 bytes, las 66" es falsa — en realidad cada página crece

**Dónde:** mensaje de commit `035754c` (rama `claude/header-tailwind`), y `src/components/Header.astro`.

**El fallo concreto:** el commit afirma que el `<style>` pasó de 150 a 125 líneas y que "cada página entregada baja 216 bytes, las 66". Construí `dist/` de `main` y de la rama por separado y comparé los HTML servidos:

```
index.html                        main= 35548  branch= 35647  diff=+99
sobre/index.html                  main= 10473  branch= 10507  diff=+34
contacto/index.html               main= 12195  branch= 12229  diff=+34
dados/index.html                  main= 25713  branch= 25747  diff=+34
amigo-secreto/index.html          main= 29851  branch= 29885  diff=+34
moneda/index.html                 main= 53773  branch= 53807  diff=+34
... (34 bytes más en las 13 páginas comprobadas, 99 en index.html)
```

**Ninguna página baja de peso. Todas suben.** Lo que sí baja 216 bytes exactos es un único archivo: la hoja compartida `Layout.*.css` (`dist/_astro/Layout.Df_YQhz4.css`: 26337 bytes en main → `Layout.D08FWlV4.css`: 26121 bytes en la rama, diferencia exacta de 216 bytes). Es un ahorro real, pero de un recurso que el navegador descarga **una sola vez por sesión** y cachea; no es "cada página baja 216 bytes", es "el CSS compartido baja 216 bytes una vez, y cada HTML sube entre 34 y 99 bytes cada vez que se sirve".

Con compresión gzip real (lo que de verdad viaja por red en producción vía Cloudflare, que es lo relevante dado que AGENTS.md dice explícitamente que "el peso de página es un requisito de producto, no una optimización opcional" por el tráfico móvil en redes lentas):

```
index.html               main(gzip)=9257   branch(gzip)=9296   diff=+39
sobre/index.html         main(gzip)=3601   branch(gzip)=3616   diff=+15
dados/index.html         main(gzip)=7153   branch(gzip)=7169   diff=+16
amigo-secreto/index.html main(gzip)=8085   branch(gzip)=8102   diff=+17
Layout.css (gzip)         main=5899         branch=5906         diff=+7
```

**Hasta la hoja compartida es más pesada comprimida (+7 bytes), a pesar de ser 216 bytes más ligera sin comprimir.** El motivo: la migración introduce dos utilidades con valor arbitrario, `gap-[0.6rem]` y `gap-[0.35rem]` (en `logo-link` y el `<nav>` del home), que no existían antes en ningún selector `.gap-\[...\]` del sitio. Esto va en contra de lo que el propio `DESIGN.md` pide en la sección "Escala de espaciado": *"Antes de escribir un valor arbitrario (`p-[1.3rem]`), comprueba si el múltiplo de 0.25rem más cercano ya existe en la escala"*. `0.6rem` y `0.35rem` no son múltiplos de `0.25rem`; el valor más cercano en escala sería `0.5rem`/`0.75rem` (gap-2/gap-3), que ya existen en el sitio y no habrían añadido ninguna regla nueva.

**Cómo lo reproduje:** `git clone`, `npm install`, `git worktree add` de la rama, `npm test` (build) en ambas, comparación de tamaños de archivo con `os.path.getsize`, extracción de la etiqueta `<header>…</header>` de cada HTML para aislar el origen exacto del crecimiento, `grep` de `.gap-\[0\.6rem\]` / `.gap-\[0\.35rem\]` en el CSS compilado de ambas ramas (ausente en main, presente en la rama), y `gzip.compress(..., 9)` en Python sobre los archivos servidos para el número que de verdad importa en producción.

**Impacto:** el proyecto declara amigo secreto como la herramienta con tráfico real, con picos de cientos de visitas diarias que llegan por enlace directo a una página de herramienta concreta (no necesariamente pasando primero por el home donde se "amortizaría" el ahorro del CSS compartido). Para esas visitas, el efecto neto de este commit es negativo, no positivo, contradiciendo la justificación central del propio commit.

---

## 2. [MENOR] La afirmación "comprobé las 51 clases :global(), todas tienen respaldo, no hay huérfanas" es inexacta

**Dónde:** mensaje de commit `035754c`; clase `.ad-placeholder` en `src/styles/global.css:392` y `src/pages/index.astro:929` (`body.focus-mode-active :global(.ad-placeholder)`).

**El fallo concreto:** conté las clases referenciadas con `:global(.clase)` en todo `src/**/*.astro` — son exactamente 51, coincidiendo con lo que dice el commit. Para cada una busqué una ocurrencia real en marcado (`class="..."` en `.astro`) o generada por JS. Una no tiene ningún respaldo: `.ad-placeholder`. El componente que se supone la usa, `src/components/AdSlot.astro`, renderiza `<div id={slotId} data-ad-paused={position} hidden>` — nunca aplica `class="ad-placeholder"`. Confirmé además que la clase no aparece en ningún HTML de `dist/` (`grep -rl "ad-placeholder" dist/*.html` → vacío).

**Cómo lo reproduje:** `grep -roP ':global\(\.[a-zA-Z0-9_-]+' src --include="*.astro"` para extraer las 51; script en Python que busca cada nombre en `src/**/*.{astro,js,ts}` fuera de su propia declaración `:global()`; lectura directa de `AdSlot.astro`; `grep` sobre `dist/` ya construido.

**Contexto importante:** confirmé que ninguno de los archivos implicados (`global.css`, `AdSlot.astro`, `index.astro`) fue tocado por la rama `claude/header-tailwind` (`git diff main origin/claude/header-tailwind` sobre esos tres archivos no devuelve nada) — la clase huérfana es preexistente en `main`, no la introdujo esta rama. Lo que sí es atribuible a esta rama es la afirmación explícita de que se verificó y no quedaba ninguna huérfana.

**Impacto:** bajo. Es CSS muerto sobre un slot de anuncios que el propio proyecto tiene deshabilitado ("AdSense pausado hasta que el sitio sea aprobado"), no produce ningún bug visible. Lo señalo porque la tarea pedía verificar explícitamente esta afirmación, y no se sostiene tal como está escrita.

---

## 3. [INFORMATIVO] "41 utilidades nuevas, 35 genéricas" en la migración del blog — no reproduje el 41 exacto

Comparé los selectores CSS compilados en `dist/_astro/*.css` entre `d4c05d5` (padre) y `b281902`, quedándome solo con los que son nuevos tras el merge del blog. Obtuve **45** selectores nuevos, no 41. De esos 45, **10** usan valores arbitrarios entre corchetes (`max-w-[1120px]`, `max-h-[380px]`, tres variantes de `rgba(...)`/`var(--card-border)`, dos breakpoints arbitrarios `max-[601px]:`/`min-[960px]:`, `mb-[0.8rem]`) — específicos de esta página, no reutilizables en el resto del sitio — y **35** son utilidades estándar de la escala de Tailwind (`bg-surface`, `rounded-lg`, `flex`, `gap-12`, `p-6`, etc.), genuinamente reutilizables.

El **35 "genéricas" coincide exactamente** con mi recuento. El **41 total no coincide** con mi 45 — probablemente una diferencia de metodología (p. ej., si las variantes responsive de una utilidad ya existente, como `max-[601px]:mb-6` sobre una base `mb-6` que sí existía antes, cuentan o no como "nueva utilidad"). No es una discrepancia que cambie ninguna conclusión — el conteo de "genéricas" es correcto — pero no pude confirmar el total exacto de 41 y lo dejo anotado por precisión, tal como pide la tarea al distinguir lo ejecutado de lo deducido.

**Cómo lo reproduje:** build de `d4c05d5` en worktree aparte, diff de conjuntos de selectores CSS entre ambos `dist/_astro/*.css`, clasificación por presencia de `[` (valor arbitrario) en el propio selector.

---

## Afirmaciones que verifiqué y SÍ se sostienen

Para que quede claro qué no falló:

- **Modo foco sigue funcionando tras la migración del header.** No me fié de la especificidad CSS en el papel: levanté `astro preview` de la rama, usé Playwright para pulsar de verdad `#focus-toggle-btn` en el home, y leí `getComputedStyle`: `.header-inner` pasa de `justify-content: space-between` a `flex-end`, `body` gana la clase `focus-mode-active`, `.nav-link`/`.hero` quedan `display: none`. Capturé pantalla del resultado: el header en modo foco muestra únicamente los botones Foco/Sonido, tal como en `main`. La razón por la que funciona es correcta: `body.focus-mode-active :global(.header-inner)` tiene más especificidad (selector de tipo + dos clases) que la utilidad suelta `.justify-between` (una clase), así que gana en la cascada aunque `.header-inner` ya no tenga reglas propias.

- **`.header-inner:has(.logo)` era redundante y borrarla no cambia nada.** Comparé `getComputedStyle`/`getBoundingClientRect()` de `.header-inner` en `/dados` (rama que usa el branch `.logo` del ternario) entre `main` y la rama del header: mismo `display`, `justify-content`, `align-items` y mismo rectángulo en píxeles exactos. La regla `:has()` era una copia literal de la regla base `.header-inner` (que ya se aplicaba siempre, en ambas ramas del ternario), así que nunca aportó nada.

- **Tipografía fina de `.nav-link`, `.control-btn`, `.btn-back`, `.logo` correctamente dejada en CSS.** Sus `font-size` son 0.85rem, 0.8rem, 0.82rem y 1.15rem respectivamente — ninguno es múltiplo limpio de 0.25rem, que es exactamente el criterio de la regla 3 de `DESIGN.md`.

- **`main` y `.hub-section` en `BlogPost.astro` sí necesitan quedarse en CSS.** Levanté `astro preview` de `main` (que ya incluye el blog) y medí con `getComputedStyle` sobre una página real de post: `main.wrap` tiene `padding: 32px 0px` (el `0px` horizontal anula a propósito el `padding: 0 1.5rem` de `.wrap`) y `.hub-section` da `48px 0px 16px`, mismo patrón. Confirma exactamente la explicación de especificidad que da el comentario en el código.

- **SEO intacto en el blog**, verificado en 5 posts de categorías distintas (amigo-secreto, moneda, equipos, temporizador, si-o-no), no solo uno: comparé `title`, `canonical`, `description`, todas las etiquetas `og:*`, `article:*` y el JSON-LD completo entre el build de `d4c05d5` y el de `b281902` — idénticos byte a byte en los cinco.

- **Tabla de equivalencias de tokens en `DESIGN.md`**: contrastada contra `src/styles/global.css` y `src/styles/tailwind.css` reales — coincide.

- **`--transition` vs `transition-all duration-300 ease-in-out`**: el `--ease-in-out` por defecto de Tailwind (`node_modules/tailwindcss/theme.css`) es `cubic-bezier(0.4, 0, 0.2, 1)`, idéntico a la curva de `--transition`. `duration-300` = 300ms = 0.3s. La afirmación de `DESIGN.md` es correcta.

- **`npm test` pasa en ambas ramas** (build + paridad de tokens + colisiones + snapshots de CSS), y **`npm run test:visual` da 76/76 capturas idénticas** entre `main` y `claude/header-tailwind` en los 4 anchos (390/768/1280/1536px) — sin regresión de píxeles en los estados que cubre. (Ojo: por diseño esto no cubre el modo foco, que verifiqué aparte y manualmente como se describe arriba.)

---

## Conclusión

El hallazgo #1 es el que importa: la migración del header en `claude/header-tailwind` no reduce el peso por página como afirma su propio commit — lo aumenta, en las 66 páginas, y el único ahorro real (216 bytes en la hoja compartida) desaparece o se revierte al medir con compresión gzip, que es como viaja de verdad el sitio en producción. El resto de afirmaciones técnicas sobre CSS/especificidad que hace la rama (modo foco, regla `:has()` redundante, SEO del blog, tokens de `DESIGN.md`) las reproduje y se sostienen.
