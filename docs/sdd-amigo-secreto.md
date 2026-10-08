# SDD — Rediseño de amigo secreto (`/amigo-secreto`)

| | |
|---|---|
| Estado | **Propuesta** — v1.1 (correcciones de la auditoría del 2026-10-08), pendiente de aprobación del propietario |
| Fecha | 2026-10-08 |
| Alcance | `src/pages/amigo-secreto.astro`, sus componentes y su JS, tests de `/amigo-secreto`, texto SEO de la página |
| Navegador mínimo | **Chrome 111 / Safari e iOS 16.4** (base de Tailwind 4) con el diseño completo. Por debajo, la herramienta **funciona** (sortear, repartir, abrir un enlace) aunque no se vea con todo el diseño. Decidido por el propietario el 2026-10-08 |
| Fecha límite | **En `main` antes del 2026-11-07.** Desde ahí hasta enero, solo correcciones: es la temporada alta |
| Referencia de implementación | La ruleta (`ruleta-logica.js` probada con Node, SDD `docs/sdd-ruleta.md`) |

Este documento describe **qué** se construye y **por qué**. El **cómo paso a
paso** lo pone la skill `decidelo-herramienta`.

---

## 0. Principios del rediseño

Decididos por el propietario el 2026-10-08. **Mandan sobre `AGENTS.md` y
`DESIGN.md` para esta página**; el propietario revisará después qué reglas de
esos archivos se mantienen. Esta SDD no los modifica.

1. **Se rehace todo lo que haga falta.** Página, componentes y JS nuevos
   desde cero; las malas prácticas se quitan, no se parchean.
2. **Tailwind a fondo.** Toda la maquetación, color, tipografía, estados y
   animaciones sencillas en utilidades y variantes (`data-*:`, `aria-*:`,
   `group-*`, `peer-*`, `starting:`, `motion-reduce:`). CSS propio solo donde
   Tailwind no llega (el sobre 3D).
3. **Vibrante y atractiva**, que la gente quiera volver: color, ilustración,
   movimiento con intención y momentos de sorpresa al abrir el sobre. Sin
   ruido ni efectos baratos.
4. **Ligera y para teléfonos viejos, sin renunciar a tecnología moderna.**
   Todo lo nuevo es mejora progresiva: si el navegador no lo tiene, la
   herramienta sigue funcionando. Se acepta algo más de peso si compra
   experiencia; el presupuesto está en §6.3.
5. **Lo que no cambia es el funcionamiento**: una sola cadena cerrada,
   exclusiones, y **todo enlace ya repartido sigue funcionando** (§5).

## 1. Resumen

Amigo secreto es la herramienta con tracción del sitio (Colombia, picos de
cientos de visitas diarias, temporada en noviembre y diciembre). Funciona,
pero arrastra el estilo arcade (confeti, sonido, emojis, `gradient-text`,
estilos inline), un `innerHTML` largo, `Math.random` en el sorteo y un
«cifrado» que no cifra.

La entrega lleva la herramienta a:

1. **Sorteo con `crypto` y uniforme demostrado**, también con exclusiones (§2.1).
2. **Enlaces v2** ilegibles a simple vista y que detectan si llegaron cortados, leyendo para siempre los v1 (§5).
3. **Rediseño completo con Tailwind**, mobile first, con un objeto propio: el **sobre**.
4. **Tres formas de repartir**: enlaces por WhatsApp/compartir, **pasa el
   teléfono** (presencial) y CSV/Excel para empresas.
5. **Detalles del intercambio** (presupuesto en COP, fecha, lugar, mensaje,
   pista por persona) y **«Añadir al calendario»** (`.ics`).
6. **Texto SEO nuevo** con la skill `decidelo-textos`.

## 2. Auditoría del estado actual

Medido sobre `main` (`016d8d9`).

### 2.1 El sorteo

`findCycle` (`amigo-secreto.js:838`) baraja la lista y la acepta si nadie
queda junto a alguien excluido (muestreo por rechazo, hasta 2000 intentos).
Si no acierta, construye la cadena con backtracking ordenado por grado.

Medición con Node copiando las funciones tal cual (cadenas contadas por
rotación desde P0):

| Caso | Cadenas válidas | Muestras | Máx/mín frecuencia | Lectura |
|---|---|---|---|---|
| 5 personas, sin exclusiones | 24 | 200 000 | 1,06 | Uniforme (ruido) |
| 6 personas, 2 parejas | 48 | 200 000 | 1,09 | Uniforme (ruido) |
| 6 personas, grupo de 3 | 12 | 100 000 | 1,03 | Uniforme |
| 8 personas, grupo de 4 y pareja | 144 | 40 000 | 1,40 | Probablemente ruido (≈280 por cadena); confirmar con χ² |
| **10 personas, grupo de 5 y pareja** | 2877 vistas | 20 000 | **20** | **Entra el backtracking: sesgado** |

Conclusión:

- En el caso normal el sorteo **es uniforme**: el muestreo por rechazo lo
  garantiza. El comentario del código lo dice y es cierto.
- **Usa `Math.random`** en el sorteo (líneas 530, 544, 828, 856) y en el
  confeti (770, 777, 778, 781).
- Con exclusiones muy apretadas (un grupo que ocupa la mitad del sorteo) cae
  al backtracking, que **no es uniforme**. Es raro, pero existe: una familia
  de 5 en un sorteo de 10.

Método de la fase 1, en este orden:

1. **Muestreo por rechazo** con `crypto` (como hoy, uniforme por construcción).
2. Si no acierta y n ≤ 18: **conteo exacto por programación dinámica sobre
   subconjuntos** (O(2ⁿ·n²), cadenas hamiltonianas que empiezan en P0) y
   **muestreo secuencial por pesos**: cada paso elige al siguiente con
   probabilidad proporcional al número de cadenas que lo completan. Uniforme
   exacto. No se enumeran las cadenas.
3. Si n > 18 y el rechazo no acierta: el **backtracking actual** como último
   recurso, con `crypto`. No es uniforme y se dice en la verificación anónima.
4. «No hay sorteo posible» **solo cuando está demostrado** (conteo = 0 o
   búsqueda exhaustiva), como hace hoy `proven`. **Nunca** se rechaza un
   sorteo que hoy sí sale: eso sería cambiar el funcionamiento.

La fuente de azar se **inyecta** en `amigo-secreto-logica.js` (`crypto` en la
página, un generador con semilla fija en los tests).

### 2.2 El enlace

`encryptName` hace XOR con la clave fija `decidelo` y Base64. **Es
reversible por cualquiera**: el organizador puede leer todos los enlaces
pegándolos en la consola, y cualquier persona puede fabricar un enlace con
el nombre que quiera. Detalles que el lector nuevo debe reproducir (§5.1):
decodifica dos veces (`URLSearchParams` y luego `decodeURIComponent`,
`:216`) y pasa a UTF-8 con `escape`/`unescape`. Lo bueno, y se conserva: va en el fragmento `#revelar=`,
que el navegador no envía al servidor.

### 2.3 Inventario

| Área | Hoy | Destino |
|---|---|---|
| Página | 813 líneas, estilos inline, pestañas Manual/CSV, matriz de validación | Reescrita con Tailwind |
| Script | 891 líneas en un archivo, `innerHTML`, DOM y lógica mezclados | `amigo-secreto-logica.js` (puro, Node) + `amigo-secreto-enlace.js` (formatos v1/v2) + `amigo-secreto.js` (DOM) |
| Revelación | Caja de regalo, confeti, sonido Web Audio, título con 🎁 | Sobre ilustrado con su propia celebración al abrirse (sin confeti genérico ni sonido por defecto), vibración corta opcional |
| Confirmación | `window.confirm` | `<dialog>` |
| Avisos | Toast propio | Popover API |
| `localStorage` | `amigo-secreto:ultimo-sorteo` = `{date, text, exclusions, matrixRows, links[{name, contact, url, sent}]}` | `decidelo_amigo_sorteo`, leyendo la clave y el formato viejos (RF-13) |
| WhatsApp | `wa.me/<número>` si hay número (57 automático para celulares colombianos) y `api.whatsapp.com/send` si no | Se conserva + Web Share API cuando existe |
| Tests | Estados de `estados.mjs:1042-1069` (`.link-row`, `.participant-tag`, `.row-actions`…) | **Se reemplazan** en la fase 3 por los de §8 |

## 3. Competencia

Revisado el 2026-10-08.

| Producto | Qué copiamos o mejoramos |
|---|---|
| Elfster | Lista de deseos, preguntas anónimas, cuestionario, evitar el emparejamiento del año pasado → **fuera de esta SDD** |
| DrawNames | Sin email, sin registro, modo presencial → **ya somos así; añadimos presencial** |
| amigosecretoonline.com | Presupuesto, fecha, mensaje, CSV/Excel, «quién ya lo vio», reusar el sorteo → **detalles y CSV ahora; el estado necesita servidor, fuera de esta SDD** |
| Échalo a Suerte | Reenviar a una persona sin repetir sorteo → **ahora** |
| Secret Santa Organizer | Exclusiones de un solo sentido → **ahora** |

Diferenciadores propios:

1. **Pasa el teléfono**: un solo celular, sin enlaces ni instalar nada.
2. **El sorteo ocurre en tu teléfono**: sin cuenta, sin email, sin que nadie
   (ni Decídelo) guarde los nombres. Es un argumento de confianza que los
   competidores con servidor no pueden dar.
3. **Verificación anónima** que ya tenemos, ahora explicada y legible.
4. **Presupuesto en pesos y número colombiano sin indicativo**: hecho para
   el uso real.

Fuentes: elfster.com, drawnames.com, amigosecretoonline.com,
echaloasuerte.com/secret-santa, secretsantaorganizer.com.

## 4. Requisitos funcionales

| ID | Requisito |
|---|---|
| RF-01 | Añadir participantes pegando una lista (`Nombre` o `Nombre, contacto` por línea), con detección de duplicados insensible a mayúsculas y acentos (`Intl.Collator`, sensibilidad `base`). **Cambio respecto a hoy**: «José» y «Jose» pasan a avisarse como posible duplicado; es un aviso, no un bloqueo |
| RF-02 | Importar CSV y **Excel** (`.xlsx`, carga diferida de la librería solo al usarlo) |
| RF-03 | Elegir desde la agenda con Contact Picker API cuando existe (Chrome Android); si no, el botón no aparece |
| RF-04 | Exclusiones visuales: tocar dos nombres para emparejarlos. Simétricas por defecto, **de un solo sentido** opcional. El texto de exclusiones actual se sigue aceptando |
| RF-05 | Sorteo de una sola cadena cerrada, con `crypto`, uniforme (§2.1). Mensaje honesto si no hay sorteo posible |
| RF-06 | Detalles del intercambio opcionales: nombre del grupo, presupuesto (COP por defecto, moneda por `Intl.NumberFormat`), fecha, lugar, mensaje, pista por persona |
| RF-07 | Repartir por enlace: botón «Enviar» con Web Share API; si no hay, WhatsApp directo y copiar. Marca «enviado», **reenviar uno solo** sin repetir sorteo |
| RF-08 | **Pasa el teléfono**: pantalla completa con la lista de nombres; cada uno toca el suyo, abre el sobre, lo cierra y su nombre queda tachado. El organizador no ve nada |
| RF-09 | Página de revelación: sobre que se abre, nombre en grande, detalles del intercambio, «Añadir al calendario» (`.ics` generado en el navegador) |
| RF-10 | Verificación anónima (cadena con números) rediseñada y plegada por defecto |
| RF-11 | El sorteo se guarda en el dispositivo y se ofrece al volver; sortear de nuevo con enlaces ya enviados pide confirmación en `<dialog>` |
| RF-12 | Todo enlace v1 ya repartido abre correctamente (§5) |
| RF-13 | Un sorteo guardado con el formato viejo se restaura **con sus URLs originales y su estado «enviado»; nunca se recifra**. «Reenviar uno» reutiliza la URL guardada tal cual |

## 5. Enlaces: v2 y compatibilidad

### 5.1 Contrato con los enlaces v1

**Un enlace repartido antes del cambio funciona siempre.** El lector v1 nuevo
reproduce **exactamente** la cadena actual: `URLSearchParams` →
`decodeURIComponent` → `atob` → XOR con `decidelo` → `escape` →
`decodeURIComponent` (`amigo-secreto.js:213-226`). Además trata un espacio como
`+`, para abrir enlaces que algún cliente dejó sin codificar (hoy fallan).

Los enlaces fijos del test se **generan con el `encryptName` actual**
(`:202-210`) antes de borrarlo, y cubren:

- `#revelar=` y `?revelar=`;
- nombres con tilde, ñ, espacio y emoji;
- padding `=` codificado (`%3D`) y sin codificar;
- un `+` convertido en espacio.

### 5.2 Formato v2

`/amigo-secreto#v=2&d=<base64url>`, donde `d` es:

```
banderas (1 B: versión, comprimido sí/no) ‖ clave AES-GCM 128 (16 B) ‖ IV (12 B) ‖ cifrado(JSON)
JSON = { n: nombre, g?: grupo, p?: presupuesto, f?: fecha, l?: lugar, m?: mensaje, h?: pista }
```

- Clave aleatoria **por enlace** con `crypto.getRandomValues`.
- **Sin compresión por defecto**: con un JSON corto, comprimir alarga el enlace,
  y `DecompressionStream('deflate-raw')` no existe antes de iOS 16.4. Solo se
  comprime si hay detalles largos y se gana espacio, y entonces el lector lleva
  un inflate en JS de respaldo.
- **Qué protege y qué no** (se dice así en la página, sin exagerar): quien
  tiene el enlace lo puede abrir, como hoy, y **cualquiera puede fabricar un
  enlace v2 válido**, porque la clave va dentro. Lo que se gana es que el nombre
  **no se lee a simple vista** en la URL y que un enlace **cortado o dañado se
  detecta** (falla la etiqueta GCM) en vez de mostrar un nombre roto. El sorteo
  guardado en el dispositivo contiene los enlaces, así que **permite
  reconstruir la asignación**. El organizador puede abrir los enlaces que
  reparte; para que no pueda, existe «pasa el teléfono».
- AES-GCM se mantiene porque detecta daños y deja preparado el formato para un
  futuro en que la clave no vaya en el enlace. `crypto.subtle` exige HTTPS, que
  ya tenemos, y existe en todo navegador del mínimo.
- Longitud objetivo: < 200 caracteres sin detalles; se mide en el test.

### 5.3 Orden de despliegue (leer antes de escribir)

1. **Fase 2a**: se publica solo el **lector** v2. Nadie genera enlaces v2.
2. **Fase 2b**, en un PR posterior: la página empieza a **emitir** v2.
3. **Regla**: una vez emitido un enlace v2, ningún revert puede quitar el
   lector v2. Si hay que revertir la página, se revierte la emisión, no la
   lectura.

Un enlace con formato desconocido muestra un error claro, nunca la pantalla
del organizador como hace hoy (`:39`).

## 6. Diseño

### 6.1 Pantallas

1. **Organizar** (móvil, de arriba abajo): hero corto → participantes
   (lista editable, contador) → exclusiones (plegable) → detalles (plegable)
   → **botón Sortear** (visible sin scroll en los tres móviles de referencia
   con la lista vacía) → resultado: modo de reparto (Enlaces · Pasa el
   teléfono) → filas de enlaces → verificación anónima.
2. **Abrir** (quien recibe el enlace): solo el sobre, el nombre, los
   detalles y el calendario. `noindex`. Sin artículo SEO.
3. **Pasa el teléfono**: pantalla completa (`<dialog>` modal), sin salida
   accidental; cada nombre abre el sobre de esa persona.

Dirección visual: festiva y cálida, con la marca del sitio como base y una
paleta de temporada propia para esta página (papel de regalo, lacre,
sobre ilustrado). Se prototipa antes de construir y el propietario lo aprueba,
como se hizo con la ruleta.

Escritorio (≥ 1024px): dos columnas en Organizar (entradas a la izquierda,
resultado fijo a la derecha).

### 6.2 El sobre (`src/components/Envelope.astro`)

Objeto propio en SVG + HTML, CSS 3D solo para la solapa. Ciclo completo:
entrada (sube y se asienta), reposo (respira sutil), anticipación (al tocar,
se comprime 2%), acción (la solapa gira en X, la tarjeta sale), aterrizaje
(el nombre se asienta con un leve rebote). Web Animations API, resultado al
resolver `.finished`, interrumpible, y con `prefers-reduced-motion` el sobre
aparece abierto con un fundido.

### 6.3 Tecnología

| Pieza | Uso |
|---|---|
| Tailwind 4 a fondo | Toda la maquetación; variantes `data-[state=…]:`, `aria-expanded:`, `group-*`, `peer-*`, `starting:`, `motion-reduce:`; contenedor `@container` para las filas |
| Web Crypto | `getRandomValues` para el sorteo y la clave; AES-GCM para el enlace |
| Web Share API · Contact Picker API | Repartir y añadir contactos, como mejora progresiva |
| `<dialog>` · Popover API | Confirmaciones, modo presencial, avisos (Popover: Chrome 114 / iOS 17; por debajo, aviso con `role=status`) |
| View Transitions (Astro `ClientRouter` o `document.startViewTransition`) | Cambio entre Organizar y Resultado |
| `field-sizing: content` | La lista crece sola donde existe (no en Safari); si no, altura fija con scroll |
| `Intl.Collator` · `Intl.NumberFormat` · `Intl.DateTimeFormat` | Duplicados, presupuesto, fecha |
| `navigator.vibrate` | Vibración corta al abrir, apagable |

**Mínimo y respaldo.** Con el diseño completo: Chrome 111 / iOS 16.4. Por
debajo, la herramienta funciona: la paleta de esta página lleva respaldo en
hex para navegadores sin `oklch`, y `starting:`, Popover, View Transitions y
`field-sizing` simplemente no se ven.

JS nuevo en módulos ES. Se puede usar una librería si compra experiencia
(p. ej. animación), cargada solo cuando hace falta. Presupuesto orientativo:
JS de la página ≤ 40 KB gzip en la carga inicial; Excel y lo pesado, diferido.
Cloudflare Workers sirve los estáticos desde el borde con caché, así que el
peso extra se paga una vez.

## 7. Fases

| Fase | Contenido | Entrega |
|---|---|---|
| 0 | Esta SDD, épica e issues | PR de docs |
| 1 | `amigo-secreto-logica.js`: sorteo con el método de §2.1 y azar inyectado; `scripts/amigo-secreto-check.mjs` en `npm test` | PR lógica |
| 2a | `amigo-secreto-enlace.js`: lector v1 exacto y lector v2, migración de `localStorage` (RF-13), con enlaces y JSON fijos reales. **No emite v2** | PR compatibilidad |
| 2b | La página emite v2 (§5.3) | PR emisión |
| 3 | Prototipo visual (**aprobación del propietario a más tardar el 2026-10-20**); página nueva con Tailwind, `Envelope.astro`, pantallas Organizar y Abrir; **reemplaza** los estados de amigo secreto de `estados.mjs` | PR página |
| 4 | Detalles del intercambio, `.ics`, Web Share, reenviar uno, Contact Picker, Excel, exclusiones de un sentido | PR funciones |
| 5 | Pasa el teléfono | PR diferenciador |
| 6 | Texto SEO, FAQ y JSON-LD (`decidelo-textos`), enlaces con el blog de amigo secreto | PR texto |

Si el tiempo no alcanza al 7 de noviembre, la fase 5 y el Excel de la fase 4
pasan a enero. Las fases 1, 2a y 3 son el mínimo. **Si el prototipo no está
aprobado el 20 de octubre**, se publican las fases 1 y 2a sobre la página
actual y el rediseño pasa a enero: la temporada no se juega con una página a
medias.

## 8. Tests

- `amigo-secreto-check.mjs` (Node, en `npm test`), con **generador de semilla
  fija** para que el CI no falle al azar:
  - uniformidad χ² en los casos de §2.1 más uno con exclusión de un solo
    sentido, con muestras suficientes para ≥ 20 esperadas por cadena;
  - cadena cerrada y sin exclusiones violadas en 10 000 sorteos;
  - grupos de 15–30 con exclusiones apretadas que hoy salen: siguen saliendo;
  - casos imposibles demostrados;
  - lectura de los enlaces v1 fijos (§5.1) y del sorteo guardado viejo (RF-13);
  - ida y vuelta v2, v2 dañado detectado, longitud de enlace.
- `estados.mjs`: sorteo hecho (escritorio y 390px), **abrir un enlace v1** y
  **un enlace v2**, enlace manipulado (mensaje de error, sin sobre), pasa el
  teléfono (abrir y cerrar dos sobres), `accionPrincipalVisible` y
  `estadosResponsive` con `#btn-draw` (el botón nuevo **conserva ese id**).
- A mano: los tres móviles de referencia, 1280×720, iOS Safari (Web Share),
  Chrome Android (Contact Picker) y **un navegador por debajo del mínimo**.

## 9. Criterios de aceptación

1. Todos los enlaces v1 de prueba abren el nombre correcto.
2. Con la semilla fija del test, χ² no rechaza uniformidad (p > 0,001) en ningún caso de §8.
3. `npm test` y `npm run test:estado` en verde.
4. Botón Sortear visible sin scroll en 360×560, 375×548 y 393×659.
5. Sin scroll horizontal a 360px.
6. Ningún `Math.random` en los scripts de amigo secreto.
7. Con Chrome 111 / iOS 16.4 en un teléfono de gama baja, la herramienta completa va sin tirones; por debajo del mínimo, se puede sortear, repartir y abrir un enlace.
8. Ningún sorteo que hoy sale deja de salir.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper enlaces repartidos en plena temporada | Lector v1 exacto con enlaces fijos; leer antes de escribir (§5.3); fecha límite 7-nov; congelación hasta enero |
| Prototipo sin aprobar a tiempo | Hito del 20-oct; si no, fases 1 y 2a sobre la página actual |
| Todo push a `main` va a producción | Una fase por PR, CI verde antes de merge |
| Web Share o Contact Picker no existen en un navegador | Mejora progresiva: el flujo de siempre queda debajo |
| Tailwind a fondo choca con `global.css` | `class-collisions.mjs` y snapshots de CSS en cada PR |
