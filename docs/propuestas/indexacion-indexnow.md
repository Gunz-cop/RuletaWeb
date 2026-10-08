# Propuesta: indexación automática con IndexNow (SDI)

**Qué es.** El SDI es una herramienta de indexación que el propietario ya
construyó en otro repositorio. Avisa a los buscadores de las páginas nuevas o
cambiadas mediante **IndexNow**, el protocolo que usan Bing, Yandex, Seznam,
Naver y otros (y del que se alimentan buscadores y asistentes que usan el
índice de Bing).

**Estado hoy en este repositorio.**

- No hay IndexNow: ni clave publicada en `public/`, ni envío tras el despliegue.
- Existe `scripts/google-indexing.js` (`npm run index`), que usa la API de
  indexación de Google con una cuenta de servicio y se lanza a mano.
  Tiene una mala práctica a corregir: desactiva la verificación TLS
  (`NODE_TLS_REJECT_UNAUTHORIZED = '0'`). Además, Google limita esa API
  oficialmente a ofertas de empleo y emisiones en directo.

**Propuesta.**

1. Traer el SDI del otro repositorio (como paquete, submódulo o copiándolo
   en `scripts/`; a decidir al ver su código).
2. Publicar la clave de IndexNow (`public/<clave>.txt`).
3. Enviar a IndexNow **solo las URL que cambiaron** en cada despliegue de
   `main`: comparar el sitemap (`<lastmod>`) o los archivos de `dist/` con el
   despliegue anterior. Lanzarlo desde el CI tras `wrangler deploy`.
4. Revisar `google-indexing.js`: quitar la desactivación de TLS y decidir si
   se mantiene, dado su uso limitado por Google.
5. Documentar el comando en AGENTS.md.

**Pendiente.** Enlace al repositorio del SDI para ver su interfaz y cómo se
configura.
