// ==========================================================
// AMIGO SECRETO — lector mínimo de .xlsx (RF-02)
// ==========================================================
// Se carga con import() solo cuando alguien elige un Excel. Un .xlsx es un
// ZIP con XML: se lee el directorio central, se descomprime con
// DecompressionStream('deflate-raw') y se toman las tres primeras columnas de
// la primera hoja. Sin dependencias. Si el navegador no tiene
// DecompressionStream (por debajo de Chrome 103 / iOS 16.4) lanza un error
// que la página traduce a «guárdalo como CSV».

async function inflar(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('sin-descompresion');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function entradas(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('no-es-zip');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('zip-dañado');
    const metodo = v.getUint16(p + 10, true);
    const tam = v.getUint32(p + 20, true);
    const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(buf.subarray(p + 46, p + 46 + ln));
    out.set(nombre, { metodo, tam, local });
    p += 46 + ln + le + lc;
  }
  return out;
}

async function leerArchivo(buf, e) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ini = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
  const datos = buf.subarray(ini, ini + e.tam);
  const bytes = e.metodo === 0 ? datos : await inflar(datos);
  return new TextDecoder().decode(bytes);
}

const columna = (ref) => {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

/** Devuelve las filas [[col A, col B, col C], …] de la primera hoja como texto. */
export async function leerXlsx(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const zip = entradas(buf);
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');

  const compartidas = [];
  if (zip.has('xl/sharedStrings.xml')) {
    const doc = xml(await leerArchivo(buf, zip.get('xl/sharedStrings.xml')));
    for (const si of doc.getElementsByTagName('si')) {
      compartidas.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
    }
  }
  const hoja = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!hoja) throw new Error('sin-hojas');
  const doc = xml(await leerArchivo(buf, zip.get(hoja)));
  const filas = [];
  for (const row of doc.getElementsByTagName('row')) {
    const fila = ['', '', ''];
    for (const c of row.getElementsByTagName('c')) {
      const col = columna(c.getAttribute('r') ?? 'A');
      if (col > 2) continue;
      const t = c.getAttribute('t');
      let val = '';
      if (t === 's') val = compartidas[Number(c.getElementsByTagName('v')[0]?.textContent)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else val = c.getElementsByTagName('v')[0]?.textContent ?? '';
      fila[col] = val.trim();
    }
    if (fila[0]) filas.push(fila);
  }
  return filas;
}
