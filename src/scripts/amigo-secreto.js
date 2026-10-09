// ==========================================================
// AMIGO SECRETO — página (organizar, repartir y abrir el sobre)
// ==========================================================
// SDD de amigo secreto (docs/sdd-amigo-secreto.md). La lógica que se puede
// probar sin navegador vive en amigo-secreto-logica.js (sorteo y lectura de
// lo escrito) y amigo-secreto-enlace.js (enlaces y sorteo guardado).
//
// Reglas de esta página:
// - Todo texto del usuario se pinta con textContent: nunca innerHTML.
// - El marcado repetido se clona de <template> del .astro, donde Tailwind ve
//   sus clases; el JS solo cambia atributos (hidden, data-*, aria-*).
// - localStorage puede fallar (modo privado): la herramienta sigue igual.

import {
  sortearCadena, matrizPermitidos, barajar, leerParticipantes, escribirParticipantes, duplicados,
  leerExclusiones, problemaEvidente, leerCSV, quitarCabecera, numeroWhatsapp, formatoPresupuesto, generarIcs, claveExacta,
} from './amigo-secreto-logica.js';
import { leerEnlace, crearV2, urlV2, cargarGuardado, guardar, borrarGuardado } from './amigo-secreto-enlace.js';

const $ = (id) => document.getElementById(id);
const movimientoReducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const almacen = (() => { try { return window.localStorage; } catch { return null; } })();
const almacenSeguro = almacen ?? { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/* ---------------- utilidades de interfaz ---------------- */

let temporizadorAviso = 0;
function aviso(texto) {
  const t = $('toast-message');
  if (!t) return;
  t.textContent = texto;
  clearTimeout(temporizadorAviso);
  t.dataset.visible = 'true';
  try { t.showPopover(); } catch { /* sin Popover API: basta data-visible */ }
  temporizadorAviso = setTimeout(() => {
    try { t.hidePopover(); } catch { /* sin Popover API */ }
    t.dataset.visible = 'false';
  }, 2600);
}

// Confirmación en <dialog>; sin soporte, window.confirm.
function confirmar(texto, si = 'Sí') {
  const d = $('as-confirmar');
  if (!d || typeof d.showModal !== 'function') return Promise.resolve(window.confirm(texto));
  $('as-conf-texto').textContent = texto;
  $('as-conf-si').textContent = si;
  return new Promise((resolver) => {
    d.addEventListener('close', () => resolver(d.returnValue === 'si'), { once: true });
    d.returnValue = '';
    d.showModal();
  });
}

function clonar(idPlantilla) {
  return $(idPlantilla).content.firstElementChild.cloneNode(true);
}

/* ---------------- el sobre ---------------- */

// Ciclo de movimiento (SDD §6.2): anticipación, acción y aterrizaje. La
// promesa se resuelve cuando el nombre ya se ve.
async function abrirSobre(sobre) {
  if (sobre.dataset.state === 'abierto') return;
  const flap = sobre.querySelector('.env-flap');
  const card = sobre.querySelector('.env-card');
  const seal = sobre.querySelector('.env-seal');
  if (movimientoReducido() || typeof sobre.animate !== 'function') {
    sobre.dataset.state = 'abierto';
    card.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    return;
  }
  sobre.style.animation = 'none';
  await sobre.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }], { duration: 140, easing: 'ease-out', fill: 'forwards' }).finished;
  seal.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  sobre.animate([{ transform: 'scale(0.97)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
  await flap.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished;
  flap.style.zIndex = '0';
  card.style.zIndex = '5';
  try { if (navigator.vibrate) navigator.vibrate(25); } catch { /* sin vibración */ }
  await card.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-68%)', offset: 0.75 },
    { transform: 'translateY(-62%)' },
  ], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished;
  sobre.dataset.state = 'abierto';
  for (const el of [sobre, flap, card, seal]) el.getAnimations().forEach((a) => a.cancel());
  flap.style.zIndex = card.style.zIndex = sobre.style.animation = '';
}

function cerrarSobre(sobre) {
  sobre.setAttribute('aria-label', 'Sobre de tu amigo secreto. Toca para abrirlo.');
  sobre.getAnimations?.({ subtree: true }).forEach((a) => a.cancel());
  sobre.dataset.state = 'cerrado';
  sobre.querySelectorAll('.env-flap, .env-card').forEach((el) => { el.style.zIndex = ''; });
  sobre.style.animation = '';
}

/* ==========================================================
   PANTALLA «ABRIR»
   ========================================================== */

function pintarDetalles(datos) {
  const dl = $('as-abrir-detalles');
  let alguno = false;
  const poner = (campo, texto) => {
    const caja = dl.querySelector(`[data-campo="${campo}"]`);
    caja.hidden = !texto;
    if (texto) { caja.querySelector('dd').textContent = texto; alguno = true; }
  };
  poner('presupuesto', datos.presupuesto ? formatoPresupuesto(datos.presupuesto) : '');
  let fecha = '';
  if (datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    const [y, m, d] = datos.fecha.split('-').map(Number);
    fecha = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
  }
  poner('fecha', fecha);
  poner('lugar', datos.lugar ?? '');
  poner('pista', datos.pista ?? '');
  poner('mensaje', datos.mensaje ?? '');
  dl.hidden = !alguno;
}

function descargarIcs(datos) {
  const ics = generarIcs(datos);
  if (!ics) return;
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amigo-secreto.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function modoAbrir(enlace) {
  document.body.dataset.asModo = 'abrir';
  $('as-app').dataset.modo = 'abrir';
  $('organizer-screen').hidden = true;
  $('reveal-screen').hidden = false;
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
  document.title = 'Tu amigo secreto | Decídelo.app';
  window.scrollTo(0, 0);

  const sobre = $('gift-container');
  if (!enlace.datos) {
    $('as-abrir-titulo').textContent = 'Este enlace no funciona';
    $('as-abrir-intro').textContent = enlace.error === 'desconocido'
      ? 'Este enlace es de una versión más nueva de la página. Recarga o actualiza tu navegador e inténtalo de nuevo.'
      : 'Parece que se copió incompleto. Pídele a quien organizó el sorteo que te lo envíe de nuevo.';
    $('as-sobre-zona').hidden = true;
    return;
  }

  const datos = enlace.datos;
  $('revealed-name').textContent = datos.nombre;
  if (datos.grupo) { $('as-abrir-grupo').textContent = datos.grupo; $('as-abrir-grupo').hidden = false; }
  const abrir = async () => {
    await abrirSobre(sobre);
    sobre.setAttribute('aria-label', `Te toca regalarle a ${datos.nombre}`);
    pintarDetalles(datos);
    if (datos.fecha) $('as-calendario').hidden = false;
  };
  sobre.addEventListener('click', abrir, { once: true });
  $('as-calendario').addEventListener('click', () => descargarIcs(datos));
}

/* ==========================================================
   PANTALLA «ORGANIZAR»
   ========================================================== */

function modoOrganizar() {
  const lista = $('participants-textarea');
  const exclusiones = $('exclusions-textarea');
  const btn = $('btn-draw');
  const fichas = $('participants-tags-container');
  const avisoSorteo = $('draw-warning');
  const camposDetalle = ['grupo', 'presupuesto', 'fecha', 'lugar', 'mensaje'];

  let participantes = [];
  let sorteo = null; // formato de amigo-secreto-enlace.js (version 2)
  const TEXTO_EMPAREJAR = $('as-emparejar').textContent.trim();
  let emparejando = null; // null = apagado; -1 = esperando el primero; i = primero elegido
  let bloqueo = '';

  /* ---- participantes ---- */

  // Deseos por persona (clave: nombre normalizado). Se escriben en su
  // propia sección; un «Ana | café» escrito en la lista o una columna C del
  // Excel también los rellenan.
  const deseos = new Map();

  function actualizar() {
    participantes = leerParticipantes(lista.value);
    for (const p of participantes) {
      const k = claveExacta(p.nombre);
      if (p.pista && !deseos.has(k)) deseos.set(k, p.pista);
      p.pista = deseos.get(k) ?? '';
    }
    $('participants-count').textContent = `${participantes.length} ${participantes.length === 1 ? 'persona' : 'personas'}`;
    pintarFichas();
    pintarDeseos();
    validar();
  }

  function pintarDeseos() {
    const ul = $('as-deseos');
    const enFoco = document.activeElement?.closest?.('#as-deseos li')?.dataset.clave;
    ul.replaceChildren(...participantes.map((p) => {
      const li = clonar('tpl-deseo');
      const k = claveExacta(p.nombre);
      li.dataset.clave = k;
      li.querySelector('[data-nombre]').textContent = p.nombre;
      const input = li.querySelector('[data-deseo]');
      input.value = deseos.get(k) ?? '';
      input.setAttribute('aria-label', `Deseo o pista de ${p.nombre}`);
      input.addEventListener('input', () => {
        const v = input.value.trim();
        if (v) deseos.set(k, v); else deseos.delete(k);
        p.pista = v;
        contarDeseos();
      });
      return li;
    }));
    if (enFoco) ul.querySelector(`li[data-clave="${CSS.escape(enFoco)}"] input`)?.focus();
    $('as-deseos-vacio').hidden = participantes.length > 0;
    contarDeseos();
  }

  function contarDeseos() {
    const n = participantes.filter((p) => deseos.get(claveExacta(p.nombre))).length;
    $('as-deseos-cuenta').textContent = n ? `${n} de ${participantes.length}` : '';
  }

  function pintarFichas() {
    const { parecidos } = duplicados(participantes);
    const marcados = new Set(parecidos.flat());
    fichas.replaceChildren(...participantes.map((p, i) => {
      const li = clonar('tpl-ficha');
      const nombre = li.querySelector('[data-ficha-nombre]');
      nombre.textContent = p.nombre;
      nombre.dataset.tocable = String(emparejando !== null);
      nombre.addEventListener('click', () => tocarFicha(i));
      if (marcados.has(p.nombre)) li.dataset.aviso = 'true';
      if (emparejando === i) li.dataset.elegida = 'true';
      const quitar = li.querySelector('[data-ficha-quitar]');
      quitar.setAttribute('aria-label', `Quitar a ${p.nombre}`);
      quitar.addEventListener('click', () => {
        participantes.splice(i, 1);
        lista.value = escribirParticipantes(participantes);
        actualizar();
      });
      return li;
    }));
  }

  function tocarFicha(i) {
    if (emparejando === null) return;
    if (emparejando === -1) { emparejando = i; pintarFichas(); return; }
    if (emparejando !== i) {
      const linea = `${participantes[emparejando].nombre}, ${participantes[i].nombre}`;
      exclusiones.value = (exclusiones.value.trim() ? `${exclusiones.value.trim()}\n` : '') + linea;
      aviso(`${linea}: no se regalarán entre sí`);
    }
    emparejando = -1;
    pintarFichas();
    validar();
  }

  function validar() {
    const n = participantes.length;
    const { exactos, parecidos } = duplicados(participantes);
    const excl = leerExclusiones(exclusiones.value, participantes);
    const lineasExcl = excl.grupos.length + excl.unSentido.length;
    $('as-excl-cuenta').textContent = lineasExcl ? `${lineasExcl} activa${lineasExcl === 1 ? '' : 's'}` : '';

    let msg = '';
    bloqueo = '';
    if (exactos.length) {
      bloqueo = msg = `Hay nombres repetidos: ${exactos.map((g) => `«${g[0]}» (${g.length} veces)`).join(', ')}. Agrega una inicial o un apellido para distinguirlos; si no, quien reciba ese nombre creerá que se tocó a sí mismo.`;
    } else if (excl.desconocidos.length) {
      bloqueo = msg = `En las exclusiones hay nombres que no están en la lista: ${excl.desconocidos.map((x) => `«${x}»`).join(', ')}. Revisa que estén escritos igual.`;
    } else if (excl.sueltos.length) {
      bloqueo = msg = `En las exclusiones, «${excl.sueltos[0]}» está solo en su línea. Escribe en la misma línea, separados por coma, quienes no deben regalarse entre síse.`;
    } else {
      bloqueo = problemaEvidente(participantes, excl);
      msg = bloqueo;
    }
    if (!msg && parecidos.length) {
      msg = `¿Son la misma persona? ${parecidos.map((g) => g.map((x) => `«${x}»`).join(' y ')).join('; ')}. Si son distintas, sortea sin problema.`;
    }
    if (!msg && (n === 2 || n === 3)) {
      msg = `Con ${n} personas cada uno puede deducir quién le regala. Funciona, pero la sorpresa es mejor desde 4.`;
    }
    avisoSorteo.textContent = msg;
    avisoSorteo.hidden = !msg;
    btn.disabled = n < 2 || Boolean(bloqueo);
    $('as-emparejar').hidden = n < 2;
    $('as-falta').hidden = n >= 2;
  }

  /* ---- importar ---- */

  function añadir(nuevos) {
    if (!nuevos.length) return;
    for (const p of nuevos) if (p.pista) deseos.set(claveExacta(p.nombre), p.pista);
    participantes = [...participantes, ...nuevos];
    // La lista queda con nombre y celular; los deseos van en su sección.
    lista.value = escribirParticipantes(participantes.map((p) => ({ ...p, pista: '' })));
    actualizar();
    aviso(`${nuevos.length} ${nuevos.length === 1 ? 'persona añadida' : 'personas añadidas'}`);
  }

  $('csv-file-input').addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      if (/\.xlsx$/i.test(archivo.name)) {
        const { leerXlsx } = await import('./amigo-secreto-xlsx.js');
        añadir(quitarCabecera(await leerXlsx(await archivo.arrayBuffer())));
      } else {
        añadir(leerCSV(await archivo.text()));
      }
    } catch (err) {
      aviso(String(err?.message) === 'sin-descompresion'
        ? 'Tu navegador no abre Excel: guárdalo como CSV e impórtalo'
        : 'No se pudo leer el archivo. Prueba a guardarlo como CSV');
    }
  });

  const contactos = $('as-contactos');
  if (navigator.contacts && typeof navigator.contacts.select === 'function') {
    contactos.hidden = false;
    contactos.addEventListener('click', async () => {
      try {
        const elegidos = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        añadir(elegidos.filter((c) => c.name?.[0]).map((c) => ({ nombre: c.name[0], contacto: c.tel?.[0] ?? '', pista: '' })));
      } catch { /* cancelado */ }
    });
  }

  $('as-emparejar').addEventListener('click', (e) => {
    emparejando = emparejando === null ? -1 : null;
    e.currentTarget.setAttribute('aria-pressed', String(emparejando !== null));
    e.currentTarget.textContent = emparejando === null ? TEXTO_EMPAREJAR : 'Listo, ya terminé de elegir';
    if (emparejando !== null) {
      aviso('Toca los dos nombres');
    }
    pintarFichas();
  });

  lista.addEventListener('input', actualizar);
  exclusiones.addEventListener('input', validar);

  /* ---- sortear ---- */

  function detalles() {
    const d = {};
    for (const c of camposDetalle) {
      const v = $(`as-${c}`).value.trim();
      if (v) d[c] = c === 'presupuesto' ? v.replace(/[^\d]/g, '') || v : v;
    }
    return d;
  }

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const guardado = cargarGuardado(almacenSeguro);
    const enviados = guardado ? guardado.enlaces.filter((l) => l.enviado).length : 0;
    if (enviados && !(await confirmar(`Ya enviaste ${enviados} enlace(s) del sorteo anterior. Si sorteas de nuevo, esos enlaces dejan de coincidir con el nuevo sorteo. ¿Sortear de nuevo?`, 'Sortear de nuevo'))) return;

    // El botón se apaga y avisa ANTES de sortear: con exclusiones muy
    // apretadas el conteo exacto puede tardar en un teléfono lento.
    const textoBoton = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sorteando…';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const excl = leerExclusiones(exclusiones.value, participantes);
      const r = sortearCadena(matrizPermitidos(participantes.length, excl.grupos, excl.unSentido));
      if (!r.orden) {
        avisoSorteo.textContent = r.demostrado
          ? 'Con estas exclusiones no hay sorteo posible. Quita alguna o agrega participantes.'
          : 'No encontramos un sorteo con estas exclusiones. Prueba a quitar alguna.';
        avisoSorteo.hidden = false;
        return;
      }
      sorteo = await construirSorteo(r);
    } catch {
      // Sin Web Crypto (navegador muy viejo o página sin HTTPS) no se sortea:
      // un sorteo con un azar que no es criptográfico no vale.
      avisoSorteo.textContent = 'Tu navegador no permite hacer el sorteo de forma segura. Actualízalo o prueba con Chrome o Safari recientes.';
      avisoSorteo.hidden = false;
      return;
    } finally {
      // Sin validar() aquí: borraría el mensaje de error que se acaba de
      // escribir (también corre tras los return de arriba).
      btn.textContent = textoBoton;
      btn.disabled = false;
    }
    validar();
    guardar(almacenSeguro, sorteo);
    $('saved-draw').hidden = true;
    pintarResultado(true);
  });

  async function construirSorteo({ orden, metodo, uniforme }) {
    const n = orden.length;
    const base = location.origin + location.pathname;
    const det = detalles();
    const numeros = barajar(Array.from({ length: n }, (_, i) => i + 1));
    const etiqueta = (i) => `#${numeros[i]}`;
    const pares = orden.map((da, k) => ({ da, recibe: orden[(k + 1) % n] }));
    const enlaces = [];
    for (const { da, recibe } of pares) {
      const p = participantes[recibe];
      const d = await crearV2({ ...det, nombre: p.nombre, pista: p.pista });
      enlaces.push({ nombre: participantes[da].nombre, contacto: participantes[da].contacto, url: urlV2(base, d), enviado: false });
    }
    // Las filas se muestran en el orden de la lista, no en el de la cadena.
    const enLista = new Map(participantes.map((p, i) => [p.nombre, i]));
    enlaces.sort((a, b) => enLista.get(a.nombre) - enLista.get(b.nombre));
    return {
      version: 2,
      fecha: Date.now(),
      texto: lista.value,
      exclusiones: exclusiones.value,
      deseos: Object.fromEntries(deseos),
      detalles: det,
      metodo: uniforme ? metodo : 'busqueda',
      matriz: barajar(pares.map(({ da, recibe }) => ({ da: etiqueta(da), recibe: etiqueta(recibe) }))),
      enlaces,
    };
  }

  /* ---- resultado ---- */

  function textoMensaje(e) {
    const grupo = sorteo.detalles?.grupo ? ` de ${sorteo.detalles.grupo}` : '';
    return `¡Hola ${e.nombre}! Este es tu enlace del amigo secreto${grupo}. Ábrelo cuando nadie esté mirando: ${e.url}`;
  }

  function marcarEnviado(e, fila) {
    e.enviado = true;
    fila.dataset.enviado = 'true';
    fila.querySelector('[data-enviar]').textContent = 'Reenviar';
    guardar(almacenSeguro, sorteo);
    contarEnviados();
  }

  function contarEnviados() {
    const n = sorteo.enlaces.filter((e) => e.enviado).length;
    $('as-enviados').textContent = `${n} de ${sorteo.enlaces.length} enviados`;
  }

  function abrirWhatsapp(e) {
    const texto = encodeURIComponent(textoMensaje(e));
    const num = numeroWhatsapp(e.contacto);
    window.open(num ? `https://wa.me/${num}?text=${texto}` : `https://api.whatsapp.com/send?text=${texto}`, '_blank', 'noopener');
  }

  function filaEnlace(e, i) {
    const fila = clonar('tpl-enlace');
    fila.querySelector('[data-num]').textContent = String(i + 1).padStart(2, '0');
    fila.dataset.enviado = String(e.enviado);
    fila.querySelector('[data-nombre]').textContent = e.nombre;
    fila.querySelector('[data-contacto]').textContent = e.contacto || 'Sin contacto';
    const enviar = fila.querySelector('[data-enviar]');
    if (e.enviado) enviar.textContent = 'Reenviar';
    const puedeCompartir = typeof navigator.share === 'function';
    const wa = fila.querySelector('[data-whatsapp]');
    if (puedeCompartir && numeroWhatsapp(e.contacto)) {
      wa.hidden = false;
      wa.addEventListener('click', () => { abrirWhatsapp(e); marcarEnviado(e, fila); });
    }
    enviar.addEventListener('click', async () => {
      if (puedeCompartir) {
        try {
          await navigator.share({ title: 'Tu amigo secreto', text: textoMensaje(e) });
          marcarEnviado(e, fila);
        } catch (err) {
          if (err?.name !== 'AbortError') { abrirWhatsapp(e); marcarEnviado(e, fila); }
        }
      } else {
        abrirWhatsapp(e);
        marcarEnviado(e, fila);
      }
    });
    fila.querySelector('[data-copiar]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(e.url);
        aviso(`Enlace de ${e.nombre} copiado`);
        marcarEnviado(e, fila);
      } catch {
        window.prompt('Copia el enlace:', e.url);
        marcarEnviado(e, fila);
      }
    });
    return fila;
  }

  function pintarResultado(desplazar) {
    const res = $('results-section');
    res.hidden = false;
    $('as-previa').hidden = true; // en escritorio, el resultado ocupa el sitio del sobre de muestra
    const n = sorteo.enlaces.length;
    const d = sorteo.detalles ?? {};
    const partes = [`${n} personas`];
    if (d.presupuesto) partes.push(`presupuesto máximo ${formatoPresupuesto(d.presupuesto)}`);
    if (d.grupo) partes.unshift(d.grupo);
    $('as-res-sub').textContent = partes.join(' · ');
    $('links-list-container').replaceChildren(...sorteo.enlaces.map(filaEnlace));
    contarEnviados();
    $('matrix-tbody').replaceChildren(...sorteo.matriz.map((f) => {
      const tr = clonar('tpl-matriz');
      tr.querySelector('[data-da]').textContent = f.da;
      tr.querySelector('[data-recibe]').textContent = f.recibe;
      return tr;
    }));
    $('as-metodo').textContent = sorteo.metodo === 'busqueda'
      ? 'Cada número es una persona. La cadena se cierra: todos dan y reciben un regalo. Con exclusiones tan apretadas en un grupo tan grande, el sorteo no es perfectamente uniforme.'
      : 'Cada número es una persona. La cadena se cierra: todos dan y reciben un regalo, y cualquier cadena válida tenía la misma probabilidad de salir.';
    elegirPestaña('enlaces');
    if (desplazar) {
      // Solo si el resultado no se ve (en escritorio ya está al lado).
      requestAnimationFrame(() => {
        const r = res.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * 0.6) res.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'start' });
      });
      if (!movimientoReducido()) res.animate?.([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  // Sortear de nuevo aquí mismo, sin volver arriba (el botón principal
  // pide confirmación si ya se enviaron enlaces).
  $('as-nuevo').addEventListener('click', () => {
    if (btn.disabled) { lista.scrollIntoView({ block: 'center' }); lista.focus(); return; }
    btn.click();
  });

  /* ---- pestañas de reparto ---- */

  const pestañas = { enlaces: $('as-tab-enlaces'), telefono: $('as-tab-telefono') };
  function elegirPestaña(cual) {
    for (const [k, b] of Object.entries(pestañas)) {
      const activa = k === cual;
      b.setAttribute('aria-selected', String(activa));
      b.tabIndex = activa ? 0 : -1;
      $(`as-panel-${k}`).hidden = !activa;
    }
  }
  for (const [k, b] of Object.entries(pestañas)) {
    b.addEventListener('click', () => elegirPestaña(k));
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      const otra = k === 'enlaces' ? 'telefono' : 'enlaces';
      elegirPestaña(otra);
      pestañas[otra].focus();
    });
  }

  /* ---- pasa el teléfono ---- */

  const tel = $('as-telefono');
  const telSobre = $('as-tel-env');
  let telActual = -1;
  const vistos = new Set();

  function telVista(cual) {
    $('as-tel-lista-zona').hidden = cual !== 'lista';
    $('as-tel-confirmar').hidden = cual !== 'confirmar';
    $('as-tel-sobre').hidden = cual !== 'sobre';
  }

  function telLista() {
    const faltan = sorteo.enlaces.length - vistos.size;
    $('as-tel-faltan').textContent = faltan ? `Faltan ${faltan}.` : 'Ya abrieron todos.';
    $('as-tel-lista').replaceChildren(...sorteo.enlaces.map((e, i) => {
      const li = clonar('tpl-tel-nombre');
      const b = li.querySelector('button');
      b.textContent = e.nombre;
      b.disabled = vistos.has(i);
      b.addEventListener('click', () => {
        telActual = i;
        $('as-tel-quien').textContent = e.nombre;
        telVista('confirmar');
      });
      return li;
    }));
    telVista('lista');
  }

  $('as-empezar-telefono').addEventListener('click', () => {
    if (!sorteo) return;
    if (typeof tel.showModal === 'function') tel.showModal(); else tel.setAttribute('open', '');
    telLista();
  });
  // Esc no cierra por accidente: solo «Terminar».
  tel.addEventListener('cancel', (ev) => ev.preventDefault());
  $('as-tel-salir').addEventListener('click', async () => {
    if (vistos.size < sorteo.enlaces.length && !(await confirmar('Aún faltan personas por abrir su sobre. ¿Terminar de todos modos?', 'Terminar'))) return;
    cerrarSobre(telSobre);
    tel.close?.();
    tel.removeAttribute('open');
  });
  $('as-tel-no').addEventListener('click', telLista);
  $('as-tel-si').addEventListener('click', async () => {
    const e = sorteo.enlaces[telActual];
    const leido = await leerEnlace(e.url);
    if (!leido?.datos) { aviso('No se pudo leer este sobre'); telLista(); return; }
    cerrarSobre(telSobre);
    $('as-tel-nombre').textContent = leido.datos.nombre;
    const pista = $('as-tel-pista');
    pista.hidden = !leido.datos.pista;
    pista.textContent = leido.datos.pista ? `Pista: ${leido.datos.pista}` : '';
    $('as-tel-listo').hidden = true;
    telVista('sobre');
    telSobre.focus();
  });
  telSobre.addEventListener('click', async () => {
    if (telSobre.dataset.state === 'abierto') return;
    await abrirSobre(telSobre);
    // El aria-label del botón tapa su contenido: hay que decir el nombre.
    telSobre.setAttribute('aria-label', `Te toca regalarle a ${$('as-tel-nombre').textContent}`);
    $('as-tel-listo').hidden = false;
  });
  $('as-tel-listo').addEventListener('click', () => {
    vistos.add(telActual);
    cerrarSobre(telSobre);
    $('as-tel-nombre').textContent = '';
    telLista();
  });

  /* ---- sorteo guardado ---- */

  const banner = $('saved-draw');
  const guardado = cargarGuardado(almacenSeguro);
  if (guardado) {
    const enviados = guardado.enlaces.filter((l) => l.enviado).length;
    const fecha = new Date(guardado.fecha).toLocaleString('es', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    banner.querySelector('[data-saved-info]').textContent =
      `Tienes un sorteo guardado del ${fecha}: ${guardado.enlaces.length} personas, ${enviados} enlace(s) enviados.`;
    banner.hidden = false;
    banner.querySelector('[data-saved-restore]').addEventListener('click', () => {
      sorteo = guardado;
      guardar(almacenSeguro, sorteo); // pasa al formato y la clave nuevos
      lista.value = guardado.texto ?? '';
      exclusiones.value = guardado.exclusiones ?? '';
      if (exclusiones.value.trim()) $('exclusions-details').open = true;
      for (const c of camposDetalle) $(`as-${c}`).value = guardado.detalles?.[c] ?? '';
      deseos.clear();
      for (const [k, v] of Object.entries(guardado.deseos ?? {})) deseos.set(k, v);
      actualizar();
      banner.hidden = true;
      pintarResultado(true);
    });
    banner.querySelector('[data-saved-clear]').addEventListener('click', async () => {
      if (!(await confirmar('¿Borrar el sorteo guardado? Los enlaces que ya enviaste siguen funcionando, pero no podrás volver a verlos aquí.', 'Borrar'))) return;
      borrarGuardado(almacenSeguro);
      banner.hidden = true;
    });
  }

  /* ---- plantilla para Excel ---- */

  $('as-plantilla').addEventListener('click', () => {
    // CSV con BOM para que Excel lea bien las tildes; abre en Excel y Sheets.
    const csv = '\uFEFFNombre;Celular;Deseo o pista\r\nAna;3001234567;Le gusta el café\r\nBruno;;Talla M\r\nCarla;;\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'amigo-secreto-plantilla.csv';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ---- Sortear fijo abajo en móvil ---- */
  // Aparece cuando el botón de verdad sale de la vista mientras se llenan
  // las opciones; desaparece al volver a verlo o al bajar al resultado.
  const fija = $('as-fija');
  const fijo = $('as-sortear-fijo');
  fijo.addEventListener('click', () => btn.click());
  if ('IntersectionObserver' in window) {
    let botonVisible = true, opcionesVisibles = false, resultadoVisible = false;
    const pintar = () => {
      fija.hidden = botonVisible || !opcionesVisibles || resultadoVisible;
      fijo.disabled = btn.disabled;
    };
    new IntersectionObserver(([e]) => { botonVisible = e.isIntersecting; pintar(); }).observe(btn);
    new IntersectionObserver(([e]) => { opcionesVisibles = e.isIntersecting; pintar(); }).observe($('as-opcional'));
    new IntersectionObserver(([e]) => { resultadoVisible = e.isIntersecting; pintar(); }).observe($('results-section'));
    new MutationObserver(pintar).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  }

  actualizar();
}

/* ==========================================================
   ARRANQUE
   ========================================================== */

async function iniciar() {
  const app = $('as-app');
  if (!app || app.dataset.ready) return;
  app.dataset.ready = 'true';
  const enlace = await leerEnlace(location.href);
  if (enlace) modoAbrir(enlace);
  else modoOrganizar();
}

// Si alguien pega un enlace en la misma pestaña solo cambia el fragmento y
// la página no se recarga: se recarga a mano para entrar en «abrir».
if (!window.__asHash) {
  window.__asHash = true;
  window.addEventListener('hashchange', () => {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('revelar') || h.get('v')) location.reload();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
document.addEventListener('astro:page-load', iniciar);
