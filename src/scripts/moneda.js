// ==========================================================
// LANZAR MONEDA — decide entre dos opciones
// ==========================================================
// La apariencia vive en Coin.astro y moneda.astro. Aquí solo se elige el
// resultado, se anima el volteo con la Web Animations API y se escribe el
// texto. Arco, giro y sombra comparten duración, así que caen a la vez.

const HISTORY_KEY = 'decidelo_moneda_history';
const OPTIONS_KEY = 'decidelo_moneda_opciones';
const HISTORY_MAX = 10;
const FLIP_MS = 1600;

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Modo privado o almacenamiento bloqueado: la herramienta sigue funcionando
  }
}

function randomUnit() {
  if (window.crypto && window.crypto.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }
  return Math.random();
}

function initMoneda() {
  const coin = document.getElementById('coin');
  const flight = document.getElementById('coin-flight');
  const floorShadow = document.getElementById('coin-floor-shadow');
  const btnFlip = document.getElementById('btn-flip');
  const result = document.getElementById('coin-result');
  const resultMain = document.getElementById('coin-result-main');
  const resultSide = document.getElementById('coin-result-side');
  const inputHeads = document.getElementById('option-heads');
  const inputTails = document.getElementById('option-tails');
  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');
  const btnClear = document.getElementById('btn-clear');

  if (!coin || !flight || !btnFlip || !result || coin.dataset.ready) return;
  coin.dataset.ready = 'true';

  // Restos de la versión anterior con monedas temáticas
  writeStore('decidelo_moneda_style', null);

  // Historial: entradas { side: 'Cara'|'Cruz', label }. Las antiguas eran
  // strings sueltos ('Cara'/'Cruz') y se convierten al leerlas.
  let history = readStore(HISTORY_KEY, [])
    .map((h) => (typeof h === 'string' ? { side: h, label: h } : h))
    .filter((h) => h && (h.side === 'Cara' || h.side === 'Cruz'));

  const saved = readStore(OPTIONS_KEY, {});
  if (inputHeads && saved.heads) inputHeads.value = saved.heads;
  if (inputTails && saved.tails) inputTails.value = saved.tails;

  function saveOptions() {
    writeStore(OPTIONS_KEY, {
      heads: inputHeads ? inputHeads.value.trim() : '',
      tails: inputTails ? inputTails.value.trim() : '',
    });
  }
  inputHeads?.addEventListener('input', saveOptions);
  inputTails?.addEventListener('input', saveOptions);

  function labelFor(side) {
    const input = side === 'Cara' ? inputHeads : inputTails;
    const value = input ? input.value.trim() : '';
    return value || side;
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();

    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Sin lanzamientos aún';
      historyList.appendChild(empty);
    } else {
      history.slice().reverse().forEach((h, i) => {
        const row = document.createElement('li');
        row.className = 'history-row';
        const n = document.createElement('span');
        n.className = 'history-num';
        n.textContent = String(history.length - i).padStart(2, '0');
        const label = document.createElement('span');
        label.className = 'history-label';
        label.textContent = h.label;
        const side = document.createElement('span');
        side.className = 'history-side';
        side.textContent = h.side;
        row.append(n, label, side);
        historyList.appendChild(row);
      });
    }

    if (historyCount) {
      const heads = history.filter((h) => h.side === 'Cara').length;
      historyCount.textContent = history.length
        ? `Cara ${heads} · Cruz ${history.length - heads}`
        : '';
    }
  }

  // Ángulo acumulado en X: 0 mod 360 = cara arriba, 180 mod 360 = cruz
  let angle = 0;
  let busy = false;

  function showResult(side) {
    const label = labelFor(side);
    resultMain.textContent = label;
    resultSide.textContent = label === side ? '' : side;
    result.classList.add('is-shown');

    history.push({ side, label });
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    writeStore(HISTORY_KEY, history);
    renderHistory();
  }

  async function flip() {
    if (busy) return;
    busy = true;
    btnFlip.setAttribute('aria-busy', 'true');
    btnFlip.disabled = true;
    result.classList.remove('is-shown');

    const side = randomUnit() < 0.5 ? 'Cara' : 'Cruz';
    const from = angle;
    const turns = 4 + Math.floor(randomUnit() * 2); // 4 o 5 vueltas
    const base = from - (from % 360) + turns * 360;
    angle = base + (side === 'Cruz' ? 180 : 0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      if (reduced) {
        await coin.animate(
          [
            { transform: `rotateX(${from}deg)`, opacity: 1 },
            { transform: `rotateX(${from}deg)`, opacity: 0, offset: 0.5 },
            { transform: `rotateX(${angle}deg)`, opacity: 0, offset: 0.5 },
            { transform: `rotateX(${angle}deg)`, opacity: 1 },
          ],
          { duration: 200, fill: 'forwards' }
        ).finished;
      } else {
        const opts = { duration: FLIP_MS, fill: 'forwards' };
        // Altura del arco proporcional a la moneda, para no tapar las opciones en móvil
        const peak = Math.round(flight.offsetHeight * 0.6);
        // Giro: rápido al salir, frena al caer
        const spin = coin.animate(
          [{ transform: `rotateX(${from}deg)` }, { transform: `rotateX(${angle}deg)` }],
          { ...opts, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)' }
        );
        // Arco: sube frenando, baja acelerando y un rebote mínimo al tocar
        flight.animate(
          [
            { transform: 'translateY(0)', easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
            { transform: `translateY(-${peak}px)`, offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
            { transform: 'translateY(0)', offset: 0.88, easing: 'ease-out' },
            { transform: 'translateY(-8px)', offset: 0.94, easing: 'ease-in' },
            { transform: 'translateY(0)' },
          ],
          opts
        );
        floorShadow?.animate(
          [
            { transform: 'scale(1)', opacity: 1, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
            { transform: 'scale(0.45)', opacity: 0.35, offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
            { transform: 'scale(1)', opacity: 1, offset: 0.88 },
            { transform: 'scale(0.92)', opacity: 0.9, offset: 0.94 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          opts
        );
        await spin.finished;
      }
    } catch (e) {
      // Animación cancelada (navegación): el resultado sigue siendo válido
      coin.style.transform = `rotateX(${angle}deg)`;
    }

    if (navigator.vibrate) navigator.vibrate(12);
    showResult(side);

    busy = false;
    btnFlip.disabled = false;
    btnFlip.removeAttribute('aria-busy');
  }

  btnFlip.addEventListener('click', flip);
  coin.addEventListener('click', flip);

  btnClear?.addEventListener('click', () => {
    history = [];
    writeStore(HISTORY_KEY, null);
    renderHistory();
  });

  renderHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMoneda);
} else {
  initMoneda();
}
document.addEventListener('astro:page-load', initMoneda);
