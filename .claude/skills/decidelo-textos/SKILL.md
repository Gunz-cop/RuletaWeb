---
name: decidelo-textos
description: Procedimiento para redactar o reescribir el texto de una herramienta de Decídelo.app (título, meta description, H1, artículo SEO, FAQ y JSON-LD) orientado a CTR, con tablas, H2/H3, enlaces internos y fuentes verificables auditadas. Úsala cuando pidan "rehacer el texto", "optimizar SEO", "mejorar CTR", "más palabras", "poner fuentes" o cuando llegue un export de Search Console de una página. La implementación de referencia es src/pages/moneda.astro.
---

# Redactar el texto de una herramienta de Decídelo.app

Esta skill aplica lo aprendido al rehacer la moneda (`src/pages/moneda.astro`).
Ábrela antes de empezar y cópiale la estructura. Si algo de aquí contradice
`AGENTS.md` o `DESIGN.md`, ganan ellos.

Todo el texto va en español neutro, con el trato de «tú».

## 1. Partir de los datos, no de intuiciones

Si hay un export de Search Console (zip con `Consultas.csv`, `Países.csv`,
`Páginas.csv`…), léelo primero y anota:

- Qué consultas reales traen impresiones y en qué posición media están.
- De qué país vienen. Colombia pesa mucho en el sitio: si la consulta
  colombiana existe, va primero (en la moneda, «cara o sello» antes que
  «cara o cruz»).
- Si hay pocas impresiones, dilo al propietario: el efecto no se podrá medir
  hasta pasadas unas semanas.

## 2. Título y meta description: escritos para el clic

El CTR se decide en el resultado de Google, antes de entrar. Ahí solo cuentan
el `title` y la `description`.

- **Título ≤ 60 caracteres.** Palabra clave principal al inicio + promesa de
  resultado. Ejemplo: «Cara o Sello Online: Lanza la Moneda y Decide en 1
  Segundo». Si la marca no cabe, se quita: `Layout.astro` no la añade sola.
- **Description ≤ 160 caracteres.** Abre con la duda del usuario («¿No te
  decides?»), luego qué hace la herramienta, las variantes de la consulta y
  cierra quitando objeciones («gratis, sin registro»).
- Mide la longitud con un script, no a ojo.
- Keywords: ordenadas por prioridad según los datos del paso 1.

## 3. H1 y entradilla: tocar con cuidado

El H1 y la entradilla están encima del botón principal. El test
`accionPrincipalVisible` (`npm run test:estado`) exige que el botón se vea
sin scroll en tres móviles. No alargues el H1; si cambias la entradilla,
mantén una longitud parecida.

## 4. El artículo (`<SeoArticle>`): unas 1.500 palabras

El propietario quiere textos largos que enganchen, aunque sea una página de
herramienta. Estructura probada:

1. **Gancho** en la primera frase, en negrita, con la duda del usuario.
2. **Cómo usarla** en pasos (`<ol>`), con los nombres reales de los botones.
3. **Tabla de ideas**: situación → opciones → modo recomendado. **Máximo tres
   columnas**: con cuatro, la tabla desborda el móvil plegable de 344px y
   falla el invariante de scroll horizontal de `npm run test:estado`.
4. **Secciones por función o modo**, cada una con su H3.
5. **Trucos** numerados en H3.
6. **Tabla «¿qué herramienta usar?»**, que enlaza a todas las demás
   herramientas del sitio (`/ruleta`, `/si-o-no`, `/dados`, `/numeros`,
   `/equipos`, `/piedra-papel-tijera`, `/amigo-secreto`, `/temporizador`,
   `/moneda`). Quita la fila de la herramienta actual.
7. **Origen o curiosidad**, siempre con fuente.
8. **Cierre con llamada a la acción** que lleva de vuelta a la herramienta.
9. **Preguntas frecuentes** (H2 + un H3 por pregunta).
10. **Guías relacionadas**: todas las del blog de esa herramienta
    (`src/content/blog/<herramienta>/`).
11. **Fuentes** (ver paso 6).

Enlaces internos:

- Al menos tres enlaces al propio widget (`href="#id-del-contenedor"`, por
  ejemplo `#coin-single`) para que el lector lo pruebe sin buscarlo.
- Enlaces a otras herramientas donde encajen de forma natural, no solo en la
  tabla.
- Comprueba que el `id` del ancla existe en la página.

Un artículo largo mide más de 10.000px en móvil. `<SeoArticle>` lleva la
clase `reveal`, que aparece al entrar en pantalla: comprueba en un móvil
simulado que el texto se ve al hacer scroll (el observador de
`Layout.astro` usa `threshold: 0` justo por esto).

Mide el total con el build (`dist/<pagina>/index.html`), quitando las
etiquetas del `<article>`.

## 5. FAQ visible = FAQ del JSON-LD

- Las preguntas del `FAQPage` en `schemaLD` y las del artículo tienen que ser
  **las mismas, con el mismo texto**.
- En el JSON-LD van en texto plano: nada de `<sup>`, `<a>` ni `<code>`. Al
  editar con reemplazos, fíjate en que la primera coincidencia de una frase
  suele estar en el JSON, no en el HTML.
- Después del build, valida que cada bloque `application/ld+json` se pueda
  parsear como JSON.

## 6. Fuentes verificables (obligatorio)

Todo dato factual lleva fuente: cifras, estudios, historia, reglas de
deportes, nombres por país, cómo funciona el azar. Formato:

- Llamada en el texto: `<sup><a href="#fuente-N">[N]</a></sup>`.
- Al final, `<h2>Fuentes</h2>` con un `<ol>` donde cada `<li id="fuente-N">`
  lleva autor, año, título, publicación y el enlace (`rel="noopener"
  target="_blank"`, mostrando el dominio).

### Jerarquía de fuentes

| Nivel | Ejemplos | ¿Se cita? |
|---|---|---|
| Primaria | Artículo científico (DOI, arXiv, PLOS, NBER), reglamento oficial (IFAB), documentación técnica (MDN), banco central, texto clásico original | Sí, preferida |
| Secundaria seria | Wikipedia, RAE/ASALE, prensa establecida | Sí |
| Débil | Tumblr, TikTok, publicaciones en X, blogs personales, foros, respuestas de IA | **No.** Solo sirve como pista para buscar la primaria |

Si dos fuentes serias se contradicen (por ejemplo, Wikipedia y lo que dice el
código sobre un país), no elijas por tu cuenta: omite el dato del texto y
pregunta al propietario.

### Auditoría antes de publicar

1. **Que existan:** cada URL devuelve 200 (`curl -sL -o /dev/null -w
   '%{http_code}'`).
2. **Que digan lo que citamos:** abre cada fuente y localiza la frase o la
   cifra concreta. Si es un PDF que no se puede leer, busca la ficha del
   artículo o descomprime el texto; no lo des por bueno sin verlo.
3. **Si no se puede verificar, se quita el dato.** Mejor una frase menos que
   una fuente inventada.
4. Informa al propietario de lo que corregiste o retiraste y por qué.

### Afirmaciones que no se hacen sin estudio

- Nada sobre salud, TDAH, ansiedad u otras condiciones sin un estudio que lo
  diga. Sustitúyelo por lo que sí está demostrado (en la moneda: Jaffé et al.
  2019 en *PLOS ONE* y Levitt en NBER).
- Nunca «exactamente 50 %» ni garantías: «la misma probabilidad».
- Nunca presentes el azar como forma de decidir algo dañino, legal, médico o
  de dinero. Las herramientas son para decisiones cotidianas.

## 7. El texto no promete lo que la app no hace

Cada función que menciones (modos, compartir, historial, nombres por país)
compruébala en `src/scripts/<herramienta>.js` y en la página. Si el texto y
el código no coinciden (por ejemplo, el nombre por defecto de un país en
`moneda-serie.js`), no cambies el código por tu cuenta: señálalo.

## 8. Revisión, vista previa y commit

1. `npm test` en verde (build, tokens, snapshots de CSS).
2. `npm run test:estado` si el contenedor tiene navegador; si no, avisa de
   que lo cubre CI.
3. Genera una vista previa para que el propietario lea: el resultado de
   Google simulado (título + description) y el artículo, sacados del build.
   Déjala en el scratchpad, **nunca en el repositorio**.
4. Commit en español explicando qué dato de Search Console motivó el cambio.
5. No hagas push a `main` sin confirmación explícita: es producción directa.
