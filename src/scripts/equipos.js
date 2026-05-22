// ==========================================================
// GENERADOR DE EQUIPOS — LÓGICA Y ANIMACIONES
// ==========================================================

function initEquipos() {
  const textInput = document.getElementById('participants-textarea');
  const modeSelector = document.getElementById('team-mode');
  const countInput = document.getElementById('team-count');
  const btnGenerate = document.getElementById('btn-spin');
  const displayContainer = document.getElementById('teams-display-container');
  const shareSection = document.getElementById('share-section');
  const btnCopy = document.getElementById('btn-copy-teams');
  const btnWa = document.getElementById('btn-wa-teams');
  const toast = document.getElementById('toast-message');

  if (!textInput || !modeSelector || !countInput || !btnGenerate || !displayContainer) return;

  let isGenerating = false;
  let audioCtx = null;
  let lastGeneratedTeams = []; // Almacenar el último resultado para compartir

  const colors = [
    { name: 'Cyan', border: 'rgba(0, 229, 255, 0.4)', bg: 'rgba(0, 229, 255, 0.03)', glow: 'rgba(0, 229, 255, 0.2)' },
    { name: 'Purple', border: 'rgba(179, 102, 255, 0.4)', bg: 'rgba(179, 102, 255, 0.03)', glow: 'rgba(179, 102, 255, 0.15)' },
    { name: 'Yellow', border: 'rgba(255, 204, 0, 0.4)', bg: 'rgba(255, 204, 0, 0.03)', glow: 'rgba(255, 204, 0, 0.15)' },
    { name: 'Success', border: 'rgba(57, 255, 20, 0.4)', bg: 'rgba(57, 255, 20, 0.03)', glow: 'rgba(57, 255, 20, 0.15)' },
    { name: 'Pink', border: 'rgba(255, 51, 102, 0.4)', bg: 'rgba(255, 51, 102, 0.03)', glow: 'rgba(255, 51, 102, 0.15)' },
    { name: 'Blue', border: 'rgba(24, 144, 255, 0.4)', bg: 'rgba(24, 144, 255, 0.03)', glow: 'rgba(24, 144, 255, 0.15)' }
  ];

  // Web Audio Synth
  function playShuffleSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;

      // Efecto rítmico corto de barajado
      for (let i = 0; i < 4; i++) {
        const time = now + i * 0.06;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 + i * 80, time);

        gain.gain.setValueAtTime(0.015, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(time);
        osc.stop(time + 0.05);
      }
    } catch (e) {
      // Audio blocked
    }
  }

  function playFanfareSound() {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // Acorde triunfal ascendente
      const freqs = [392.00, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
      freqs.forEach((freq, idx) => {
        const time = now + idx * 0.05;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.04, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(time);
        osc.stop(time + 0.45);
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

  function getParticipants() {
    return textInput.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  function generateTeams() {
    if (isGenerating) return;

    const list = getParticipants();
    if (list.length < 2) {
      showToast("Por favor, ingresa al menos 2 participantes.");
      return;
    }

    const count = parseInt(countInput.value, 10);
    if (isNaN(count) || count < 1) {
      showToast("Ingresa un número válido mayor o igual a 1.");
      return;
    }

    isGenerating = true;
    btnGenerate.disabled = true;
    displayContainer.innerHTML = '';
    if (shareSection) shareSection.classList.remove('show');

    playShuffleSound();

    // Simular retraso de cálculo para animar
    setTimeout(() => {
      // 1. Shuffling (Fisher-Yates)
      const shuffled = [...list];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // 2. Determinar cantidad de equipos y distribución
      const mode = modeSelector.value; // 'teams' o 'size'
      let numTeams = 0;

      if (mode === 'teams') {
        numTeams = Math.min(count, shuffled.length);
      } else {
        // Modo: tamaño por equipo
        numTeams = Math.ceil(shuffled.length / count);
      }

      // Inicializar equipos
      const teams = Array.from({ length: numTeams }, (_, i) => ({
        id: i + 1,
        name: `Equipo ${i + 1}`,
        members: []
      }));

      // Distribución cíclica para equilibrar
      shuffled.forEach((person, idx) => {
        const teamIdx = idx % numTeams;
        teams[teamIdx].members.push(person);
      });

      lastGeneratedTeams = teams;

      // 3. Renderizar resultados con colores y animaciones staggered
      renderTeams(teams);
      playFanfareSound();

      if (shareSection) shareSection.classList.add('show');
      isGenerating = false;
      btnGenerate.disabled = false;
    }, 600);
  }

  function renderTeams(teams) {
    displayContainer.innerHTML = '';
    
    teams.forEach((team, idx) => {
      const color = colors[idx % colors.length];
      const card = document.createElement('div');
      card.className = 'team-card';
      
      // Aplicar delays y custom properties para colores
      card.style.animationDelay = `${idx * 0.08}s`;
      card.style.borderColor = color.border;
      card.style.background = color.bg;
      card.style.boxShadow = `0 4px 20px ${color.glow}`;

      const header = document.createElement('div');
      header.className = 'team-card-header';
      header.innerHTML = `
        <h4 style="color: ${color.border.replace('0.4', '1')}">${team.name}</h4>
        <span class="team-card-badge">${team.members.length}</span>
      `;

      const listEl = document.createElement('ul');
      listEl.className = 'team-card-list';
      
      team.members.forEach(member => {
        const li = document.createElement('li');
        li.textContent = member;
        listEl.appendChild(li);
      });

      card.appendChild(header);
      card.appendChild(listEl);
      displayContainer.appendChild(card);
    });
  }

  // Generar texto para compartir
  function getShareableText() {
    if (lastGeneratedTeams.length === 0) return '';
    
    let text = `🏆 *Distribución de Equipos en decídelo.app* 🏆\n\n`;
    lastGeneratedTeams.forEach(team => {
      text += `👥 *${team.name}* (${team.members.length}):\n`;
      team.members.forEach(m => {
        text += `  • ${m}\n`;
      });
      text += `\n`;
    });
    text += `Organiza tus sorteos en: ${window.location.origin}/equipos`;
    return text;
  }

  // Copiar equipos
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const text = getShareableText();
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast("¡Equipos copiados al portapapeles!");
      });
    });
  }

  // Compartir en WhatsApp
  if (btnWa) {
    btnWa.addEventListener('click', () => {
      const text = getShareableText();
      if (!text) return;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    });
  }

  // Event listener del botón
  btnGenerate.addEventListener('click', generateTeams);
}

// Inicializar en carga o transiciones Astro
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEquipos);
} else {
  initEquipos();
}
document.addEventListener('astro:page-load', initEquipos);
