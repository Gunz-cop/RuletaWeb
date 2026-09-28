# Decídelo.app

Herramientas para decidir al azar, en el navegador y sin registro: ruleta,
moneda, dados, equipos, amigo secreto, números, temporizador y más.
https://decidelo.app

El repositorio se llama `RuletaWeb` porque el sitio empezó siendo solo la
ruleta.

## Empezar

```bash
npm ci
npm run dev        # http://localhost:4321
npm test           # build + tests de CSS
```

Todo push a `main` se publica en producción (Cloudflare). Trabaja en una
rama.

## Stack

Astro 7 (HTML estático, sin backend), Tailwind CSS 4 conviviendo con CSS
propio, y JavaScript vanilla, un archivo por herramienta en `src/scripts/`.
Sin frameworks de UI ni librerías de animación: la mayoría de las visitas
llegan desde el móvil y el peso de la página importa.

## El estándar del proyecto

Antes de escribir código, lee estos documentos. Mandan sobre cualquier
costumbre propia o skill de terceros:

| Documento | Qué define |
|---|---|
| [AGENTS.md](./AGENTS.md) | Cómo se trabaja: comandos, tests, arquitectura, reglas del proyecto, cómo se escribe el JS de una herramienta, qué skills mandan |
| [DESIGN.md](./DESIGN.md) | Cómo se ve: tokens y colores (qué color para qué), mobile first y su punto de corte, estructura de una página de herramienta, cuándo usar Tailwind y cuándo CSS propio |
| [`.claude/skills/decidelo-herramienta`](./.claude/skills/decidelo-herramienta/SKILL.md) | Procedimiento paso a paso para crear o migrar una herramienta, con sus checklists y tests |

Resumen para quien tenga prisa:

- **Estética editorial.** Fondo tinta nocturna, un único acento terracota
  (`#e2905a`), sin degradados ni neón en la interfaz, listas divididas por
  líneas en vez de tarjetas. Es una herramienta para decidir, no un casino.
- **Tailwind para layout, espaciado y colores del sistema.** CSS propio para
  tipografía fina, 3D, degradados de objetos ilustrados y estados que pone
  el JS. Las reglas exactas están en DESIGN.md.
- **Mobile first.** Un solo punto de corte (`sm:`, 640px). La acción
  principal de cada herramienta tiene que verse sin scroll en Android (360×560),
  iPhone SE (375×548) e iPhone (393×659), y un test lo comprueba.
- **Referencia.** La moneda (`src/pages/moneda.astro`,
  `src/components/Coin.astro`, `src/scripts/moneda.js`) es la
  implementación modelo. Copia su estructura.

## Tests

| Comando | Qué comprueba |
|---|---|
| `npm test` | Build, paridad de tokens entre `global.css` y `tailwind.css`, colisiones de nombres con Tailwind, snapshots del CSS de cada página |
| `npm run test:estado` | Estilos después de interactuar (lanzar, girar, sortear) y el invariante móvil |
| `npm run test:visual` | Diferencias de píxeles contra `main` (lento) |

Los detalles de cada uno están en AGENTS.md.
