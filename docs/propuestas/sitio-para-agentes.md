# Propuesta: sitio preparado para agentes LLM

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

