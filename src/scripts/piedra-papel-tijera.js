// ==========================================================
// PIEDRA, PAPEL O TIJERA — LÓGICA DE JUEGO & AUDIO SINTETIZADO
// ==========================================================

function initPPT() {
  // SVGs de las manos
  const svgInterrogacion = `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="40" cy="40" r="24" opacity="0.2"></circle>
      <path d="M33 32 C33 26, 40 22, 45 26 C50 30, 48 35, 40 38 L40 44"></path>
      <circle cx="40" cy="52" r="2" fill="currentColor" stroke="none"></circle>
    </svg>`;

  const svgPiedra = `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M28 52 C28 52, 22 46, 22 38 C22 34, 25 31, 29 31 C31 31, 33 32, 34 34"></path>
      <path d="M34 34 C34 28, 34 24, 38 22 C42 20, 46 22, 46 26 L46 34"></path>
      <path d="M46 30 C46 26, 50 24, 53 26 C56 28, 56 31, 56 34"></path>
      <path d="M56 32 C56 28, 60 27, 62 30 C64 33, 63 36, 62 40"></path>
      <path d="M62 40 C62 40, 63 48, 58 54 C53 60, 44 62, 38 60 C32 58, 28 54, 28 52"></path>
      <path d="M34 34 L34 42" opacity="0.4"></path>
      <path d="M46 34 L46 42" opacity="0.4"></path>
      <path d="M56 34 L56 40" opacity="0.4"></path>
    </svg>`;

  const svgPapel = `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M26 56 C26 56, 22 48, 22 42 C22 38, 25 36, 28 36 L28 54"></path>
      <path d="M28 36 L30 18 C30 14, 34 13, 36 16 L36 36"></path>
      <path d="M36 36 L37 16 C37 12, 41 11, 43 14 L43 36"></path>
      <path d="M43 36 L44 18 C44 14, 48 13, 50 16 L50 38"></path>
      <path d="M50 38 L51 24 C51 20, 55 19, 57 22 L57 42"></path>
      <path d="M57 42 C57 42, 58 50, 53 56 C48 62, 40 63, 34 61 C28 59, 26 56, 26 56"></path>
    </svg>`;

  const svgTijera = `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M28 58 C28 58, 24 50, 24 44 C24 40, 27 38, 30 39 L32 42"></path>
      <path d="M32 42 L26 16 C25 12, 29 10, 31 14 L38 38"></path>
      <path d="M38 38 L38 14 C38 10, 42 9, 43 13 L44 38"></path>
      <path d="M44 38 C44 38, 46 36, 48 38 C50 40, 50 42, 50 44"></path>
      <path d="M50 44 C50 44, 52 42, 54 44 C56 46, 56 48, 55 50"></path>
      <path d="M55 50 C55 50, 55 56, 50 60 C45 64, 38 63, 33 61 C28 59, 28 58, 28 58"></path>
      <path d="M48 38 L48 44" opacity="0.3"></path>
    </svg>`;

  const svgMapa = {
    piedra: svgPiedra,
    papel: svgPapel,
    tijera: svgTijera
  };

  // Elementos DOM
  const selectorBotones = document.querySelectorAll('#mode-selector .selector-btn');
  const contenedorIA = document.getElementById('ai-container');
  const contenedorPvP = document.getElementById('pvp-container');

  if (!contenedorIA || !contenedorPvP) return;

  // 1P refs
  const botonesIA = document.querySelectorAll('#ai-choices .choice-btn');
  const arenaP1 = document.getElementById('arena-p1');
  const arenaAI = document.getElementById('arena-ai');
  const resultadoIA = document.getElementById('ai-result');
  const spanVictorias = document.getElementById('score-wins');
  const spanDerrotas = document.getElementById('score-losses');
  const spanEmpates = document.getElementById('score-ties');
  const btnResetMarcador = document.getElementById('btn-reset-score');

  // PvP refs
  const panelP1 = document.getElementById('panel-p1');
  const panelP2 = document.getElementById('panel-p2');
  const botonesP1 = document.querySelectorAll('#choices-p1 .choice-btn');
  const botonesP2 = document.querySelectorAll('#choices-p2 .choice-btn');
  const btnRevelar = document.getElementById('btn-reveal');
  const arenaPvPP1 = document.getElementById('arena-pvp-p1');
  const arenaPvPP2 = document.getElementById('arena-pvp-p2');
  const resultadoPvP = document.getElementById('pvp-result');
  const btnJugarDeNuevo = document.getElementById('btn-play-again');

  let modoJuego = '1p';
  let marcador = { victorias: 0, derrotas: 0, empates: 0 };
  let eleccionP1 = null;
  let eleccionP2 = null;
  let animando = false;

  // Web Audio Context & Synth
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playSelectSound() {
    try {
      initAudio();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      console.warn("Audio blocked or not supported");
    }
  }

  function playShakeSound() {
    try {
      initAudio();
      const now = audioCtx.currentTime;
      // Simulamos la sacudida con una ráfaga corta de ruido filtrado o oscilaciones bajas
      // Vamos a programar tres pequeños "whooshes" espaciados a lo largo del tiempo de sacudida (1.8s)
      const times = [0.1, 0.6, 1.1];
      times.forEach(t => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now + t);
        osc.frequency.exponentialRampToValueAtTime(40, now + t + 0.25);
        gain.gain.setValueAtTime(0.25, now + t);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.25);
      });
    } catch (e) {
      console.warn(e);
    }
  }

  function playResultSound(result) {
    try {
      initAudio();
      const now = audioCtx.currentTime;
      if (result === 'win') {
        // Melodía triunfal mayor (C5 -> E5 -> G5 -> C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          gain.gain.setValueAtTime(0.15, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.35);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.35);
        });
      } else if (result === 'lose') {
        // Caída de tono triste
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.6);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        // Dos beeps neutros
        const times = [0, 0.15];
        times.forEach(t => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now + t);
          gain.gain.setValueAtTime(0.15, now + t);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.1);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + t);
          osc.stop(now + t + 0.1);
        });
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // Cargar marcador
  function cargarMarcador() {
    const datos = localStorage.getItem('decidelo_ppt_score');
    if (datos) {
      try {
        marcador = JSON.parse(datos);
      } catch (e) {
        marcador = { victorias: 0, derrotas: 0, empates: 0 };
      }
    }
    actualizarMarcadorUI();
  }

  function guardarMarcador() {
    localStorage.setItem('decidelo_ppt_score', JSON.stringify(marcador));
  }

  function actualizarMarcadorUI() {
    if (spanVictorias) spanVictorias.textContent = marcador.victorias;
    if (spanDerrotas) spanDerrotas.textContent = marcador.derrotas;
    if (spanEmpates) spanEmpates.textContent = marcador.empates;
  }

  function determinarGanador(j1, j2) {
    if (j1 === j2) return 'empate';
    const vence = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' };
    return vence[j1] === j2 ? 'j1' : 'j2';
  }

  // Cambio de modo
  selectorBotones.forEach(btn => {
    btn.addEventListener('click', () => {
      if (animando) return;
      playSelectSound();

      selectorBotones.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      modoJuego = btn.getAttribute('data-mode');

      if (modoJuego === '1p') {
        contenedorIA.classList.add('active');
        contenedorPvP.classList.remove('active');
      } else {
        contenedorIA.classList.remove('active');
        contenedorPvP.classList.add('active');
        reiniciarPvP();
      }
    });
  });

  // Modo IA
  function eleccionAleatoria() {
    const opciones = ['piedra', 'papel', 'tijera'];
    return opciones[Math.floor(Math.random() * 3)];
  }

  botonesIA.forEach(btn => {
    btn.addEventListener('click', () => {
      if (animando) return;
      playSelectSound();
      const eleccion = btn.getAttribute('data-choice');
      jugarContraIA(eleccion, btn);
    });
  });

  function jugarContraIA(eleccionHumana, botonSeleccionado) {
    animando = true;
    eleccionP1 = eleccionHumana;
    eleccionP2 = eleccionAleatoria();

    botonesIA.forEach(b => {
      b.classList.remove('selected');
      b.classList.add('locked');
    });
    botonSeleccionado.classList.add('selected');
    botonSeleccionado.classList.remove('locked');

    if (resultadoIA) {
      resultadoIA.classList.remove('show');
      resultadoIA.innerHTML = '';
    }

    arenaP1.innerHTML = svgPiedra;
    arenaAI.innerHTML = svgPiedra;
    arenaP1.classList.remove('revealed', 'cyan-glow', 'purple-glow');
    arenaAI.classList.remove('revealed', 'cyan-glow', 'purple-glow');

    arenaP1.classList.add('shaking');
    arenaAI.classList.add('shaking');

    playShakeSound();

    setTimeout(() => {
      arenaP1.classList.remove('shaking');
      arenaAI.classList.remove('shaking');

      arenaP1.innerHTML = svgMapa[eleccionP1];
      arenaAI.innerHTML = svgMapa[eleccionP2];
      arenaP1.classList.add('revealed', 'cyan-glow');
      arenaAI.classList.add('revealed', 'purple-glow');

      const resultado = determinarGanador(eleccionP1, eleccionP2);

      if (resultado === 'empate') {
        marcador.empates++;
        if (resultadoIA) resultadoIA.innerHTML = '<span class="result-tie">¡EMPATE!</span>';
        playResultSound('tie');
      } else if (resultado === 'j1') {
        marcador.victorias++;
        if (resultadoIA) resultadoIA.innerHTML = '<span class="result-win">¡GANASTE! 🎉</span>';
        playResultSound('win');
      } else {
        marcador.derrotas++;
        if (resultadoIA) resultadoIA.innerHTML = '<span class="result-lose">¡PERDISTE! 😔</span>';
        playResultSound('lose');
      }

      if (resultadoIA) resultadoIA.classList.add('show');
      actualizarMarcadorUI();
      guardarMarcador();

      botonesIA.forEach(b => {
        b.classList.remove('selected', 'locked');
      });

      animando = false;
    }, 1800);
  }

  if (btnResetMarcador) {
    btnResetMarcador.addEventListener('click', () => {
      playSelectSound();
      marcador = { victorias: 0, derrotas: 0, empates: 0 };
      guardarMarcador();
      actualizarMarcadorUI();
      if (resultadoIA) resultadoIA.classList.remove('show');
      arenaP1.innerHTML = svgInterrogacion;
      arenaAI.innerHTML = svgInterrogacion;
      arenaP1.classList.remove('revealed', 'cyan-glow');
      arenaAI.classList.remove('revealed', 'purple-glow');
    });
  }

  // Modo PvP
  botonesP1.forEach(btn => {
    btn.addEventListener('click', () => {
      if (animando || panelP1.classList.contains('locked')) return;
      playSelectSound();
      eleccionP1 = btn.getAttribute('data-choice');
      panelP1.classList.add('locked');

      botonesP1.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      comprobarAmbasElecciones();
    });
  });

  botonesP2.forEach(btn => {
    btn.addEventListener('click', () => {
      if (animando || panelP2.classList.contains('locked')) return;
      playSelectSound();
      eleccionP2 = btn.getAttribute('data-choice');
      panelP2.classList.add('locked');

      botonesP2.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      comprobarAmbasElecciones();
    });
  });

  function comprobarAmbasElecciones() {
    if (eleccionP1 && eleccionP2) {
      btnRevelar.classList.add('visible');
    }
  }

  btnRevelar.addEventListener('click', () => {
    if (animando || !eleccionP1 || !eleccionP2) return;

    animando = true;
    btnRevelar.classList.remove('visible');

    if (resultadoPvP) {
      resultadoPvP.classList.remove('show');
      resultadoPvP.innerHTML = '';
    }

    arenaPvPP1.innerHTML = svgPiedra;
    arenaPvPP2.innerHTML = svgPiedra;
    arenaPvPP1.classList.remove('revealed', 'cyan-glow', 'purple-glow');
    arenaPvPP2.classList.remove('revealed', 'cyan-glow', 'purple-glow');

    arenaPvPP1.classList.add('shaking');
    arenaPvPP2.classList.add('shaking');

    playShakeSound();

    setTimeout(() => {
      arenaPvPP1.classList.remove('shaking');
      arenaPvPP2.classList.remove('shaking');

      arenaPvPP1.innerHTML = svgMapa[eleccionP1];
      arenaPvPP2.innerHTML = svgMapa[eleccionP2];
      arenaPvPP1.classList.add('revealed', 'cyan-glow');
      arenaPvPP2.classList.add('revealed', 'purple-glow');

      const resultado = determinarGanador(eleccionP1, eleccionP2);

      if (resultado === 'empate') {
        if (resultadoPvP) resultadoPvP.innerHTML = '<span class="result-tie">¡EMPATE!</span>';
        playResultSound('tie');
      } else if (resultado === 'j1') {
        if (resultadoPvP) resultadoPvP.innerHTML = '<span class="result-win">¡Jugador 1 Gana! 🎉</span>';
        playResultSound('win');
      } else {
        if (resultadoPvP) resultadoPvP.innerHTML = '<span class="result-lose">¡Jugador 2 Gana! 🎉</span>';
        playResultSound('win'); // También es triunfo para uno de los dos
      }

      if (resultadoPvP) resultadoPvP.classList.add('show');
      if (btnJugarDeNuevo) btnJugarDeNuevo.classList.add('visible');
      animando = false;
    }, 1800);
  });

  if (btnJugarDeNuevo) {
    btnJugarDeNuevo.addEventListener('click', () => {
      playSelectSound();
      reiniciarPvP();
    });
  }

  function reiniciarPvP() {
    eleccionP1 = null;
    eleccionP2 = null;
    animando = false;

    panelP1.classList.remove('locked');
    panelP2.classList.remove('locked');

    botonesP1.forEach(b => b.classList.remove('selected'));
    botonesP2.forEach(b => b.classList.remove('selected'));

    btnRevelar.classList.remove('visible');
    if (btnJugarDeNuevo) btnJugarDeNuevo.classList.remove('visible');

    arenaPvPP1.innerHTML = svgInterrogacion;
    arenaPvPP2.innerHTML = svgInterrogacion;
    arenaPvPP1.classList.remove('revealed', 'cyan-glow', 'purple-glow');
    arenaPvPP2.classList.remove('revealed', 'cyan-glow', 'purple-glow');

    if (resultadoPvP) {
      resultadoPvP.classList.remove('show');
      resultadoPvP.innerHTML = '';
    }
  }

  // Carga inicial
  cargarMarcador();
}

// Inicializar en carga o transiciones
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPPT);
} else {
  initPPT();
}
document.addEventListener('astro:page-load', initPPT);
