# Solicitudes para linkzip.uk (integración con decidelo.app)

Documento para ejecutar en el repositorio de linkzip. Está escrito para otro
agente de código: cada solicitud trae contexto, especificación, archivos
afectados, criterios de aceptación y tests. Las referencias `archivo:línea`
corresponden al commit `b95ae53` de linkzip, según la auditoría del
2026-10-08; **verifícalas antes de editar**, el código puede haber cambiado.

Propuesta que lo motiva: `docs/propuestas/amigo-secreto-enlace-corto.md` del
repo de decidelo (RuletaWeb).

---

## Contexto

decidelo.app (amigo secreto) generará, en el momento de cada sorteo, entre 3 y
60 enlaces cortos, uno por participante, que se envían por WhatsApp. Todos se
crean desde **un único cliente servidor-a-servidor** (el Worker de decidelo)
con **una única clave de API** de una cuenta Pro (la del dueño de ambos
sitios).

Formato de los destinos (todos iguales salvo `c`):

```
https://decidelo.app/amigo-secreto?c=<base64url, 40–600 caracteres, alfabeto [A-Za-z0-9_-]>
```

El enlace que se comparte es `https://linkzip.uk/<código>#k=<clave>`. **El
fragmento `#k=` nunca llega a linkzip**: el navegador lo conserva al seguir
una redirección cuyo `Location` no lleva fragmento (RFC 9110 §10.2.2). Por
eso **todo lo que no sea una redirección HTTP directa rompe la integración**:
página intermedia, meta refresh, `location.href` en JS, enlace en un botón.

Requisitos de fondo:

- **Durabilidad**: un enlace creado debe redirigir igual durante meses (la
  temporada es noviembre–diciembre, pero se guardan y reenvían).
- **Pico**: en diciembre, decenas de sorteos por hora; varios pueden coincidir
  en el mismo minuto.
- **Sin falsos positivos**: un enlace de un sorteo no puede quedar en
  cuarentena; el destinatario vería un error en lugar de su amigo secreto.

## Resumen

| ID | Solicitud | Prioridad | Esfuerzo estimado |
|---|---|---|---|
| S1 | Creación por lotes en la API v1 | **Bloqueante** | 0,5–1 día |
| S2 | Destinos de confianza por clave (sin moderación ni cuarentena) | **Bloqueante** | 2–4 h |
| S3 | Comportamiento de redirección fijado por enlace, no por el plan actual | **Bloqueante** | 1–2 h |
| S4 | Límite de peticiones configurable por clave y atómico | **Bloqueante** | 2–3 h |
| S5 | Códigos con `crypto.getRandomValues` y 7–8 caracteres | Recomendada | 30 min |
| S6 | Respetar `expires_at` también en Pro | Recomendada | 15 min |
| S7 | Quitar URLs completas de los logs | Recomendada | 15 min |
| S8 | Estadísticas y borrado por clave de API (`GET`/`DELETE /api/v1/links/:code`) | Enero | 0,5 día |
| S9 | Dominio propio (`s.decidelo.app`) | Enero | 2–3 días |
| S10 | Alcance de las claves (destinos permitidos, solo crear) | Enero | 0,5–1 día |

Orden sugerido de PR: S5+S6+S7 (rápidas, sin riesgo) → S3 → S4 → S2 → S1 → S8
→ S10 → S9.

---

## S1. Creación por lotes

**Problema.** `POST /api/v1/links` crea un enlace por petición
(`src/pages/api/v1/links.ts`). Un sorteo de 50 personas son 50 peticiones,
con 50 comprobaciones de seguridad, 50 lecturas del rate limit y latencia
acumulada.

**Especificación.** Nuevo endpoint `POST /api/v1/links/batch` (no cambiar el
contrato del endpoint actual).

Petición:

```http
POST /api/v1/links/batch
Authorization: Bearer lz_live_<48 hex>
Content-Type: application/json
Idempotency-Key: <uuid v4>          (opcional, ver abajo)

{
  "links": [
    { "longUrl": "https://decidelo.app/amigo-secreto?c=AbC...", "title": null, "category": "decidelo-amigo" },
    ...
  ]
}
```

- `links`: 1–100 elementos. Cada uno admite los mismos campos que el
  endpoint individual (`longUrl`, `title`, `category`, `expiresInDays`,
  `customSlug`, `password`), con la misma validación.
- Validación **antes de escribir nada**; si algún elemento es inválido por
  forma (URL no parseable, tipos), responder `400` con la lista de errores por
  índice y no crear ninguno.
- Las comprobaciones de seguridad (`safety.ts`) se ejecutan por elemento,
  en paralelo con `Promise.all` y un límite de concurrencia (p. ej. 10). Con
  S2 activo para la clave, se omiten (ver S2).
- Inserción en **una sola** `env.DB.batch([...])` de D1 (transaccional). Las
  escrituras de caché KV, después y en paralelo; un fallo de KV no falla la
  petición (la caché se repuebla en la primera visita).
- Generación de códigos (con S5): generar N códigos, comprobar colisiones con
  **una** consulta `SELECT shortcode FROM links WHERE shortcode IN (...)`,
  regenerar solo los que colisionen, máximo 5 rondas.
- El rate limit (S4) cuenta **un punto por enlace**, no por petición, y se
  comprueba para el lote entero antes de crear: si no caben todos, `429` y no
  se crea ninguno.

Respuesta `201`:

```json
{
  "links": [
    { "index": 0, "shortcode": "k3x9a2b", "shortUrl": "https://linkzip.uk/k3x9a2b",
      "targetUrl": "https://decidelo.app/amigo-secreto?c=AbC...", "expiresAt": null, "warning": null }
  ]
}
```

- El orden de `links` en la respuesta es el de la petición; `index` lo hace
  explícito.
- `targetUrl` se devuelve **byte a byte** como se recibió (hoy ya se guarda
  así: `v1/links.ts:290,308`; mantenerlo).
- **Idempotencia**: si llega `Idempotency-Key`, guardar en KV
  `idem:<hash de la clave de API>:<Idempotency-Key>` → cuerpo de la respuesta,
  TTL 24 h. Una repetición con la misma clave devuelve la respuesta guardada
  sin crear nada. Sirve para reintentos tras un timeout del cliente.
- CORS: igual que el endpoint actual (`OPTIONS` incluido).

**Refactor.** Extraer la lógica de creación de `v1/links.ts` a
`src/lib/createLinks.ts` (`validateInput`, `generateShortcodes`,
`runSafety`, `insertLinks`) y que ambos endpoints la usen. Sin duplicar.

**Aceptación.**

- Lote de 60 destinos distintos → 60 enlaces en una sola transacción D1, < 1,5 s p95.
- Lote con un `longUrl` inválido en el índice 7 → `400` con `{ errors: [{ index: 7, ... }] }` y 0 filas nuevas.
- Repetir la misma petición con la misma `Idempotency-Key` → misma respuesta, 0 filas nuevas.
- Destino con `+`, `/`, `=`, `%2B`, `_`, `-` en la query → `targetUrl` y `Location` idénticos al enviado.

**Tests.** Unitarios de `createLinks.ts` (colisiones simuladas, validación por
índice) y de integración con `wrangler dev` / Miniflare contra D1 local.

---

## S2. Destinos de confianza por clave

**Problema.** Cada creación pasa por heurísticas, Google Safe Browsing
(`safety.ts:202`), peticiones `HEAD`/`GET` al destino (`safety.ts:137`,
`aiSafety.ts:54`) y una **auditoría por IA posterior** (Llama 3 8B,
`aiSafety.ts:122-140`) que puede poner el enlace en cuarentena **después** de
creado. Además, las denuncias (`/report`) pueden ponerlo en cuarentena. Un
`c=` cifrado tiene aspecto aleatorio y es candidato a falso positivo.

**Especificación.**

- Migración D1: tabla `api_key_trusted_targets`:

  ```sql
  CREATE TABLE api_key_trusted_targets (
    id INTEGER PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    url_prefix TEXT NOT NULL,          -- p. ej. 'https://decidelo.app/amigo-secreto?c='
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_aktt_key ON api_key_trusted_targets(api_key_id);
  ```

- Solo un **admin** puede dar de alta prefijos (panel de admin o endpoint
  `POST /api/admin/trusted-targets`). El prefijo debe incluir esquema, host y
  ruta, y terminar en `?`, `/` o un parámetro (`?c=`): nunca solo un host.
- Al crear (individual o lote) con una clave que tenga prefijos: si
  `longUrl.startsWith(prefijo)` **y** `new URL(longUrl).host` coincide
  exactamente con el host del prefijo (evitar `https://decidelo.app.evil.com`),
  el enlace se marca `trusted = 1` (nueva columna en `links`, `INTEGER NOT NULL DEFAULT 0`).
- Enlaces `trusted = 1`:
  - no pasan por heurísticas, Safe Browsing, `HEAD`/`GET` al destino ni
    auditoría IA;
  - **no pueden pasar a cuarentena por denuncia ni por IA**; las denuncias se
    registran y se notifican al admin, pero no cambian el estado;
  - solo un admin puede desactivarlos manualmente.

**Aceptación.**

- Clave con prefijo `https://decidelo.app/amigo-secreto?c=` → crear
  `https://decidelo.app/amigo-secreto?c=x` no hace ninguna petición saliente
  (verificable con un `fetch` simulado en el test) y queda `trusted = 1`.
- `https://decidelo.app.evil.com/amigo-secreto?c=x` → flujo normal.
- Denunciar un enlace `trusted` 10 veces → sigue redirigiendo.

---

## S3. Comportamiento fijado por enlace

**Problema.** La redirección decide entre 302 directo y página intermedia
mirando el **plan actual del dueño** (`[shortcode].astro:241-243`, y
`isExpired` con `link.tier !== 'pro'` en `:139`, caducidad calculada a 90
días si `expires_at` es nulo en `:135-137`). Si la cuenta deja de ser Pro,
todos los enlaces existentes pasan a página intermedia (rompe `#k=`) y
caducan. El cambio tarda hasta 7 días en notarse por la caché KV
(`kvCache.ts:45`).

**Especificación.**

- Usar la columna existente `links.is_direct` (o crearla si no existe:
  `INTEGER NOT NULL DEFAULT 0`) como **fuente de verdad**, fijada al crear: `1`
  si el creador era Pro en ese momento.
- Al crear, si el creador es Free, `expires_at` se fija explícitamente
  (creación + 90 días); si es Pro, se respeta `expiresInDays` o queda `NULL`.
  Así la caducidad tampoco depende del plan futuro.
- En la redirección: `if (link.is_direct) return redirect(302)` y caducidad
  solo por `expires_at` (ver S6). No consultar el plan del dueño.
- Migración de datos: `UPDATE links SET is_direct = 1 WHERE user_id IN
  (SELECT id FROM users WHERE tier = 'pro')` y fijar `expires_at` de los Free
  que lo tengan nulo. Invalidar la caché KV de enlaces (o subir la versión de
  la clave de caché).
- La redirección debe ser **HTTP 302 con `Location` exactamente igual a
  `target_url`**, sin cuerpo HTML con JS ni meta refresh. Comprobar el código
  real que emite `Astro.redirect` en la versión instalada; si no es 302,
  usar `new Response(null, { status: 302, headers: { Location: target } })`.
- Añadir `Cache-Control: private, max-age=0` y `Referrer-Policy: no-referrer`
  a la respuesta de redirección.

**Aceptación.**

- Enlace creado por cuenta Pro; cambiar la cuenta a Free → el enlace sigue
  respondiendo 302 al instante (sin esperar a la caché).
- `curl -sI https://linkzip.uk/<código>` → `HTTP/2 302`, `location:` idéntico
  al destino, sin `#`.
- Test de navegador (Playwright, Chromium y WebKit): abrir
  `https://linkzip.uk/<código>#k=abc` y comprobar que la URL final termina en
  `#k=abc`.

---

## S4. Límite de peticiones por clave, configurable y atómico

**Problema.** 60 creaciones/min por clave en Pro (`v1/links.ts:73-76`); el
contador vive en KV con leer-y-escribir no atómico (`rateLimit.ts:110-135`) y,
si KV falla, deja pasar todo (`:142-149`). Toda la demanda de decidelo usa una
sola clave.

**Especificación.**

- Columna `api_keys.rate_limit_per_min INTEGER NULL`: si no es nula, sustituye
  al límite del plan. Editable solo por admin.
- Contador atómico: usar el **Rate Limiting binding** de Workers
  (`[[unsafe.bindings]] type = "ratelimit"`) o un Durable Object por clave
  (puede reutilizarse el patrón de `UserDO`). KV no sirve para contadores.
- Consumo **por enlace creado** (un lote de 40 consume 40).
- Valor para la clave de decidelo: 600/min.
- Fallo del limitador: dejar pasar (como hoy) pero registrar el error.

**Aceptación.** 20 lotes concurrentes de 40 con límite 600 → exactamente 15
aceptados y 5 con `429` + `Retry-After`.

---

## S5. Códigos criptográficos

`Math.random().toString(36).substring(2, 7)` (`v1/links.ts:236`,
`shorten.ts:177`) no es criptográfico, a veces devuelve menos de 5
caracteres y permite enumerar códigos.

```ts
const ALPHABET = '0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'; // sin l, I, O
export function shortcode(len = 7): string {
  const out: string[] = [];
  const max = 256 - (256 % ALPHABET.length);   // evitar sesgo de módulo
  while (out.length < len) {
    const buf = crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of buf) if (b < max && out.length < len) out.push(ALPHABET[b % ALPHABET.length]);
  }
  return out.join('');
}
```

Usar en los dos sitios. Los códigos existentes no cambian. Longitud 7 para
nuevos enlaces.

---

## S6. Respetar `expires_at` en Pro

`[shortcode].astro:139` ignora la caducidad si `tier === 'pro'`. Con S3, la
caducidad depende solo de `expires_at`: `isExpired = link.expires_at !== null
&& link.expires_at < now`. Test: enlace Pro con `expiresInDays: 1` y reloj
simulado a +2 días → página de caducado.

---

## S7. URLs fuera de los logs

`aiSafety.ts:44,119` y `edit.ts:113,192` escriben la URL de destino completa
con `console.log`. Sustituir por `new URL(u).host` + `shortcode`. Revisar con
`grep -rn "console\.\(log\|error\|warn\)" src` que ningún otro log incluye
`target_url`, `longUrl` ni la query.

---

## S8. Estadísticas y borrado por clave de API (enero)

Para «ya lo abrió» en decidelo.

- `GET /api/v1/links/:code` → `{ shortcode, targetUrl, createdAt, clicks: { human, bot }, firstHumanClickAt }`.
- `POST /api/v1/links/stats` con `{ shortcodes: [...] }` (hasta 100) → mismo
  objeto por código. Es el que usará decidelo (una petición por sorteo).
- `DELETE /api/v1/links/:code` → borrado lógico.
- Solo enlaces del dueño de la clave (`404` si no). Contar como humano solo
  `is_bot = 0`. Añadir a `checkIfBot` (`analytics.ts:24-27`) los agentes de
  vista previa conocidos: `WhatsApp`, `facebookexternalhit`, `TelegramBot`,
  `Twitterbot`, `Slackbot`, `Discordbot`, `SkypeUriPreview`, `Googlebot`,
  `bingbot`, y peticiones `HEAD`.
- `firstHumanClickAt` necesita guardar la marca de tiempo del primer clic
  humano (columna en `links` o `MIN(created_at)` en `link_clicks` con índice
  `(shortcode, is_bot, created_at)`).

---

## S9. Dominio propio (enero)

Que los enlaces de decidelo salgan como `https://s.decidelo.app/<código>`.

- Tabla `custom_domains (id, user_id, hostname UNIQUE, verified_at, created_at)`.
- Verificación por registro TXT `_linkzip.<hostname>` con un token, o por
  Cloudflare for SaaS (Custom Hostnames) si linkzip está en esa zona.
- Ruta del Worker para cada dominio verificado; en la redirección, resolver el
  enlace solo si `links.domain_id` coincide con el `Host` (un código de un
  dominio no debe resolver en otro).
- `shortUrl` se construye con el dominio de la clave, no con la cabecera
  `Host` de la petición de creación (`v1/links.ts:339-341`).

---

## S10. Alcance de las claves (enero)

- `api_keys.scopes TEXT` (JSON): `["links:create", "links:read", "links:delete"]`.
- `api_keys.allowed_target_prefixes TEXT` (JSON): si existe, rechazar con
  `403` cualquier `longUrl` que no empiece por uno de ellos (misma
  comprobación de host que S2).
- La clave de decidelo: `["links:create","links:read"]` y prefijo
  `https://decidelo.app/amigo-secreto?c=`. Así, si se filtra, no sirve para
  crear enlaces a otros sitios.

---

## Entrega

- Un PR por solicitud (o los grupos del orden sugerido), con tests.
- Al terminar S1–S4, comunicar a decidelo: URL base de la API, formato final de
  `/api/v1/links/batch`, límite configurado y confirmación de S3 con el
  resultado de `curl -sI` y del test de Playwright con `#k=`.
