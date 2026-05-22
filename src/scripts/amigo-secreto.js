// ==========================================================
// AMIGO SECRETO — LÓGICA DE ORGANIZADOR Y REVELACIÓN MÁGICA
// ==========================================================

function initAmigoSecreto() {
  const organizerScreen = document.getElementById('organizer-screen');
  const revealScreen = document.getElementById('reveal-screen');
  const seoSection = document.getElementById('seo-article-section');
  const giftContainer = document.getElementById('gift-container');

  const textInput = document.getElementById('participants-textarea');
  const csvDropzone = document.getElementById('csv-dropzone');
  const csvFileInput = document.getElementById('csv-file-input');
  const tagsContainer = document.getElementById('participants-tags-container');
  const countBadge = document.getElementById('participants-count');
  const btnDraw = document.getElementById('btn-draw');
  const validationSection = document.getElementById('validation-section');
  const matrixTbody = document.getElementById('matrix-tbody');
  const resultsSection = document.getElementById('results-section');
  const linksContainer = document.getElementById('links-list-container');
  const toast = document.getElementById('toast-message');

  let participantsList = []; // Array de { id, name, contact }
  let globalActiveTab = 'tab-manual';
  let audioCtx = null;

  // Detección de parámetros en URL para pantalla de revelación o carga inicial
  const urlParams = new URLSearchParams(window.location.search);
  const encodedSecret = urlParams.get('revelar');

  if (encodedSecret) {
    // MODO REVELACIÓN INTERACTIVA
    if (organizerScreen) organizerScreen.style.display = 'none';
    if (seoSection) seoSection.style.display = 'none';
    if (revealScreen) {
      revealScreen.style.display = 'flex';
      revealScreen.classList.add('slide-up');
    }

    const decryptedName = decryptName(encodedSecret);
    const revealedNameEl = document.getElementById('revealed-name');
    if (revealedNameEl) {
      revealedNameEl.textContent = decryptedName || "Enlace Inválido";
    }

    // Listener para abrir el regalo
    if (giftContainer) {
      // Eliminar clase por si quedó de una transición previa
      giftContainer.classList.remove('opened');
      const openGift = () => {
        if (!giftContainer.classList.contains('opened')) {
          giftContainer.classList.add('opened');
          playRevealSound();
        }
      };
      giftContainer.addEventListener('click', openGift, { once: true });
    }
    return; // No configurar el organizador si estamos en pantalla de revelación
  } else {
    // MODO ORGANIZADOR
    if (organizerScreen) organizerScreen.style.display = 'block';
    if (seoSection) seoSection.style.display = 'block';
    if (revealScreen) revealScreen.style.display = 'none';
  }

  // Verificar que existen los elementos del organizador antes de continuar
  if (!textInput || !btnDraw || !tagsContainer) return;

  // Resetear estados al re-entrar
  participantsList = [];
  textInput.value = '';
  updateParticipantsUI();

  // Control de Pestañas
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.currentTarget.getAttribute('data-tab');
      switchTab(tabId, e.currentTarget);
    });
  });

  function switchTab(tabId, targetBtn) {
    globalActiveTab = tabId;
    tabButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (targetBtn) targetBtn.classList.add('active');
    const contentEl = document.getElementById(tabId);
    if (contentEl) contentEl.classList.add('active');
  }

  // Listeners de entrada manual
  textInput.addEventListener('input', handleManualInput);

  // Carga CSV & Drag and Drop
  if (csvDropzone && csvFileInput) {
    csvDropzone.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', handleCSVFileSelect);

    ['dragenter', 'dragover'].forEach(eventName => {
      csvDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        csvDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      csvDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        csvDropzone.classList.remove('dragover');
      }, false);
    });

    csvDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length) {
        csvFileInput.files = files;
        handleCSVFileSelect();
      }
    });
  }

  // Listener para el botón principal del sorteo
  btnDraw.addEventListener('click', runSorteo);

  // Encriptación XOR + Base64 local
  function encryptName(name) {
    const key = 'decidelo';
    let xor = '';
    const utf8 = unescape(encodeURIComponent(name));
    for (let i = 0; i < utf8.length; i++) {
      xor += String.fromCharCode(utf8.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return encodeURIComponent(btoa(xor));
  }

  // Desencriptación local
  function decryptName(encoded) {
    try {
      const key = 'decidelo';
      const decodedB64 = atob(decodeURIComponent(encoded));
      let xor = '';
      for (let i = 0; i < decodedB64.length; i++) {
        xor += String.fromCharCode(decodedB64.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return decodeURIComponent(escape(xor));
    } catch (e) {
      return null;
    }
  }

  // Procesar entrada manual
  function handleManualInput() {
    const text = textInput.value;
    const lines = text.split('\n');
    participantsList = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let name = trimmed;
      let contact = '';

      if (trimmed.includes(',')) {
        const parts = trimmed.split(',');
        name = parts[0].trim();
        contact = parts.slice(1).join(',').trim(); // Soporta comas extras
      }

      if (name) {
        participantsList.push({
          id: index + 1,
          name: name,
          contact: contact
        });
      }
    });

    updateParticipantsUI();
  }

  // Procesar CSV seleccionado
  function handleCSVFileSelect() {
    const file = csvFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      const parsed = parseCSV(text);
      if (parsed.length > 0) {
        // Combinar con la lista o reemplazar
        participantsList = parsed.map((item, idx) => ({
          id: participantsList.length + idx + 1,
          name: item.name,
          contact: item.contact
        }));

        // Rellenar el textarea para visualización y edición
        let manualText = '';
        participantsList.forEach(p => {
          if (p.contact) {
            manualText += `${p.name}, ${p.contact}\n`;
          } else {
            manualText += `${p.name}\n`;
          }
        });
        textInput.value = manualText;

        updateParticipantsUI();
        showToast(`Cargados ${parsed.length} participantes del CSV`);
        // Cambiar a la pestaña manual para ver la lista final cargada
        const manualTabBtn = document.querySelector('.tab-btn[data-tab="tab-manual"]');
        switchTab('tab-manual', manualTabBtn);
      } else {
        showToast("El archivo CSV está vacío o mal formateado");
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  // CSV Parser simple
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const parsed = [];

    lines.forEach(line => {
      if (!line.trim()) return;

      const row = [];
      let inQuotes = false;
      let current = '';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current.trim());

      if (row.length > 0 && row[0]) {
        const checkHeader = row[0].toLowerCase();
        if (checkHeader === 'nombre' || checkHeader === 'name' || checkHeader === 'participante' || checkHeader === 'participant' || checkHeader === 'contacto' || checkHeader === 'email') {
          return; // Omitir fila cabecera
        }
        parsed.push({
          name: row[0].replace(/^["']|["']$/g, ''),
          contact: (row[1] || '').replace(/^["']|["']$/g, '')
        });
      }
    });
    return parsed;
  }

  // Mostrar notificaciones flotantes Toast
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }

  // Eliminar participante individual
  function removeParticipant(id) {
    participantsList = participantsList.filter(p => p.id !== id);

    // Re-generar textarea
    let manualText = '';
    participantsList.forEach(p => {
      if (p.contact) {
        manualText += `${p.name}, ${p.contact}\n`;
      } else {
        manualText += `${p.name}\n`;
      }
    });
    textInput.value = manualText;

    updateParticipantsUI();
  }

  // Sincronizar UI de etiquetas e interactivos
  function updateParticipantsUI() {
    tagsContainer.innerHTML = '';
    countBadge.textContent = `${participantsList.length} participantes`;

    if (participantsList.length === 0) {
      tagsContainer.innerHTML = '<span class="tag-empty">Ninguno aún. Agrega nombres arriba para empezar.</span>';
      btnDraw.disabled = true;
      if (validationSection) validationSection.classList.remove('show');
      if (resultsSection) resultsSection.classList.remove('show');
      return;
    }

    participantsList.forEach(p => {
      const tag = document.createElement('span');
      tag.className = 'participant-tag';
      tag.innerHTML = `${p.name} `;

      const removeSpan = document.createElement('span');
      removeSpan.className = 'tag-remove';
      removeSpan.innerHTML = '&times;';
      removeSpan.addEventListener('click', () => removeParticipant(p.id));

      tag.appendChild(removeSpan);
      tagsContainer.appendChild(tag);
    });

    btnDraw.disabled = participantsList.length < 2;
  }

  // Sorteo de Ciclo Hamiltoniano Cerrado (Todos regalan y todos reciben en un solo bucle)
  function runSorteo() {
    if (participantsList.length < 2) return;

    // 1. Shuffling de participantes (Fisher-Yates)
    const shuffled = [...participantsList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 2. Asignación secuencial cerrada (A -> B -> C -> ... -> A)
    const assignments = [];
    const n = shuffled.length;
    for (let i = 0; i < n; i++) {
      const giver = shuffled[i];
      const receiver = shuffled[(i + 1) % n];
      assignments.push({ giver, receiver });
    }

    // 3. Ofuscar identificadores para validación pública anónima
    const anonymousIds = {};
    const numberPool = Array.from({ length: n }, (_, idx) => idx + 1);
    for (let i = numberPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numberPool[i], numberPool[j]] = [numberPool[j], numberPool[i]];
    }

    participantsList.forEach((p, idx) => {
      anonymousIds[p.id] = `Participante #${numberPool[idx]}`;
    });

    // 4. Renderizar Matriz de Validación
    if (matrixTbody) {
      matrixTbody.innerHTML = '';
      
      // Mezclar filas de la matriz para evitar revelar la secuencia circular
      const validationRows = assignments.map(pair => ({
        giverAnon: anonymousIds[pair.giver.id],
        receiverAnon: anonymousIds[pair.receiver.id]
      }));

      for (let i = validationRows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validationRows[i], validationRows[j]] = [validationRows[j], validationRows[i]];
      }

      validationRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${row.giverAnon}</strong></td>
          <td class="matrix-arrow">➔ Regala a ➔</td>
          <td><strong>${row.receiverAnon}</strong></td>
        `;
        matrixTbody.appendChild(tr);
      });
    }

    if (validationSection) {
      validationSection.classList.add('show');
    }

    // 5. Renderizar Enlaces de Intercambio Encriptados
    if (linksContainer) {
      linksContainer.innerHTML = '';
      const baseUrl = window.location.origin + window.location.pathname;

      assignments.forEach(pair => {
        const encryptedReceiver = encryptName(pair.receiver.name);
        const secretUrl = `${baseUrl}?revelar=${encryptedReceiver}`;

        const row = document.createElement('div');
        row.className = 'link-row';

        const rowInfo = document.createElement('div');
        rowInfo.className = 'row-info';
        rowInfo.innerHTML = `
          <div class="row-name">${pair.giver.name}</div>
          <div class="row-contact">Contacto: ${pair.giver.contact || 'No especificado'}</div>
        `;

        const rowActions = document.createElement('div');
        rowActions.className = 'row-actions';

        const btnCopy = document.createElement('button');
        btnCopy.className = 'btn-action';
        btnCopy.innerHTML = '📋 Copiar Enlace';
        btnCopy.addEventListener('click', () => {
          navigator.clipboard.writeText(secretUrl).then(() => {
            showToast("¡Enlace copiado al portapapeles!");
          });
        });

        const btnWa = document.createElement('button');
        btnWa.className = 'btn-action btn-wa';
        btnWa.innerHTML = '💬 Compartir';
        btnWa.addEventListener('click', () => {
          const text = `¡Hola ${pair.giver.name}! Aquí tienes tu enlace secreto de Amigo Secreto. Haz clic para descubrir quién te tocó regalar: ${secretUrl}`;
          const encodedText = encodeURIComponent(text);
          let waUrl = '';
          if (pair.giver.contact) {
            const cleanNumber = pair.giver.contact.replace(/[^0-9+]/g, '');
            waUrl = `https://wa.me/${cleanNumber}?text=${encodedText}`;
          } else {
            waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
          }
          window.open(waUrl, '_blank');
        });

        rowActions.appendChild(btnCopy);
        rowActions.appendChild(btnWa);
        row.appendChild(rowInfo);
        row.appendChild(rowActions);
        linksContainer.appendChild(row);
      });
    }

    if (resultsSection) {
      resultsSection.classList.add('show');
      setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }

  // Desencriptar el parámetro en carga si existe
  function decryptName(encoded) {
    try {
      const key = 'decidelo';
      const decodedB64 = atob(decodeURIComponent(encoded));
      let xor = '';
      for (let i = 0; i < decodedB64.length; i++) {
        xor += String.fromCharCode(decodedB64.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return decodeURIComponent(escape(xor));
    } catch (e) {
      return null;
    }
  }

  // Sintetizador de Web Audio para la animación mágica de revelado
  function playRevealSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;

      // Escala armónica de campanadas celestiales ascendentes
      const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5, E5, G5, C6, E6, G6

      freqs.forEach((freq, idx) => {
        const time = now + (idx * 0.08);

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        // Mezcla de sierra y senoidal para un sonido metálico pero dulce
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(time);
        osc.stop(time + 0.55);
      });

      // Crear partículas de confeti visual
      createConfetti();
    } catch (e) {
      console.warn("Audio Context bloqueado o no soportado en este dispositivo.");
    }
  }

  // Animación del Confeti
  function createConfetti() {
    if (!giftContainer) return;
    const colors = ['#00e5ff', '#b366ff', '#ff3366', '#ffcc00', '#39ff14'];

    for (let i = 0; i < 50; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      
      // Centrar sobre el regalo
      p.style.left = '100px';
      p.style.top = '100px';

      // Ángulo y distancia aleatoria
      const angle = Math.random() * Math.PI * 2;
      const distance = 40 + Math.random() * 150;
      const destX = Math.cos(angle) * distance;
      const destY = Math.sin(angle) * distance - 50; // Elevación vertical
      const rot = Math.random() * 360;

      p.style.setProperty('--x', `${destX}px`);
      p.style.setProperty('--y', `${destY}px`);
      p.style.setProperty('--rot', `${rot}deg`);

      giftContainer.appendChild(p);

      setTimeout(() => {
        p.remove();
      }, 1200);
    }
  }
}

// Inicializar script según estado del DOM o transiciones Astro
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAmigoSecreto);
} else {
  initAmigoSecreto();
}
document.addEventListener('astro:page-load', initAmigoSecreto);
