# SDD — El impostor en línea

Estado: **implementado** (v1). Rama de trabajo: `claude/confident-heisenberg-oe3y7e`.

Es la única herramienta del sitio con servidor. Este documento recoge qué
hace, por qué es así y qué no hace, para quien lo mantenga después.

## 1. Qué es

Juego de grupo: a todos los jugadores les toca la misma palabra menos a uno o
varios, los impostores, que solo saben la categoría. Cada uno desde su móvil,
sin cuentas. Un grupo real de 22 personas es el caso de diseño; el máximo es 24.

Flujo: el anfitrión crea una sala y comparte el enlace (`/impostor#sala=KQMRT`)
o el código de cinco letras → los demás entran con su nombre → el anfitrión
ajusta y empieza → ronda de pistas con turno y reloj por jugador, llevados por
el anfitrión → votación → se va el más votado → se repite hasta que gane el
grupo (ningún impostor vivo) o los impostores (tantos como los demás).

## 2. Arquitectura

```
navegador (src/scripts/impostor.js)
   │  POST /api/impostor/salas            crea → { codigo, token }
   │  WS   /api/impostor/salas/:c/ws      mensajes JSON
   ▼
worker/index.js        enruta y aplica Rate Limiting por IP
   ▼
worker/sala.js         Durable Object `SalaImpostor`, uno por sala
   ▼
src/scripts/impostor-logica.js   TODAS las reglas, sin red ni DOM
```

- **`impostor-logica.js`** es el juego. Funciones que modifican la sala y
  devuelven `{ ok }` o `{ error, mensaje }`; `vistaPara(sala, jugador, …)`
  construye lo que ese jugador puede ver. Se prueba con Node
  (`scripts/impostor-check.mjs`).
- **`impostor-comun.js`** son límites y limpieza de entradas. Lo importan el
  servidor y la página. Existe separado para que la página **no** arrastre la
  lista de palabras.
- **`impostor-palabras.js`** solo la importa el servidor y, en build, el
  selector de categoría de la página.
- **`worker/sala.js`** guarda la sala en `ctx.storage` tras cada cambio, atiende
  los sockets con la API de hibernación y envía a cada jugador su vista.

## 3. Protocolo

Cliente → servidor (JSON, máx. 2 KB, máx. 40 mensajes cada 10 s por socket):

| `t` | Quién | Efecto |
|---|---|---|
| `hola` `{nombre, token?}` | cualquiera | identifica; sin token, entra como jugador nuevo (solo en el lobby) |
| `config` `{cambios}` | anfitrión, lobby | categoría, impostores, segundos, vueltas, `anfitrionJuega`, `impostorVeCategoria` |
| `iniciar` | anfitrión, lobby | reparte roles y empieza la ronda 1 |
| `turno` `{op}` | anfitrión, ronda | `empezar` · `siguiente` · `pausar` · `reiniciar` · `mas` (+15 s) |
| `votacion` | anfitrión, ronda | abre la votación |
| `votar` `{por}` | jugador vivo | cambia su voto; si votan todos, se cierra sola |
| `cerrar` | anfitrión, votación | cierra con los votos que haya |
| `continuar` | anfitrión, resultado | siguiente ronda (si no hay ganador) |
| `nueva` | anfitrión | vuelve al lobby con los mismos jugadores (vale en cualquier fase) |
| `quitar` `{id}` · `ceder` `{id}` · `salir` | ver reglas | gestión de la sala |

Servidor → cliente: `bienvenida {id, token}`, `estado {…}` (la vista completa
de ese jugador, tras cada cambio) y `error {error, mensaje}`.

Cierres propios: `4001` otra pestaña · `4002` te quitaron · `4003` rechazado
(partida empezada, sala llena, nombre vacío) · `4004` la sala no existe · `1008`
demasiados mensajes. Ninguno se arregla reintentando; el resto sí.

## 4. Reglas del juego

- 3 a 24 jugadores. Impostores: automático = `floor(n / 6)`, mínimo 1; el
  anfitrión puede fijarlo, con tope `floor((n − 1) / 2)`.
- El anfitrión juega o solo modera (entonces ve la palabra y los impostores y no
  vota ni tiene turno).
- Cada ronda: orden al azar de los vivos; 1 a 3 vueltas de pistas; turno de 20 a
  120 s. El primer turno espera al anfitrión (hay que mirar el rol); los
  siguientes arrancan solos al pasar.
- Voto: uno por jugador vivo, no por sí mismo, cambiable hasta que se cierra. Se
  va el más votado; con empate o sin votos no se va nadie. Se revela si era
  impostor, no quién votó a quién.
- Gana el grupo si no queda ningún impostor; ganan los impostores si son tantos
  como los demás. Entonces se revela palabra e impostores.
- Nadie entra con la partida empezada. Quien se cae vuelve con su token y
  recupera su rol; en plena partida queda «sin conexión».

## 5. Privacidad y límites

- Se guarda: nombre, estado de la partida, un token aleatorio de 128 bits por
  jugador. No IP, no historial, no cuentas.
- La sala se borra a las **6 h sin actividad** (alarma) o cuando sale el último
  jugador en el lobby.
- El token no sale nunca de `bienvenida` hacia su dueño. Ninguna vista lleva
  tokens ajenos; el test lo comprueba en los bytes del socket.
- Rate Limiting por IP: 10 salas/min y 60 conexiones/min (`wrangler.jsonc`).
- Nombres: sin caracteres de control ni de inversión de texto, máx. 20, únicos
  sin distinguir tildes ni mayúsculas, siempre con `textContent`.
- Azar: `crypto.getRandomValues` con rechazo de sesgo (`entero`).

## 6. Coste

Precios consultados el 26 de noviembre de 2026 en
developers.cloudflare.com (páginas de Durable Objects). El plan **Workers Paid**
(5 USD/mes) incluye 1 M de peticiones y 400 000 GB-s de duración al mes; por
encima, 0,15 USD por millón de peticiones y 12,50 USD por millón de GB-s. Un
mensaje de entrada cuenta 1/20 de petición y los de salida no se cobran.

Con **hibernación** (la que usa `sala.js`), una partida de 22 personas durante
30 minutos son unos cientos de mensajes y casi nada de duración. Sin ella, el
socket abierto cobra tiempo de ejecución durante toda la partida: por eso
**nunca** se cambia `ctx.acceptWebSocket` por `ws.accept()`.

## 7. Qué no hace (todavía)

- **No hay chat ni pistas escritas en la app**: las pistas se dicen en voz alta
  o por videollamada. Es lo habitual del juego y evita moderar texto.
- **El servidor no pasa el turno solo al llegar a cero**: el reloj se ve igual
  en todos los móviles (marcas absolutas del servidor), pero quien decide cuándo
  pasar es el anfitrión. Tampoco hay aviso sonoro: iría contra la regla de «sin
  sonidos» (AGENTS.md, regla 6).
- **El impostor expulsado no adivina la palabra.** Es una variante habitual; se
  puede añadir como `config.impostorAdivina` sin tocar el protocolo existente.
- **Sin transferencia automática de anfitrión** si su móvil se pierde: puede
  volver con su token, o ceder el mando mientras está conectado.

## 8. Cómo probarlo

```bash
npm run build && npm run preview:cf      # dos navegadores: crear sala y unirse
node scripts/impostor-check.mjs          # reglas, 22 jugadores, privacidad
npm run test:sala                        # wrangler dev + 22 sockets + reconexión
npm run test:estado                      # vistas con un WebSocket falso
```
