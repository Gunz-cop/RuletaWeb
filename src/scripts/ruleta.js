// ==========================================================
// RULETA — controlador de /ruleta
// ==========================================================
// El marcado vive en src/pages/ruleta.astro y src/components/Wheel.astro; la
// apariencia, en su CSS. Este archivo decide y escribe: lee y guarda el
// estado, clona plantillas, pide el plan del giro a la lógica pura
// (ruleta-logica.js, probada con Node), lo anima con la Web Animations API y
// escribe el resultado cuando `.finished` se resuelve (AGENTS.md, regla 6).
//
// Es el prototipo aprobado por el propietario (docs/prototipos/ruleta-rueda.html,
// rama claude/ruleta-7-prototipo, commit 4b4e43f) con la arquitectura del
// sitio: persistencia con las claves de SDD §6.9 y migración de las viejas,
// inicialización con `dataset.ready` y limpieza en `astro:before-swap`.
//
// Las clases que pone son de estado propias (is-shown, is-ganador,
// is-volteada, has-ganador...), nunca de Tailwind: las que se añaden solo
// desde src/scripts/ no se generan (AGENTS.md, regla 2).

import {
  leerOpciones, indiceAlAzar, geometria, tonoDe, margenReposo, amplitudReposo,
  elegirFinal, planGiro, poseFinal, reasignarOcultas, migrarGuardado,
  enlace, leerEnlace, ENLACE_MAX_CARACTERES,
  CLAVES, TONOS, HISTORIAL_MAX,
} from './ruleta-logica.js';

const mod = (a, m) => ((a % m) + m) % m;
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ENTRADA_MS = 1300, REPOSO_MS = 3000, ANTICIPACION_MS = 200;
const ANTICIPACION_GRADOS = 8;
const PUNTERO_LEVANTADO = -18;   // grados del puntero levantado (el mismo que usa planGiro)
const DESHACER_MS = 7000;
const MAX_ACTIVAS = 100;         // RF-01
const SIN_ETIQUETAS = 40;        // SDD §6.2: con más de 40 no se pintan etiquetas

const EJEMPLOS = {
  comida: ['Pizza', 'Tacos', 'Sushi', 'Hamburguesa', 'Ensalada', 'Pasta'],
  verdad: ['Verdad suave', 'Reto suave', 'Verdad picante', 'Reto loco'],
  nombres: ['Ana', 'Luis', 'Marta', 'Pablo', 'Sofía', 'Diego', 'Lucía', 'Andrés'],
};

/* --- localStorage: siempre en try/catch (el modo privado de Safari lanza) --- */
function leerAlmacen(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function escribirAlmacen(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: la página sigue funcionando */ }
}

// Curva de muelle con un solo rebote suave, para `linear()` (D6, SDD §6.5).
function muelle(zeta = 0.7, omega = 8, pasos = 48) {
  const wd = omega * Math.sqrt(1 - zeta * zeta), pts = [];
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    pts.push(i === pasos ? 1 : 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t)));
  }
  return `linear(${pts.map((p) => p.toFixed(4)).join(', ')})`;
}
const soportaLinear = () => { try { return CSS.supports('animation-timing-function', 'linear(0, 1)'); } catch { return false; } };

// Tic opcional (D1): Web Audio, desactivado por defecto. Compartido entre
// inicializaciones: un AudioContext por pestaña basta.
let ctxAudio = null;
function audio() {
  try { ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { /* sin audio */ }
  return ctxAudio;
}

function initRuleta() {
  const $ = (id) => document.getElementById(id);
  const rueda = $('wheel-box'), btnGirar = $('ruleta-girar');
  if (!rueda || !btnGirar || btnGirar.dataset.ready) return;
  btnGirar.dataset.ready = 'true';

  // Todo lo que se engancha a document/window cuelga de esta señal, para soltarlo en astro:before-swap.
  const ac = new AbortController();
  const { signal } = ac;

  const rotor = $('wheel-rotor'), cubo = $('wheel-hub'), puntero = $('wheel-pointer');
  const gajosEl = $('wheel-slices'), etiquetasEl = $('wheel-labels');
  const resultadoEl = $('ruleta-result'), resMain = $('ruleta-result-main'), resSide = $('ruleta-result-side');
  const listaEl = $('ruleta-lista'), txtOpciones = $('ruleta-opciones'), inpPregunta = $('ruleta-pregunta'), inpNueva = $('ruleta-nueva');
  const histEl = $('ruleta-historial'), histVacio = histEl.firstElementChild;
  const tplGajo = $('wheel-slice-tpl'), tplEtq = $('wheel-label-tpl'), tplFila = $('ruleta-fila-tpl'), tplHist = $('ruleta-hist-tpl');
  const stageEl = $('ruleta-stage');
  const btnSonido = $('wheel-sound'), btnPantalla = $('wheel-fullscreen'), btnFoco = $('ruleta-foco');
  const avisoEl = $('ruleta-aviso'), avisoDeshacer = $('ruleta-aviso-deshacer');
  const btnQuitar = $('ruleta-quitar'), accionesEl = $('ruleta-acciones-resultado');
  const btnReiniciar = $('ruleta-reiniciar');
  const modos = [...document.querySelectorAll('.ruleta-mode')];

  const guardado = migrarGuardado(leerAlmacen);
  const estado = {
    items: [],            // [{ t, oculta }]: la lista del editor (todas las opciones)
    opcionesRueda: [], refsRueda: [], n: 0,   // lo que enseña la rueda ahora
    theta: 0, girando: false, ganador: -1, campeon: null, resultadoVisible: false,
    modo: guardado.modo, cuentas: guardado.conteo.cuentas, historial: guardado.historial,
    sonido: guardado.sonido, hFinales: [], foco: null, enFoco: false,
  };

  const activas = () => estado.items.filter((i) => !i.oculta && i.t.trim() !== '');
  const textosActivos = () => activas().map((i) => i.t.trim());
  const hayCambios = () => JSON.stringify(textosActivos()) !== JSON.stringify(estado.opcionesRueda);

  /* --- Guardar (SDD §6.9). Solo las líneas con texto: son las que `migrarGuardado`
     vuelve a leer, y los índices de las ocultas se cuentan sobre ellas. --- */
  function guardarLista() {
    const llenas = estado.items.filter((i) => i.t.trim() !== '');
    escribirAlmacen(CLAVES.opciones, llenas.map((i) => i.t.trim()).join('\n'));
    escribirAlmacen(CLAVES.ocultas, JSON.stringify({ v: 2, indices: llenas.flatMap((i, k) => (i.oculta ? [k] : [])) }));
    escribirAlmacen(CLAVES.conteo, JSON.stringify({ v: 1, cuentas: estado.cuentas }));
  }
  const guardarHistorial = () => escribirAlmacen(CLAVES.historial, JSON.stringify(estado.historial));

  /* --- Pintado de la rueda: clona plantillas, pone d, texto y --a. Nada de innerHTML. --- */
  const densidad = (n) => (n > 25 ? 4 : n > 18 ? 3 : n > 10 ? 2 : 1);

  function pintar() {
    estado.refsRueda = activas();
    estado.opcionesRueda = textosActivos();
    const n = estado.n = estado.opcionesRueda.length;
    gajosEl.replaceChildren();
    etiquetasEl.replaceChildren();
    estado.ganador = -1;
    rueda.classList.remove('has-ganador');
    rueda.toggleAttribute('data-vacia', n === 0);
    actualizarBoton();
    $('ruleta-aviso-n').hidden = n <= SIN_ETIQUETAS;
    $('wheel-desc').textContent = n === 0 ? 'Ruleta sin opciones'
      : n > 12 ? `Ruleta con ${n} opciones`
      : `Ruleta con ${n} opciones: ${estado.opcionesRueda.join(', ')}`;
    if (n === 0) return;
    const geo = geometria(n);
    rotor.dataset.densidad = densidad(n);
    geo.forEach((g, i) => {
      const path = tplGajo.content.firstElementChild.firstElementChild.cloneNode(true);
      path.setAttribute('d', g.d);
      path.dataset.i = i;
      path.classList.add(`wheel-tono-${tonoDe(i, n, TONOS)}`);
      gajosEl.append(path);
      if (n > SIN_ETIQUETAS) return;
      const etq = tplEtq.content.firstElementChild.cloneNode(true);
      etq.dataset.i = i;
      etq.textContent = estado.opcionesRueda[i];
      etq.style.setProperty('--a', `${g.med}deg`);
      etiquetasEl.append(etq);
    });
    voltear(false);
  }

  // Etiquetas que en reposo quedarían boca abajo (mitad izquierda): se voltean.
  // `conFundido` hace el cambio con un fundido de 150 ms, solo en las que cambian.
  function voltear(conFundido) {
    const cambian = [];
    [...etiquetasEl.children].forEach((el) => {
      const w = (Number(el.dataset.i) + 0.5) * (360 / estado.n) + estado.theta;
      const volteada = Math.sin((w * Math.PI) / 180) < -1e-9;
      if (el.classList.contains('is-volteada') !== volteada) cambian.push([el, volteada]);
    });
    if (!conFundido || reducido()) { cambian.forEach(([el, v]) => el.classList.toggle('is-volteada', v)); return; }
    const fuera = cambian.map(([el]) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 75, fill: 'forwards' }));
    Promise.all(fuera.map((a) => a.finished)).then(() => {
      cambian.forEach(([el, v]) => el.classList.toggle('is-volteada', v));
      cambian.forEach(([el]) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 75 }));
      fuera.forEach((a) => a.cancel());
    }).catch(() => {});
  }

  function quitarMarca() {
    rueda.classList.remove('has-ganador');
    rueda.querySelectorAll('.is-ganador').forEach((el) => el.classList.remove('is-ganador'));
    estado.ganador = -1;
  }
  function marcarGanador(i) {
    const path = gajosEl.querySelector(`[data-i="${i}"]`);
    if (!path) return;
    gajosEl.append(path); // el último del SVG se pinta encima: su contorno no lo tapan los vecinos
    path.classList.add('is-ganador');
    etiquetasEl.querySelector(`[data-i="${i}"]`)?.classList.add('is-ganador');
    rueda.classList.add('has-ganador');
  }

  function escribirPose(grados) {
    estado.theta = mod(grados, 360);
    rotor.style.transform = `rotate(${estado.theta}deg)`;
  }

  /* --- Ciclo de movimiento (SDD §6.5): todo con element.animate() --- */
  let reposoAnim = null, entradaViva = false;
  const animados = () => [rotor, cubo, puntero, etiquetasEl];
  const cancelarTodo = () => { animados().forEach((el) => el.getAnimations().forEach((a) => a.cancel())); reposoAnim = null; };
  function pararReposo() { reposoAnim?.cancel(); reposoAnim = null; }
  const esperar = (a) => a.finished.catch(() => {});

  function reposo() {
    pararReposo();
    if (reducido() || estado.girando || entradaViva || document.hidden || estado.n === 0) return;
    // La amplitud sale de la pose, no de N: tras un final con suspenso el puntero
    // puede quedar cerca de una frontera (SDD §6.3).
    const amp = amplitudReposo(margenReposo(estado.theta, estado.n), rueda.getBoundingClientRect().width / 2);
    const t = estado.theta, e = 'ease-in-out';
    reposoAnim = rotor.animate([
      { transform: `rotate(${t}deg)`, easing: e },
      { transform: `rotate(${t + amp}deg)`, offset: 0.25, easing: e },
      { transform: `rotate(${t}deg)`, offset: 0.5, easing: e },
      { transform: `rotate(${t - amp}deg)`, offset: 0.75, easing: e },
      { transform: `rotate(${t}deg)`, easing: e },
    ], { duration: REPOSO_MS, iterations: Infinity });
  }
  // Al cambiar el tamaño de la rueda (giro del móvil, pantalla completa) la
  // amplitud en píxeles cambia: se recalcula (SDD §6.15).
  let recalculo = 0;
  function reajustarReposo() {
    cancelAnimationFrame(recalculo);
    recalculo = requestAnimationFrame(() => { if (reposoAnim) reposo(); });
  }

  async function entrar() {
    if (reducido()) return;
    entradaViva = true;
    const easing = soportaLinear() ? muelle() : 'cubic-bezier(0.22, 1, 0.36, 1)'; // respaldo del SDD
    const t = estado.theta;
    const op = { duration: ENTRADA_MS, easing };
    const fundido = { duration: ENTRADA_MS, easing: 'ease-out' };
    // Rueda rodando desde la izquierda: se asienta con un solo rebote, sin frenazo.
    const a = rotor.animate([
      { transform: `translateX(-125cqw) rotate(${t - 143}deg)` },
      { transform: `translateX(0) rotate(${t}deg)` },
    ], op);
    cubo.animate([{ transform: 'translateX(-125cqw)' }, { transform: 'translateX(0)' }], op);
    // Fundido de opacidad en el primer 30 %
    const f = [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }];
    rotor.animate(f, fundido);
    cubo.animate(f, fundido);
    try { await a.finished; } catch { return; } // la interrumpió un giro, un arrastre o un cambio de lista
    entradaViva = false;
    if (!estado.girando) reposo();
  }

  /* --- Girar --- */
  const eligeFinal = (n) => {
    const f = elegirFinal(estado.hFinales, n);
    estado.hFinales.push(f);
    if (estado.hFinales.length > 5) estado.hFinales.shift();
    return f;
  };

  async function girar(opts = {}) {
    if (estado.girando) return;
    if (estado.campeon) { volverAEmpezar(); return; }
    if (hayCambios()) repintar();             // RF-05: lo pendiente se aplica antes de planificar
    if (estado.n === 0) return;
    estado.girando = true;
    // Foco al terminar (SDD §7): vuelve al control que lanzó el giro; arrastrando, al botón
    // principal; con el atajo desde un campo, se queda donde está. Se anota antes de deshabilitar.
    estado.foco = opts.origen === 'arrastre' ? btnGirar
      : opts.origen === 'atajo' ? (document.activeElement === document.body ? null : document.activeElement) // se queda donde estaba: un campo no se toca (restaurar solo actúa si el foco se perdió)
      : [btnGirar, rueda].find((el) => el === document.activeElement) || null;
    btnGirar.disabled = true;
    rueda.disabled = true;
    ocultarResultado();
    quitarMarca();
    if (estado.sonido) audio()?.resume?.();

    const n = estado.n;
    const opcionesGiro = estado.opcionesRueda.slice(); // lo que enseña la rueda: el resultado se escribe sobre ella
    const refs = estado.refsRueda.slice();
    const preguntaGiro = inpPregunta.value.trim();
    const ganador = indiceAlAzar(n);                   // se decide ANTES de animar
    const final = eligeFinal(n);                       // se sortea aparte, independiente del ganador
    rueda.dataset.final = reducido() ? 'normal' : final; // último final usado: lo lee el test de estado

    cancelarTodo();
    entradaViva = false;

    if (reducido()) {
      escribirPose(poseFinal({ ganador, n, final: 'normal' }).objetivo);
      voltear(false); // la rueda aparece ya con las etiquetas derechas
      await esperar(rotor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }));
      return terminar(ganador, opcionesGiro, n, preguntaGiro, refs);
    }

    // El plan se calcula antes de la anticipación, para que no cueste un fotograma al arrancar.
    const t0 = estado.theta;
    const plan = planGiro({ anguloActual: t0 - ANTICIPACION_GRADOS, ganador, n, vueltas: opts.vueltas, final });

    // Anticipación: el rotor retrocede 8° y el puntero se levanta.
    const ant = rotor.animate(
      [{ transform: `rotate(${t0}deg)` }, { transform: `rotate(${t0 - ANTICIPACION_GRADOS}deg)` }],
      { duration: ANTICIPACION_MS, easing: 'ease-out', fill: 'forwards' });
    const antP = puntero.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${PUNTERO_LEVANTADO}deg)` }],
      { duration: ANTICIPACION_MS, easing: 'ease-out', fill: 'forwards' });
    await esperar(ant);

    // Acción: las animaciones nuevas tapan a la anticipación.
    const accion = rotor.animate(plan.rotor, { duration: plan.duracion, easing: 'linear', fill: 'forwards' });
    const accionP = puntero.animate(plan.puntero, { duration: plan.duracion, easing: 'linear', fill: 'forwards' });
    const accionE = etiquetasEl.animate(plan.etiquetas, { duration: plan.duracion, easing: 'linear', fill: 'forwards' });
    ant.cancel(); antP.cancel();
    programarTics(plan.golpes);
    await Promise.all([esperar(accion), esperar(accionP), esperar(accionE)]);

    // Aterrizaje: depende del final (asiento corto o vuelta atrás empujada por el puntero).
    const at = plan.aterriza;
    const aterriza = rotor.animate(at.rotor, { duration: at.dur, easing: at.easing, fill: 'forwards' });
    const aterrizaP = at.puntero ? puntero.animate(at.puntero, { duration: at.dur, easing: 'linear', fill: 'forwards' }) : null;
    etiquetasEl.getAnimations().forEach((a) => a.cancel());
    await Promise.all([esperar(aterriza), aterrizaP ? esperar(aterrizaP) : null]);
    escribirPose(plan.anguloFinal);                     // pose final a mano…
    animados().forEach((el) => el.getAnimations().forEach((a) => a.cancel())); // …y luego se cancela (nada de commitStyles: fantasma en Safari)
    terminar(ganador, opcionesGiro, n, preguntaGiro, refs);
  }

  function terminar(ganador, opcionesGiro, nGiro, pregunta, refs) {
    estado.ganador = ganador;
    marcarGanador(ganador);
    let principal = opcionesGiro[ganador];
    let lado = pregunta || (nGiro === 1 ? 'Única opción' : `1 de ${nGiro} opciones`);
    const salio = principal;
    const h = { opcion: salio, para: pregunta, t: Date.now() };
    estado.historial.unshift(h);
    estado.historial.length = Math.min(estado.historial.length, HISTORIAL_MAX);
    if (estado.modo === 'contar') {
      estado.cuentas[salio] = (estado.cuentas[salio] || 0) + 1;
      h.cuenta = estado.cuentas[salio]; // el historial también lleva la cuenta (SDD §6.14.3)
      actualizarFilas();
    } else if (estado.modo === 'eliminar' && nGiro >= 2) {
      // El ganador se oculta solo, como cambio pendiente (RF-05): el resultado sigue a la vista.
      const foto = fotoLista();
      // «Deshacer» o un ejemplo durante el giro sustituyen los objetos de la lista: se busca por identidad y, si no, por texto
      const ref = estado.items.includes(refs[ganador]) ? refs[ganador] : estado.items.find((i) => !i.oculta && i.t.trim() === salio);
      if (ref) ref.oculta = true;
      actualizarFilas();
      const quedan = activas();
      if (!ref) {
        // la lista cambió durante el giro: no hay nada que eliminar
      } else if (quedan.length === 1) {
        estado.campeon = quedan[0];
        principal = `Ganó ${quedan[0].t.trim()}`;
        lado = `${salio} salió y se eliminó`;
      } else {
        lado = pregunta || `Se eliminó «${salio}» · quedan ${quedan.length}`;
      }
      if (ref) avisar(`«${salio}» eliminada`, () => { restaurar(foto); ocultarResultado(); quitarMarca(); });
    }
    guardarLista();
    guardarHistorial();
    renderHistorial();
    mostrarResultado(principal, lado, salio);
    voltear(true);
    navigator.vibrate?.(15); // RF-15: sin sonidos de premio ni celebraciones
    estado.girando = false;
    rueda.disabled = estado.n === 0;
    actualizarBoton();
    // Solo si el foco se perdió al deshabilitar el botón: no se le quita a quien
    // se puso a escribir mientras giraba (SDD §7).
    const perdido = !document.activeElement || document.activeElement === document.body;
    if (estado.foco && perdido && !estado.foco.disabled) estado.foco.focus({ preventScroll: true });
    reposo(); // vuelve tras cada resultado, con la amplitud calculada con la pose
  }

  /* --- Resultado y acciones --- */
  function mostrarResultado(principal, lado, salio) {
    resMain.textContent = principal;
    resSide.textContent = lado;
    resMain.classList.remove('is-largo');
    resMain.classList.toggle('is-largo', resMain.scrollWidth > resMain.clientWidth); // medir con el cuerpo normal
    resultadoEl.classList.add('is-shown');
    estado.resultadoVisible = true;
    const puede = estado.modo === 'normal' && activas().length >= 2;
    btnQuitar.hidden = !puede;
    if (puede) btnQuitar.textContent = `Quitar «${salio.length > 18 ? `${salio.slice(0, 17)}…` : salio}»`;
    accionesEl.hidden = btnQuitar.hidden;
    actualizarBoton();
  }
  function ocultarResultado() {
    resultadoEl.classList.remove('is-shown');
    resMain.textContent = '';
    resSide.textContent = '';
    estado.resultadoVisible = false;
    accionesEl.hidden = true;
    btnQuitar.hidden = true;
    actualizarBoton();
  }
  function actualizarBoton() {
    btnGirar.textContent = estado.campeon ? 'Volver a empezar' : estado.resultadoVisible ? 'Girar otra vez' : 'Girar ruleta';
    btnGirar.disabled = estado.girando || (estado.n === 0 && !estado.campeon);
    rueda.disabled = estado.girando || estado.n === 0;
  }

  // Repinta la rueda con la lista actual. Si la lista cambió, el resultado vigente
  // se oculta y con él la marca del ganador (RF-06); si no, se conservan.
  // Pose de reposo de una rueda nueva: el puntero a mitad del primer gajo, nunca
  // sobre una frontera (con margen 0 la amplitud del reposo sería 0 y la rueda
  // quedaría quieta).
  const poseInicial = (n) => -0.5 * (360 / n);
  function repintar() {
    const igual = !hayCambios();
    const g = estado.ganador;
    // Cambiar la lista durante la entrada la cancela y escribe la pose (SDD §6.15)
    if (entradaViva) { cancelarTodo(); entradaViva = false; }
    pararReposo();
    pintar();
    if (igual && g >= 0) { estado.ganador = g; marcarGanador(g); }
    else if (!igual) {
      ocultarResultado();
      if (estado.n > 0) { escribirPose(poseInicial(estado.n)); voltear(false); }
    }
    reposo();
  }
  // Cualquier edición del visitante: se guarda, y se aplica ya salvo durante el giro (RF-05).
  function editado() {
    estado.campeon = null;
    guardarLista();
    actualizarBoton();
    if (!estado.girando) repintar();
  }
  function volverAEmpezar() {
    estado.items.forEach((i) => { i.oculta = false; });
    limitarActivas();
    estado.campeon = null;
    ocultarResultado();
    renderLista();
    editado();
  }

  // RF-01: como mucho 100 opciones activas; las que sobran quedan ocultas (no se pierden).
  function limitarActivas() {
    let k = 0, sobran = false;
    estado.items.forEach((i) => {
      if (i.oculta || i.t.trim() === '') return;
      if (++k > MAX_ACTIVAS) { i.oculta = true; sobran = true; }
    });
    return sobran;
  }

  /* --- Editor en lista (SDD §6.14.5) --- */
  function fotoLista() { return { items: estado.items.map((i) => ({ ...i })), cuentas: { ...estado.cuentas } }; }
  function restaurar(foto) {
    estado.items = foto.items.map((i) => ({ ...i }));
    estado.cuentas = { ...foto.cuentas };
    renderLista();
    editado();
  }

  function etiquetaOpciones() {
    const a = activas().length;
    $('ruleta-etq-opciones').textContent = `Opciones · ${a}${estado.items.length > a ? ` de ${estado.items.length}` : ''}`;
  }
  function nombrarFila(fila) {
    const t = fila._item.t.trim(), i = estado.items.indexOf(fila._item) + 1;
    fila.querySelector('.ruleta-opt-text').setAttribute('aria-label', `Opción ${i}`);
    fila.querySelector('.ruleta-opt-vis').setAttribute('aria-label', t ? `Mostrar «${t}» en la rueda` : 'Mostrar en la rueda');
    fila.querySelector('.ruleta-opt-del').setAttribute('aria-label', t ? `Borrar «${t}»` : 'Borrar opción');
  }
  // Pone al día clases, contadores y nombres de las filas existentes, sin recrearlas (no pierden el foco).
  function actualizarFilas() {
    [...listaEl.children].forEach((fila) => {
      fila.classList.toggle('is-oculta', fila._item.oculta);
      fila.querySelector('.ruleta-opt-vis').setAttribute('aria-checked', String(!fila._item.oculta));
      nombrarFila(fila);
    });
    pintarPuntos();
    etiquetaOpciones();
    // Mientras haya 100 activas el aviso sigue a la vista (también tras recargar): las demás están ocultas
    const hayOcultas = estado.items.some((i) => i.oculta);
    $('ruleta-aviso-max').hidden = !(activas().length >= MAX_ACTIVAS && hayOcultas);
    $('ruleta-activar').hidden = !hayOcultas; // RF-08: sin ocultas no ocupa sitio
  }
  function pintarPuntos() {
    let k = 0;
    const n = activas().length;
    [...listaEl.children].forEach((fila) => {
      const it = fila._item, dot = fila.querySelector('.ruleta-opt-dot');
      dot.className = 'ruleta-opt-dot';
      if (!it.oculta && it.t.trim() !== '') dot.classList.add(`wheel-tono-${tonoDe(k++, n, TONOS)}`);
      const c = fila.querySelector('.ruleta-opt-count');
      c.hidden = estado.modo !== 'contar';
      c.textContent = `×${estado.cuentas[it.t.trim()] || 0}`;
    });
  }
  function renderLista() {
    listaEl.replaceChildren();
    estado.items.forEach((it) => {
      const fila = tplFila.content.firstElementChild.cloneNode(true);
      fila._item = it;
      fila.classList.toggle('is-oculta', it.oculta);
      fila.querySelector('.ruleta-opt-text').value = it.t;
      fila.querySelector('.ruleta-opt-vis').setAttribute('aria-checked', String(!it.oculta));
      listaEl.append(fila);
    });
    actualizarFilas();
    renderPegar();
  }
  function renderPegar() {
    if (document.activeElement !== txtOpciones) txtOpciones.value = estado.items.map((i) => i.t).join('\n');
  }

  listaEl.addEventListener('input', (ev) => {
    const fila = ev.target.closest('.ruleta-opt-row');
    if (!fila || !ev.target.matches('.ruleta-opt-text')) return;
    fila._item.t = ev.target.value;
    nombrarFila(fila);
    pintarPuntos();
    etiquetaOpciones();
    renderPegar();
    editado();
  }, { signal });
  listaEl.addEventListener('click', (ev) => {
    const fila = ev.target.closest('.ruleta-opt-row');
    if (!fila) return;
    const it = fila._item;
    if (ev.target.closest('.ruleta-opt-vis')) {
      if (it.oculta && activas().length >= MAX_ACTIVAS) return; // el aviso ya está a la vista
      it.oculta = !it.oculta;
      actualizarFilas(); renderPegar();
      editado();
    } else if (ev.target.closest('.ruleta-opt-del')) {
      const foto = fotoLista();
      estado.items.splice(estado.items.indexOf(it), 1);
      delete estado.cuentas[it.t.trim()]; // borrar una opción borra su cuenta
      renderLista();
      avisar(`«${it.t.trim() || 'Opción'}» borrada`, () => restaurar(foto));
      editado();
    }
  }, { signal });
  // Una fila vacía se queda (la rueda la ignora): borrar siempre pasa por su botón, que sí se deshace.
  listaEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey && ev.target.matches('.ruleta-opt-text')) { ev.preventDefault(); inpNueva.focus(); }
  }, { signal });

  // «Añadir opción»: Intro añade y deja el teclado abierto para la siguiente.
  $('ruleta-alta').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const t = inpNueva.value.trim();
    if (!t) return;
    if (activas().length >= MAX_ACTIVAS) return;
    estado.items.push({ t, oculta: false });
    inpNueva.value = '';
    renderLista();
    editado();
    inpNueva.focus();
    listaEl.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, { signal });

  // «Pegar lista»: el cuadro de texto edita la misma lista (se conserva lo oculto por posición o texto).
  $('ruleta-pegar-toggle').addEventListener('click', (ev) => {
    const abierto = $('ruleta-pegar-panel').hidden;
    $('ruleta-pegar-panel').hidden = !abierto;
    ev.currentTarget.setAttribute('aria-expanded', String(abierto));
    ev.currentTarget.textContent = abierto ? 'Cerrar' : 'Pegar lista';
    if (abierto) { renderPegar(); txtOpciones.focus(); }
  }, { signal });
  txtOpciones.addEventListener('input', () => {
    const antes = estado.items.map((i) => i.t.trim());
    const ocultas = estado.items.flatMap((i, k) => (i.oculta ? [k] : []));
    const lineas = leerOpciones(txtOpciones.value);
    const nuevas = reasignarOcultas(antes, lineas, ocultas);
    estado.items = lineas.map((t, i) => ({ t, oculta: nuevas.has(i) }));
    limitarActivas();
    renderLista();
    editado();
  }, { signal });

  /* --- Ejemplos y herramientas de la lista (todo se deshace) --- */
  function cargar(lista) {
    const foto = fotoLista();
    estado.items = lista.map((t) => ({ t, oculta: false }));
    estado.cuentas = {}; // un ejemplo reinicia las cuentas
    renderLista();
    editado();
    if (foto.items.length) avisar('Se cambió la lista', () => restaurar(foto));
  }
  document.querySelectorAll('[data-ejemplo]').forEach((b) => b.addEventListener('click', () => cargar(EJEMPLOS[b.dataset.ejemplo]), { signal }));
  $('ruleta-mezclar').addEventListener('click', () => {
    const foto = fotoLista(), a = estado.items;
    for (let i = a.length - 1; i > 0; i--) { const j = indiceAlAzar(i + 1); [a[i], a[j]] = [a[j], a[i]]; } // Fisher-Yates con crypto
    renderLista(); editado(); avisar('Lista mezclada', () => restaurar(foto));
  }, { signal });
  $('ruleta-ordenar').addEventListener('click', () => {
    const foto = fotoLista();
    estado.items.sort((a, b) => a.t.localeCompare(b.t, 'es', { sensitivity: 'base' }));
    renderLista(); editado(); avisar('Lista ordenada', () => restaurar(foto));
  }, { signal });
  $('ruleta-vaciar').addEventListener('click', () => {
    const foto = fotoLista();
    estado.items = [];
    estado.cuentas = {};
    renderLista(); editado(); avisar('Lista vaciada', () => restaurar(foto));
  }, { signal });
  btnReiniciar.addEventListener('click', () => {
    const foto = fotoLista();
    estado.cuentas = {};
    guardarLista();
    actualizarFilas();
    avisar('Cuentas reiniciadas', () => restaurar(foto));
  }, { signal });
  // RF-08: activa las ocultas hasta el máximo (RF-01); si alguna se queda fuera, el aviso de máximo sigue a la vista.
  $('ruleta-activar').addEventListener('click', () => {
    const foto = fotoLista(), teniaFoco = document.activeElement === $('ruleta-activar');
    let k = activas().length, n = 0;
    estado.items.forEach((i) => {
      if (i.oculta && (i.t.trim() === '' || k < MAX_ACTIVAS)) { i.oculta = false; n++; k += i.t.trim() !== ''; }
    });
    if (!n) return; // con 100 activas no hay nada que activar: sin cambio, sin «Deshacer»
    actualizarFilas(); renderPegar(); editado();
    if (teniaFoco && $('ruleta-activar').hidden) $('ruleta-pegar-toggle').focus(); // el botón desaparece con el foco encima: no se pierde (Safari no enfoca con el ratón)
    avisar('Opciones activadas', () => restaurar(foto));
  }, { signal });
  btnQuitar.addEventListener('click', () => {
    const it = estado.refsRueda[estado.ganador];
    if (!it) return;
    const foto = fotoLista();
    it.oculta = true;
    renderLista(); editado();
    avisar(`«${it.t.trim()}» quitada`, () => restaurar(foto));
  }, { signal });

  /* --- Compartir por enlace (SDD §6.10, RF-11, D5) ---
     Solo viajan las opciones activas y la pregunta; las ocultas, el modo y las
     cuentas se quedan. Va en el fragmento: no llega a ningún servidor. */
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch { /* sin permiso o sin contexto seguro: se prueba el método antiguo */ }
    const t = document.createElement('textarea');
    t.value = texto;
    t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.append(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* sin portapapeles */ }
    t.remove();
    return ok;
  }
  async function compartir() {
    const opciones = textosActivos();
    if (!opciones.length) { avisar('Añade opciones para compartir'); return; }
    const url = enlace(location.href, { para: inpPregunta.value.trim(), opciones });
    if (url.length > ENLACE_MAX_CARACTERES) { avisar('Demasiado largo para un enlace: quita algunas opciones'); return; }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Decídelo.app — ruleta', text: inpPregunta.value.trim() || 'Gira mi ruleta', url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // el visitante cerró el menú de compartir
      }
    }
    avisar(await copiar(url) ? 'Enlace copiado' : 'No se pudo copiar el enlace');
  }
  $('ruleta-compartir').addEventListener('click', compartir, { signal });

  // Abrir un enlace compartido sustituye la lista y la pregunta, y se puede deshacer.
  // Al arrancar (`inicial`) la rueda aún no se ha pintado: lo hace el arranque.
  function cargarEnlace(inicial = false) {
    const e = leerEnlace(location.hash);
    if (!e) return; // fragmento ausente o mal formado: la página se queda como estaba
    const foto = fotoLista(), preguntaAntes = inpPregunta.value;
    estado.items = e.opciones.map((t) => ({ t, oculta: false }));
    estado.cuentas = {};
    inpPregunta.value = e.para;
    escribirAlmacen(CLAVES.pregunta, e.para);
    history.replaceState(history.state, '', location.pathname + location.search);
    if (inicial) guardarLista();
    else { renderLista(); editado(); }
    avisar('Se cargó la ruleta compartida', () => {
      inpPregunta.value = preguntaAntes;
      escribirAlmacen(CLAVES.pregunta, preguntaAntes.trim());
      restaurar(foto);
    });
  }
  window.addEventListener('hashchange', () => cargarEnlace(), { signal });

  /* --- Aviso con «Deshacer» (7 s; se detiene con el ratón o el foco encima, WCAG 2.2.1) --- */
  let avisoTimer = null, avisoUndo = null;
  function avisar(texto, deshacer = null) {
    clearTimeout(avisoTimer);
    avisoUndo = deshacer;
    $('ruleta-aviso-texto').textContent = texto;
    avisoDeshacer.hidden = !deshacer; // los avisos que solo informan («Enlace copiado») no llevan botón
    avisoEl.hidden = false;
    avisoTimer = setTimeout(cerrarAviso, DESHACER_MS);
    // El lector de pantalla lo anuncia por el anunciador compartido; el aviso no es una región viva
    const anunciador = $('sr-announcer');
    if (anunciador) { anunciador.textContent = ''; setTimeout(() => { anunciador.textContent = deshacer ? `${texto}. Botón Deshacer disponible.` : texto; }, 50); }
  }
  function cerrarAviso() { avisoEl.hidden = true; avisoUndo = null; clearTimeout(avisoTimer); }
  const rearmarAviso = () => { if (!avisoEl.hidden) { clearTimeout(avisoTimer); avisoTimer = setTimeout(cerrarAviso, DESHACER_MS); } };
  avisoDeshacer.addEventListener('click', () => {
    const f = avisoUndo;
    const teniaFoco = document.activeElement === avisoDeshacer;
    cerrarAviso();
    f?.();
    if (teniaFoco) (btnGirar.disabled ? rueda : btnGirar).focus({ preventScroll: true }); // el foco no se pierde en <body>
  }, { signal });
  avisoEl.addEventListener('pointerenter', () => clearTimeout(avisoTimer), { signal });
  avisoEl.addEventListener('pointerleave', rearmarAviso, { signal });
  avisoEl.addEventListener('focusin', () => clearTimeout(avisoTimer), { signal });
  avisoEl.addEventListener('focusout', rearmarAviso, { signal });

  /* --- Historial --- */
  function renderHistorial() {
    const filas = estado.historial.map((h) => {
      const li = tplHist.content.firstElementChild.cloneNode(true);
      li.querySelector('.ruleta-hist-op').textContent = h.cuenta ? `${h.opcion} ×${h.cuenta}` : h.opcion;
      li.querySelector('.ruleta-hist-para').textContent = h.para || '';
      return li;
    });
    histEl.replaceChildren(...(filas.length ? filas : [histVacio]));
    const n = estado.historial.length;
    $('ruleta-hist-count').textContent = n ? `${n} ${n === 1 ? 'resultado' : 'resultados'}` : '';
    $('ruleta-borrar-hist').hidden = n === 0;
  }
  $('ruleta-borrar-hist').addEventListener('click', () => { estado.historial = []; guardarHistorial(); renderHistorial(); }, { signal });

  /* --- Modos --- */
  function aplicarModo() {
    modos.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.modo === estado.modo)));
    pintarPuntos();
    btnReiniciar.hidden = estado.modo !== 'contar'; // «Reiniciar cuentas» solo en Contar
    if (estado.modo !== 'normal') { btnQuitar.hidden = true; accionesEl.hidden = true; } // «Quitar» solo en Normal
  }
  modos.forEach((b) => b.addEventListener('click', () => {
    estado.modo = b.dataset.modo;
    escribirAlmacen(CLAVES.modo, estado.modo);
    if (estado.modo !== 'eliminar') { estado.campeon = null; actualizarBoton(); }
    aplicarModo();
  }, { signal }));

  /* --- Tic opcional (D1) --- */
  function programarTics(golpes) {
    if (!estado.sonido) return;
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + 0.02;
    golpes.forEach((ms) => {
      const t = t0 + ms / 1000, o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = 1500;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.04);
    });
  }
  btnSonido.setAttribute('aria-pressed', String(estado.sonido));
  btnSonido.addEventListener('click', () => {
    estado.sonido = !estado.sonido;
    btnSonido.setAttribute('aria-pressed', String(estado.sonido));
    escribirAlmacen(CLAVES.sonido, String(estado.sonido));
    if (estado.sonido) audio()?.resume?.(); // iOS solo lo desbloquea desde un toque
  }, { signal });

  /* --- Pantalla completa y modo foco (RF-12) ---
     El icono de la rueda usa la Fullscreen API; donde no existe (iPhone) activa
     el modo foco. «Modo foco» es el mismo interruptor en texto y se recuerda. */
  const sinFullscreen = () => !(document.fullscreenEnabled && stageEl.requestFullscreen);
  function actualizarPantalla() {
    const activa = estado.enFoco || !!document.fullscreenElement;
    btnPantalla.setAttribute('aria-pressed', String(activa));
    // Con el foco recordado la cabecera y «Modo foco» no se ven: este icono es la salida y tiene que decirlo
    const texto = estado.enFoco ? 'Salir del modo foco' : activa ? 'Salir de pantalla completa' : 'Pantalla completa';
    btnPantalla.setAttribute('aria-label', texto);
    btnPantalla.title = texto;
  }
  function ponerFoco(on, { guardar = true } = {}) {
    estado.enFoco = on;
    document.body.classList.toggle('is-foco', on);
    btnFoco.setAttribute('aria-pressed', String(on));
    if (guardar) escribirAlmacen(CLAVES.foco, String(on));
    actualizarPantalla();
    reajustarReposo();
  }
  btnFoco.addEventListener('click', () => ponerFoco(!estado.enFoco), { signal });
  btnPantalla.addEventListener('click', () => {
    if (estado.enFoco) ponerFoco(false);          // sin esta salida, el foco recordado no tendría vuelta atrás
    else if (sinFullscreen()) ponerFoco(true);
    else if (document.fullscreenElement) document.exitFullscreen();
    else stageEl.requestFullscreen().catch(() => {});
  }, { signal });
  document.addEventListener('fullscreenchange', () => { actualizarPantalla(); reajustarReposo(); }, { signal });
  window.addEventListener('resize', reajustarReposo, { signal });

  /* --- Girar de cuatro formas (SDD §6.14.1) --- */
  btnGirar.addEventListener('click', () => girar(), { signal });
  let suprimirClick = false;
  rueda.addEventListener('click', () => {            // tocar la rueda; Espacio e Intro con la rueda enfocada
    if (suprimirClick) { suprimirClick = false; return; }
    girar();
  }, { signal });
  document.addEventListener('keydown', (ev) => {    // Ctrl/Cmd+Intro desde cualquier sitio
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); girar({ origen: 'atajo' }); }
    else if (ev.key === 'Escape' && estado.enFoco) ponerFoco(false); // RF-12: Esc también sale del modo foco
  }, { signal });

  // Arrastrar la rueda con el dedo o el ratón: la fuerza solo elige las vueltas (5–7), nunca el ganador.
  let arrastre = null;
  const anguloPuntero = (ev) => {
    const r = rueda.getBoundingClientRect();
    return (Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
  };
  const envuelve = (d) => mod(d + 180, 360) - 180;
  rueda.addEventListener('pointerdown', (ev) => {
    if (estado.girando || estado.n === 0 || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    arrastre = { id: ev.pointerId, ultimo: anguloPuntero(ev), total: 0, base: estado.theta, mov: false, muestras: [{ t: performance.now(), total: 0 }] };
  }, { signal });
  rueda.addEventListener('pointermove', (ev) => {
    if (!arrastre || ev.pointerId !== arrastre.id) return;
    const a = anguloPuntero(ev);
    arrastre.total += envuelve(a - arrastre.ultimo);
    arrastre.ultimo = a;
    if (!arrastre.mov && Math.abs(arrastre.total) > 8) {  // pasa de toque a arrastre
      arrastre.mov = true;
      try { rueda.setPointerCapture(ev.pointerId); } catch { /* el puntero ya se soltó */ }
      // Empezar a arrastrar es una «siguiente acción» (RF-05): se aplica lo pendiente y se sigue desde la rueda nueva
      if (hayCambios()) { repintar(); arrastre.base = estado.theta; }
      cancelarTodo(); entradaViva = false;
    }
    if (arrastre.mov) {
      escribirPose(arrastre.base + arrastre.total);
      arrastre.muestras.push({ t: performance.now(), total: arrastre.total });
      if (arrastre.muestras.length > 8) arrastre.muestras.shift();
    }
  }, { signal });
  const soltar = (ev, cancelado) => {
    if (!arrastre || ev.pointerId !== arrastre.id) return;
    const d = arrastre;
    arrastre = null;
    if (!d.mov) return;                                   // un toque: lo gestiona «click»
    suprimirClick = true;
    setTimeout(() => { suprimirClick = false; }, 80);
    if (cancelado) { voltear(true); reposo(); return; }
    const m = d.muestras, a = m[0], b = m[m.length - 1];
    const w = Math.abs(b.total - a.total) / Math.max(0.016, (b.t - a.t) / 1000); // °/s
    girar({ vueltas: w < 450 ? 5 : w < 900 ? 6 : 7, origen: 'arrastre' });
  };
  rueda.addEventListener('pointerup', (ev) => soltar(ev, false), { signal });
  rueda.addEventListener('pointercancel', (ev) => soltar(ev, true), { signal });

  inpPregunta.addEventListener('input', () => {
    escribirAlmacen(CLAVES.pregunta, inpPregunta.value.trim());
  }, { signal });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pararReposo();
    else if (!estado.girando && !entradaViva) reposo();
  }, { signal });

  // Con View Transitions la página se sustituye sin recargar: se sueltan los
  // listeners de document/window, las animaciones y los temporizadores (RNF-10).
  document.addEventListener('astro:before-swap', () => {
    ac.abort();
    cancelarTodo();
    cancelAnimationFrame(recalculo);
    clearTimeout(avisoTimer);
    document.body.classList.remove('is-foco');
  }, { once: true });

  /* --- Arranque --- */
  estado.items = leerOpciones(guardado.opciones).map((t, i) => ({ t, oculta: guardado.ocultas.has(i) }));
  limitarActivas();
  inpPregunta.value = guardado.pregunta;
  cargarEnlace(true);
  renderLista();
  renderHistorial();
  aplicarModo();
  if (guardado.foco) ponerFoco(true, { guardar: false });
  escribirPose(poseInicial(activas().length || 1));
  pintar();
  entrar();
  // Calienta el cálculo del plan (el primer giro con 4× de CPU tardaba 300 ms en arrancar)
  (window.requestIdleCallback || ((f) => setTimeout(f, 500)))(() => {
    // con su propio azar: es solo calentamiento y no debe gastar el que fuerzan los tests
    planGiro({ anguloActual: 0, ganador: 0, n: 13, duracion: 6000, vueltas: 6, final: 'casi', rnd: () => Math.floor(Math.random() * 4294967296) });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRuleta);
} else {
  initRuleta();
}
document.addEventListener('astro:page-load', initRuleta);
