# Propuesta: métricas para decidir

Estado: **propuesta, no implementada.** Hoy el código no carga ningún script
de analíticas; si Cloudflare muestra datos de visitas es porque Web Analytics
está activado desde su panel, que lo inyecta solo. Este documento recoge qué
queremos saber, qué fuente da cada dato y en qué orden ir, para decidir con
datos qué herramientas y páginas funcionan.

## Qué queremos saber

1. **Qué páginas visita más la gente**, no solo cuáles salen en Google.
2. **De dónde viene**: país, dispositivo y origen (Google, redes, enlaces).
3. **Qué hace dentro**: cuánto tiempo se queda, a qué página pasa después y
   si de verdad usa la herramienta (gira la ruleta, tira los dados…).
4. **Qué páginas dan mejor resultado**, cruzando lo anterior con la posición
   en Google.

Search Console solo cubre la parte de Google (impresiones, clics, posición)
y obliga a descargar CSV a mano. Lo que pasa después del clic no lo ve.

## Qué da cada fuente

| Pregunta | Cloudflare Web Analytics | Search Console | Clarity / Plausible / Umami |
|---|---|---|---|
| Páginas más vistas | Sí | Solo clics desde Google | Sí |
| País, dispositivo, navegador | Sí | País y dispositivo | Sí |
| Origen (referrer) | Sí | Solo Google | Sí |
| Posición en Google | No | Sí | No |
| Tiempo en página | **No** | No | Sí |
| Recorrido entre páginas | **No** | No | Sí |
| Uso real de la herramienta (eventos) | **No** | No | Sí (eventos) |
| Velocidad (Core Web Vitals) | Sí | Sí | Clarity, parcial |

Cloudflare no sigue a la persona entre páginas a propósito (privacidad), así
que no puede responder las preguntas 3 y 4 por sí solo.

## Fases

### Fase 1 — Cloudflare por API (lo más simple, sin tocar el sitio)

Consultar la **GraphQL Analytics API** de Cloudflare a demanda desde Claude
Code, en vez de entrar al panel o descargar CSV:

- Web Analytics (RUM): páginas vistas y visitas por ruta, país, dispositivo y
  referrer.
- Worker `azares`: peticiones, errores y estado de las respuestas. Ojo: los
  archivos estáticos que sirve Workers Static Assets pueden no contar como
  invocaciones del Worker; hay que comprobar qué aparece.

Requisitos:

- Un API token de **solo lectura** (Account Analytics: Read; Zone Analytics:
  Read si el dominio está como zona en Cloudflare).
- Guardarlo en el **entorno de Claude Code** (Network secrets o variable de
  entorno `CLOUDFLARE_API_TOKEN`), más `CLOUDFLARE_ACCOUNT_ID`. No en el
  repo, y los secretos de GitHub Actions no sirven para esto: solo los leen
  los workflows.
- Abrir una sesión nueva para que el entorno los cargue.

Resultado: un informe de páginas, países y referrers cuando se pida. Si se
quiere periódico, la alternativa es un workflow de GitHub Actions con el
token como secreto del repo que publique el resumen.

### Fase 2 — Comportamiento dentro del sitio

Añadir una herramienta que cubra tiempo en página, recorridos y eventos.
Google Analytics queda descartado por ahora: es pesado, exige banner de
cookies y es excesivo para este sitio. Opciones:

- **Microsoft Clarity** (gratis): tiempo, scroll, mapas de calor, grabaciones
  y recorridos. Usa cookies, así que pide banner de consentimiento.
- **Plausible** (de pago) o **Umami** (gratis si se aloja uno mismo): ligeros,
  sin cookies, con tiempo en página, recorridos y eventos personalizados.

En cualquier caso, medir **eventos de uso** en las herramientas principales
(por ejemplo "giró la ruleta") para saber si la gente usa la herramienta y no
solo abre la página. Al añadir cualquiera, actualizar
`src/pages/politica-privacidad.astro`.

### Fase 3 — Cruzar con Search Console

Unir posición y clics de Google con visitas y uso real por página, para ver
qué páginas posicionan y además retienen. Search Console tiene API, así que
también se podría consultar sin CSV.

## Pendiente de decidir

- Clarity frente a Plausible/Umami en la fase 2.
- Si el informe de la fase 1 se queda a demanda o pasa a periódico por
  GitHub Actions.
