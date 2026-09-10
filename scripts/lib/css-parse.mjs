/**
 * Troceado de CSS compartido por los tests.
 *
 * Contar llaves a pelo parece suficiente hasta que aparece una llave donde no
 * se la espera. `content: "}"` es CSS perfectamente válido, y un contador
 * ingenuo lo lee como el final de la regla: parte la declaración por la mitad
 * y arrastra la basura a lo que venga detrás. Un comentario hace lo propio en
 * el CSS fuente, donde queda pegado al selector siguiente.
 *
 * Este módulo ignora lo que va dentro de comentarios y de cadenas, así que las
 * llaves que cuenta son siempre estructura y no contenido.
 */

/** Quita comentarios respetando las cadenas: /* dentro de "..." no abre nada. */
export function stripComments(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const end = findStringEnd(css, i);
      out += css.slice(i, end);
      i = end;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Índice justo después de la cadena que empieza en `start`, con escapes. */
function findStringEnd(css, start) {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === '\\') i += 2;
    else if (css[i] === quote) return i + 1;
    else i++;
  }
  return css.length; // cadena sin cerrar: se traga el resto y no cuelga
}

/**
 * Trocea en bloques de primer nivel. Devuelve { head, body, raw } por bloque:
 * head es el selector o la at-rule, body lo de dentro de las llaves, raw el
 * texto completo tal cual, que es lo que guardan los snapshots.
 */
export function splitTopLevel(css) {
  const bloques = [];
  let depth = 0, start = 0, i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") { i = findStringEnd(css, i); continue; }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') {
      depth--;
      i++;
      if (depth === 0) {
        const raw = css.slice(start, i).trim();
        start = i;
        if (!raw) continue;
        const open = raw.indexOf('{');
        bloques.push({ head: raw.slice(0, open).trim(), body: raw.slice(open + 1, -1), raw });
      }
      continue;
    }
    i++;
  }
  return bloques;
}

/**
 * Reglas planas, entrando en @media y @supports y arrastrando su condición.
 * Las at-rules que no contienen reglas (@keyframes, @property, @font-face) se
 * devuelven enteras: su interior no son selectores.
 */
export function flatRules(css, media = null, out = []) {
  for (const { head, body, raw } of splitTopLevel(css)) {
    if (/^@(media|supports|container|layer)\b/.test(head)) {
      flatRules(body, media ? `${media} & ${head}` : head, out);
    } else if (!head.startsWith('@')) {
      out.push({ media, selector: head, body: body.trim(), raw });
    }
  }
  return out;
}
