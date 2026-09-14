// ==========================================================
// ACCESO SEGURO A localStorage
// ==========================================================
// Safari en modo privado (y cualquier navegador con almacenamiento
// bloqueado por política) lanza en setItem/getItem en vez de devolver
// silenciosamente. Sin este helper esa excepción no capturada mataba
// initRoulette antes de registrar un solo listener, así que la ruleta
// quedaba muerta al tacto. Degradamos a un Map en memoria: la sesión
// actual sigue funcionando, solo no persiste entre recargas.
const memoryStore = new Map();

export function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}
