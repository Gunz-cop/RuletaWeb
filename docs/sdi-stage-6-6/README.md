# SDI — Etapa 6.6: shadow baseline-first en RuletaWeb

## Estado

Pendiente de revisión del Arquitecto Revisor. Esta etapa genera evidencia
read-only; no migra RuletaWeb ni ejecuta IndexNow, Google, deploy o Cloudflare.

## Artefacto aprobado

| Campo | Valor |
| --- | --- |
| Commit SDI | `3546d8d79d4fcc285b2ff662422deb6d13b5eb2d` |
| Versión | `0.1.0` |
| Tarball | `sdi-cli-0.1.0.tgz` |
| SHA-256 | `aac5aec39ce06f988e09f8751c881a989f0ca15f560c77da06c19529ef9088a1` |

## Ejecución

Desde un checkout limpio de `main`:

```powershell
node scripts/sdi-shadow-compare.mjs
```

El harness construye el sitio dos veces, instala el tarball aprobado solamente
en un directorio temporal y usa exclusivamente el binario público `sdi`.
Ejecuta un dry-run sin state, un baseline confirmado temporal y un segundo
dry-run temporal. El directorio, state y reportes temporales se eliminan en un
`finally`, incluso si falla una comprobación.

El sitemap usado por SDI es el mismo `dist/sitemap-0.xml` que consume el script
Google existente. Ese script no se ejecuta ni se modifica. La evidencia
redactada queda en `shadow-comparison.json`; no contiene secretos, state ni
rutas absolutas locales.

`sdi.config.mjs` declara `trailingSlash: "never"`, consistente con Astro. La
configuración del harness apunta el state y el reporte a rutas temporales, por
lo que `.sdi/` del proyecto nunca se crea durante la etapa.
