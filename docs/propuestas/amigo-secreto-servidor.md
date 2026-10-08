# Propuesta: amigo secreto con servidor sin conocimiento

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

**Requisitos.** Los enlaces v1 y v2 del rediseño (SDD de amigo secreto) siguen funcionando; la
versión con servidor es un formato v3. AGENTS.md («no hay backend») y la
política de privacidad se actualizan en el mismo PR. Borrado automático del
sorteo a los 60 días de la fecha del intercambio.

