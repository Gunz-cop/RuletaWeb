# Propuestas futuras

Lo que viene después de la SDD de amigo secreto (`docs/sdd-amigo-secreto.md`),
en el orden en que el propietario quiere abordarlo. Cada punto, cuando se
apruebe, pasa a su propia SDD o issue.

| # | Propuesta | Cuándo | Estado |
|---|---|---|---|
| 1 | Amigo secreto con servidor cifrado de extremo a extremo | Enero–febrero 2027 | Propuesta |
| 2 | Instalar el SDI | Tras la temporada | **Por definir** (ver §2) |
| 3 | Sitio preparado para agentes LLM (isitagentready.com) | Tras la temporada | Propuesta |
| 4 | Blog: arreglar y llenar de contenido editorial de valor | Tras la temporada; el de amigo secreto, antes | Propuesta |

---

## 1. Amigo secreto, fase 2: servidor sin conocimiento

**Por qué.** Lo que tienen los competidores y nosotros no (Elfster,
amigosecretoonline.com, Échalo a Suerte) necesita estado compartido: saber
quién ya abrió su sobre, listas de deseos que llena cada participante,
preguntas anónimas. Sin servidor no se puede.

**Cómo, sin perder lo que nos diferencia.** Cloudflare Worker + un Durable
Object por sorteo (análisis de coste en `docs/propuesta-backend-retos.md`:
0 USD esperado con el plan gratuito). Cifrado de extremo a extremo: el
servidor guarda solo bytes cifrados; las claves viajan en el fragmento `#`
de cada enlace, que no llega al servidor. Mensaje para la página: «ni
siquiera Decídelo sabe quién le regala a quién».

**Funciones.**

| Función | Detalle |
|---|---|
| «Ya lo abrió» | El organizador ve quién abrió su sobre sin ver a quién le tocó |
| Organizador que juega | El sorteo lo hace el servidor sobre identificadores opacos: el organizador no puede ver ningún emparejamiento |
| Lista de deseos | Cada participante escribe la suya; solo la ve quien le regala |
| Preguntas anónimas | Quien regala pregunta («¿talla?») sin revelarse |
| Repetir el del año pasado | Mismo grupo, evitando el emparejamiento anterior |
| Recordatorios | `.ics` con alarma y enlace de grupo para WhatsApp |
| Calendario de detalles | Variante colombiana de varias semanas («amigo secreto de dulces») |

**Requisitos.** Los enlaces v1 y v2 de la fase 1 siguen funcionando; la
versión con servidor es un formato v3. AGENTS.md («no hay backend») y la
política de privacidad se actualizan en el mismo PR. Borrado automático del
sorteo a los 60 días de la fecha del intercambio.

## 2. Instalar el SDI

**Por definir.** «SDI» no corresponde a nada instalado ni mencionado hoy en
el repositorio, y tiene varias lecturas posibles. Antes de planificarlo hay
que confirmar con el propietario a cuál se refiere, por ejemplo:

- Un kit de *spec-driven development* (desarrollo guiado por
  especificaciones, como GitHub Spec Kit) para formalizar el proceso de SDD
  que ya usamos (ruleta, amigo secreto).
- Otra herramienta o servicio con esas siglas.

Cuando se aclare, esta sección se reescribe con alcance, coste y pasos.

## 3. Sitio preparado para agentes LLM

**Objetivo.** Que asistentes y agentes (ChatGPT, Claude, Perplexity, Gemini y
agentes que navegan) encuentren, entiendan, citen **y usen** las
herramientas. Medido con https://isitagentready.com (perfil «sitio de
contenido» y, cuando haya API, «aplicación»).

**Estado hoy.** `public/robots.txt` solo tiene `Allow: /` y el sitemap. No
hay `llms.txt`, ni versión Markdown de las páginas, ni cabeceras `Link`.

**Qué revisa isitagentready.com** (consultado el 2026-10-08) y qué haríamos:

| Categoría | Comprobación | Acción en Decídelo |
|---|---|---|
| Descubrimiento | robots.txt con reglas para bots de IA | Reglas explícitas por agente (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) |
| | Sitemap | Ya está; verificar que incluye el blog |
| | Cabeceras `Link` | En `public/_headers`: `Link` a sitemap, `llms.txt` y catálogo |
| | DNS-AID | Registros DNS de descubrimiento en Cloudflare, si el estándar se asienta |
| Contenido | Negociación de Markdown | Worker que sirve `.md` de cada página con `Accept: text/markdown`, generado en build |
| Control de bots | Content Signals | Declarar en robots.txt el uso permitido (búsqueda sí, entrenamiento a decidir) |
| | Web Bot Auth | Verificar bots firmados en el Worker (opcional) |
| Protocolos | API Catalog, MCP Server Card, Agent Skills, WebMCP, A2A | **Servidor MCP propio**: `sortear_amigo_secreto`, `girar_ruleta`, `lanzar_dados`, `hacer_equipos`, `numero_aleatorio`, con el azar de `crypto` en el Worker. Tarjeta MCP y WebMCP para que un agente en el navegador use las herramientas de la página |
| | OAuth | No aplica mientras no haya cuentas |
| Comercio | x402, ACP, UCP, MPP | No aplica |

**Extras fuera del escáner:** `llms.txt` y `llms-full.txt` generados en
build desde las páginas y el blog; JSON-LD `WebApplication` completo en cada
herramienta.

**Diferenciador.** amigosecretoonline.com ya ofrece crear sorteos desde
ChatGPT o Claude por MCP. Con el servidor MCP propio, Decídelo lo ofrecería
para todas sus herramientas, y para amigo secreto devolvería enlaces v2
cifrados.

## 4. Blog: arreglar y contenido editorial de valor

**Estado hoy.** 30 artículos en `src/content/blog/` repartidos por
herramienta (ruleta, equipos, temporizador, sí o no, amigo secreto). Hay que
auditar antes de escribir.

**Auditoría (primer paso):**

- Diseño de `src/pages/blog/index.astro` y `[...slug].astro` frente al
  sistema editorial: tipografía de lectura, ancho de línea, índice, autor,
  fecha de actualización, tiempo de lectura.
- Calidad: artículos delgados, sin fuentes o con temas forzados (p. ej.
  «tarot sí o no», «IA para decisiones de carrera»), solapamientos que se
  canibalizan, títulos que prometen lo que no dan.
- SEO técnico: JSON-LD `Article` y `BreadcrumbList`, canónicas, imágenes,
  enlaces internos a la herramienta, sitemap.
- Search Console: qué artículos tienen impresiones y cuáles nunca las
  tuvieron.

**Después:**

- Por cada artículo: **mejorar, fusionar o retirar** (con redirección 301).
- Línea editorial: guías prácticas con experiencia propia, datos medidos
  (p. ej. la uniformidad del sorteo, el sesgo de la ruleta vieja) y fuentes
  verificables, como el texto de las herramientas (`decidelo-textos`).
- Plantilla con índice, «Pruébalo» con la herramienta incrustada o enlazada,
  FAQ y fecha de revisión.
- **Prioridad temporal:** los 5 artículos de amigo secreto se revisan con la
  fase 6 de su SDD, antes de noviembre, porque son los que tienen tráfico.
