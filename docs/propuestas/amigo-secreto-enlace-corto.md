# Propuesta: enlace corto de amigo secreto con linkzip.uk

**Estado:** propuesta. **No entra** en el rediseño de amigo secreto
(`docs/sdd-amigo-secreto.md`) para no agrandar esa entrega. Requiere cambios
previos en linkzip, descritos en
**[solicitudes-linkzip.md](./solicitudes-linkzip.md)**.

## Qué se gana

- Enlaces de unos 40 caracteres en WhatsApp en vez de 150–300.
- Base para «ya lo abrió» sin servidor propio (estadísticas por enlace de
  linkzip, que ya distingue bots), adelantando parte de
  [amigo-secreto-servidor.md](./amigo-secreto-servidor.md).

## Diseño

Parte el enlace v2 de la SDD (§5.2) en dos para que linkzip nunca tenga la
clave:

```
Participante recibe:   https://linkzip.uk/<código>#k=<clave base64url>
linkzip guarda:        https://decidelo.app/amigo-secreto?c=<banderas‖IV‖cifrado, base64url>
Redirección:           302 Location: <destino guardado, sin fragmento>
El navegador llega a:  https://decidelo.app/amigo-secreto?c=…#k=…   (RFC 9110 §10.2.2: el fragmento se hereda)
```

- La página acepta las dos formas: `#v=2&d=` (clave y cifrado juntos) y
  `?c=` + `#k=` (separados). Mismo lector, distinto origen de los bytes.
- `?c=` llega a servidores (Cloudflare, linkzip, Google Safe Browsing,
  Workers AI): solo es texto cifrado sin clave.
- **El enlace completo `#v=2&d=` se ofrece siempre** junto al corto, y es el
  que se usa si linkzip falla, tarda más de 3 s o devuelve error.

## Lado de decidelo

1. **Primer código de servidor del sitio**: `POST /api/enlace-corto` en el
   Worker (Workers con `assets` + `main`), con la clave de linkzip en un
   secret (`LINKZIP_API_KEY`).
2. El endpoint:
   - acepta solo destinos `https://decidelo.app/amigo-secreto?c=[A-Za-z0-9_-]{20,600}`, y hasta 60 por petición;
   - limita por IP (p. ej. 5 peticiones/min) y, si hay abuso, Turnstile;
   - llama al endpoint por lotes de linkzip y devuelve `[{c, shortUrl}]`.
3. Interruptor `ENLACE_CORTO=off|on` para apagarlo sin desplegar código.
4. AGENTS.md y la política de privacidad se actualizan (deja de ser «sin backend»).

## Condiciones para empezar

Las solicitudes **S1–S4** de `solicitudes-linkzip.md` en producción en
linkzip, y verificado en iOS Safari, Chrome Android y el navegador interno de
WhatsApp (iOS y Android) que `#k=` sobrevive a la redirección.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La cuenta deja de ser Pro o se borra | S3 (comportamiento fijado por enlace); enlace completo siempre disponible |
| Falso positivo de moderación pone un sobre en cuarentena | S2 (dominio de confianza) |
| Pico de diciembre agota el límite | S1 (lotes) y límite propio de la clave |
| linkzip caído | Tiempo máximo de 3 s y enlace completo |
