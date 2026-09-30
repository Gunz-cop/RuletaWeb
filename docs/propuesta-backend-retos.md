# Propuesta: retos en vivo con backend en Cloudflare

Estado: **propuesta, no implementada.** Hoy los retos a distancia de piedra,
papel o tijera funcionan sin servidor (ver `src/scripts/ppt-reto.js`). Este
documento recoge qué ganaríamos con un backend mínimo, qué implica y cuánto
costaría, para decidirlo más adelante.

## Por qué

El reto por enlace (ida y vuelta) funciona, pero tiene dos límites que no se
pueden cerrar sin servidor:

1. **Trampa por reintento.** Quien recibe el reto puede abrir el enlace en
   una pestaña privada, ver la jugada de quien reta y volver a abrirlo para
   elegir la que gana. El navegador recuerda la primera respuesta, pero una
   pestaña privada o un móvil distinto se lo saltan.
2. **Dos mensajes.** Quien reta solo se entera del resultado si el otro le
   devuelve el enlace. Si no lo hace, nunca lo sabe.

Con un servidor que guarde la partida, cada jugador elige desde su móvil,
la primera jugada de cada uno es la definitiva y **los dos ven el resultado a
la vez**, sin segundo mensaje.

## Cómo sería

- **Un Worker** en el mismo proyecto de Cloudflare que ya publica el sitio
  (`wrangler.jsonc`, Worker `azares`), con rutas bajo `/api/retos/…`. El
  resto del sitio sigue siendo HTML estático.
- **Un Durable Object por partida** (almacenamiento SQLite). Es la pieza de
  Cloudflare pensada para esto: un objeto con estado por reto, que serializa
  las jugadas (no hay carrera si los dos eligen a la vez) y avisa a los dos
  navegadores.
- **Flujo:**
  1. `POST /api/retos` crea la partida: nombres y lo que se decide.
     Devuelve un id aleatorio largo (el enlace es la única "llave").
  2. Cada jugador envía su jugada una sola vez. El servidor no revela
     ninguna jugada hasta tener las dos.
  3. Los navegadores reciben el resultado por WebSocket (con hibernación,
     que Cloudflare factura a una fracción de las peticiones normales) o,
     más sencillo, preguntando cada pocos segundos mientras la página está
     abierta.
  4. La partida se borra sola a las 24 horas (alarma del Durable Object).
- **Compatibilidad:** el reto por enlace actual se queda como alternativa
  si el servidor no responde.

## Seguridad y privacidad

- **Sin cuentas ni datos personales**: solo los nombres que escriban (pueden
  ser apodos), lo que se decide y las jugadas. Nada de IP guardada.
- **Borrado automático** a las 24 horas.
- **Ids no adivinables** (≥ 128 bits de azar): sin el enlace no se puede
  entrar en una partida ajena.
- **Límites de abuso**: tamaño máximo de los textos (los mismos 20 y 60
  caracteres de hoy), una jugada por jugador y partida, y Rate Limiting de
  Cloudflare por IP en `POST /api/retos` para que nadie llene el
  almacenamiento.
- **Textos siempre como texto**, nunca como HTML, igual que ahora.
- **Política de privacidad**: habría que cambiar la sección 2 ("Retos a
  distancia") para decir que la partida se guarda en servidores de
  Cloudflare durante 24 horas y se borra sola.
- **Regla del proyecto**: AGENTS.md dice que el sitio no tiene backend. Si
  se aprueba, hay que actualizarlo en el mismo cambio y explicar el porqué.

## Coste

Precios oficiales consultados el 30 de septiembre de 2026
(developers.cloudflare.com, páginas de precios de Workers, Durable Objects
y KV). Las peticiones a los archivos estáticos del sitio son gratis e
ilimitadas y no cuentan en estos límites.

**Plan gratuito (Workers Free), límites diarios:**

| Recurso | Incluido al día |
|---|---|
| Peticiones al Worker | 100.000 |
| Peticiones a Durable Objects | 100.000 |
| Filas escritas (SQLite) | 100.000 |
| Filas leídas (SQLite) | 5 millones |
| Almacenamiento | 5 GB en total |

Una partida gasta del orden de **10 peticiones** (crear, abrir dos veces,
dos jugadas y unas cuantas consultas de estado) y **menos de 10 filas
escritas**. Con eso, el plan gratuito aguanta unas **10.000 partidas al
día**. El sitio hoy tiene del orden de cientos de visitas diarias en todas
sus herramientas, así que el coste esperado es **0 USD**.

**Si algún día se supera** (por ejemplo, un pico viral en diciembre), el plan
**Workers Paid cuesta 5 USD al mes** e incluye 10 millones de peticiones al
Worker y 1 millón a Durable Objects al mes; por encima, 0,15 USD por millón
de peticiones a Durable Objects. Un mes con 100.000 partidas seguiría
dentro de esos 5 USD.

Alternativa descartada: **Workers KV**. Su plan gratuito solo permite 1.000
escrituras al día (unas 300 partidas) y no garantiza que los dos jugadores
lean el mismo estado al instante, que es justo lo que necesita un reto.

## Esfuerzo estimado

Pequeño-medio: el Worker y el Durable Object (unas 150 líneas), el cambio
del modo "A distancia" en `piedra-papel-tijera.js` para usar la API cuando
esté disponible, tests de la API y de la página, y la actualización de
AGENTS.md y de la política de privacidad.
