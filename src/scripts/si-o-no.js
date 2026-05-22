// ==========================================================
// ORÁCULO SÍ O NO — LÓGICA Y EFECTOS MÍSTICOS
// ==========================================================

function initSiOno() {
  const questionInput = document.getElementById('oracle-question');
  const btnConsult = document.getElementById('btn-spin');
  const ballElement = document.getElementById('oracle-ball');
  const answerContainer = document.getElementById('oracle-answer-container');
  const answerText = document.getElementById('oracle-answer-text');
  const historyList = document.getElementById('history-list');
  const btnClear = document.getElementById('btn-clear');
  const toast = document.getElementById('toast-message');

  if (!btnConsult || !ballElement || !answerText) return;

  let isThinking = false;
  let history = JSON.parse(localStorage.getItem('decidelo_siono_history')) || [];
  let audioCtx = null;

  const responses = [
    // Afirmativas
    { text: "Sí", class: "cyan" },
    { text: "Definitivamente sí", class: "cyan" },
    { text: "Sin duda alguna", class: "cyan" },
    { text: "Todo apunta a que sí", class: "cyan" },
    { text: "Es muy probable", class: "cyan" },
    // Neutras
    { text: "Es incierto", class: "neutral" },
    { text: "Pregunta más tarde", class: "neutral" },
    { text: "No puedo predecirlo ahora", class: "neutral" },
    { text: "Mejor no te lo digo ahora", class: "neutral" },
    { text: "Concéntrate y pregunta", class: "neutral" },
    // Negativas
    { text: "No", class: "purple" },
    { text: "Definitivamente no", class: "purple" },
    { text: "Poco probable", class: "purple" },
    { text: "Las fuentes dicen que no", class: "purple" },
    { text: "No cuentes con ello", class: "purple" }
  ];

  // Web Audio Synth
  function playShakeSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      
      // Sonido de líquido moviéndose (oscilador sweep bajo filtrado)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now);
      // Frecuencia descendente rápida
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);

      filter.type = 'lowpass';
      filter.Q.setValueAtTime(8, now);
      filter.frequency.setValueAtTime(150, now);
      filter.frequency.exponentialRampToValueAtTime(50, now + 0.8);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.8);
    } catch (e) {
      // Audio blocked
    }
  }

  function playMagicChime() {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // Sonido místico resonante ascendente
      const freqs = [440, 554.37, 659.25, 880, 1108.73, 1318.51]; // La mayor místico
      freqs.forEach((freq, idx) => {
        const time = now + idx * 0.06;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'peaking';
        filter.frequency.setValueAtTime(freq * 1.5, time);

        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(time);
        osc.stop(time + 0.65);
      });
    } catch (e) {
      // Audio blocked
    }
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }

  function consultOracle() {
    if (isThinking) return;

    const question = questionInput.value.trim();
    
    // Si no escribe nada, le damos un aviso amistoso pero lo dejamos consultar
    if (question === '') {
      showToast("Concéntrate en tu pregunta mentalmente o escríbela arriba.");
    }

    isThinking = true;
    btnConsult.disabled = true;
    
    // Ocultar respuesta anterior
    if (answerContainer) answerContainer.classList.remove('revealed');
    answerText.textContent = "";

    // Animación de Shaking
    ballElement.classList.add('shaking');
    playShakeSound();

    // Retraso de revelación (1.5 segundos)
    setTimeout(() => {
      ballElement.classList.remove('shaking');
      
      const rollIdx = Math.floor(Math.random() * responses.length);
      const answer = responses[rollIdx];

      // Asignar texto y clases
      answerText.textContent = answer.text;
      answerText.className = `answer-inner ${answer.class}`;
      
      if (answerContainer) answerContainer.classList.add('revealed');
      playMagicChime();

      // Guardar en historial si el usuario escribió la pregunta
      if (question !== '') {
        saveToHistory(question, answer);
      }

      isThinking = false;
      btnConsult.disabled = false;
    }, 1500);
  }

  function saveToHistory(q, ans) {
    const entry = {
      question: q,
      answer: ans.text,
      class: ans.class,
      timestamp: new Date().toLocaleTimeString()
    };

    history.unshift(entry);
    if (history.length > 10) history.pop();

    localStorage.setItem('decidelo_siono_history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<span class="history-empty">Sin preguntas aún</span>';
      return;
    }

    history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item-row oracle-row';
      el.innerHTML = `
        <div class="oracle-q-block">
          <span class="history-time">${item.timestamp}</span>
          <p class="history-q-text">"${item.question}"</p>
        </div>
        <span class="history-value ${item.class}">${item.answer}</span>
      `;
      historyList.appendChild(el);
    });
  }

  // Clear history
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      history = [];
      localStorage.removeItem('decidelo_siono_history');
      renderHistory();
    });
  }

  // Event Listeners
  btnConsult.addEventListener('click', consultOracle);
  
  // Soporte para Enter key
  questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      consultOracle();
    }
  });

  // Iniciar
  renderHistory();
}

// Inicializar en carga o transiciones Astro
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiOno);
} else {
  initSiOno();
}
document.addEventListener('astro:page-load', initSiOno);
