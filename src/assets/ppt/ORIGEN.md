# Manos de piedra, papel o tijera

Fotogramas generados con ChatGPT (generación de imágenes de OpenAI) a
petición del propietario del sitio, en septiembre de 2026, a partir de un
prompt con estilo propio: vinilo mate amarillo #F5B83D, luz arriba a la
izquierda y reflejo terracota #E2905A a la derecha.

Se generaron dos hojas de 3×2 fotogramas (512 px): el puño abriéndose en
papel y el puño abriéndose en tijera. Ambas comparten el mismo puño, que es
`piedra.png`. Procesado aplicado a cada fotograma:

- Limpieza del canal alfa: el fondo traía miles de píxeles casi
  transparentes con ruido de color y la mano tenía alfa 253 en vez de 255.
- Alineado por la muñeca (centro horizontal y base a 475/512), porque la
  mano derivaba hasta 21 px entre fotogramas.
- Reducción a 384 px. Astro los sirve en AVIF/WebP (AGENTS.md, regla 1).

Orden: `piedra` → `papel-2` … `papel-6` y `piedra` → `tijera-2` …
`tijera-6`. El 5 de cada serie se pasa un poco (rebote) y el 6 es la
jugada final.
