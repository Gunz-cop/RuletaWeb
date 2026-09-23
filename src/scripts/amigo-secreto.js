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
  const drawWarning = document.getElementById('draw-warning');
  const savedDrawBanner = document.getElementById('saved-draw');
  const STORAGE_KEY = 'amigo-secreto:ultimo-sorteo';

  let participantsList = []; // Array de { id, name, contact }
  let globalActiveTab = 'tab-manual';
  let audioCtx = null;
  let currentDraw = null; // { date, text, matrixRows, links: [{ name, contact, url, sent }] }

  // El dato va en el fragmento (#revelar=) porque el navegador nunca envía
  // el fragmento al servidor: así el nombre no queda en registros ni en la
  // analítica. Se sigue aceptando ?revelar= para no romper los enlaces que
  // ya se repartieron antes del cambio.
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const urlParams = new URLSearchParams(window.location.search);
  const encodedSecret = hashParams.get('revelar') || urlParams.get('revelar');

  if (encodedSecret) {
    // MODO REVELACIÓN INTERACTIVA
    if (organizerScreen) organizerScreen.style.display = 'none';
    if (seoSection) seoSection.style.display = 'none';
    if (revealScreen) {
      revealScreen.style.display = 'flex';
      revealScreen.classList.add('slide-up');
    }

    // La vista de revelación es personal: que no se indexe ni comparta título
    // con la página del organizador.
    const robotsMeta = document.querySelector('meta[name="robots"]');
    if (robotsMeta) robotsMeta.setAttribute('content', 'noindex, nofollow');
    document.title = 'Tu amigo secreto 🎁 | Decídelo.app';

    const decryptedName = decryptName(encodedSecret);
    const revealedNameEl = document.getElementById('revealed-name');

    if (!decryptedName) {
      // Un enlace roto no debe celebrar nada: se explica y no se abre el regalo.
      const inviteBox = revealScreen && revealScreen.querySelector('.invite-box');
      if (inviteBox) {
        inviteBox.querySelector('h2').textContent = 'Este enlace no funciona';
        inviteBox.querySelector('p').textContent = 'Puede que se haya copiado incompleto. Pídele a quien organizó el sorteo que te lo envíe de nuevo.';
      }
      if (giftContainer) giftContainer.style.display = 'none';
      return;
    }

    if (revealedNameEl) revealedNameEl.textContent = decryptedName;

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

  // Si el organizador abre un enlace en la misma pestaña, solo cambia el
  // fragmento y la página no se recarga: hay que recargar a mano para
  // entrar en modo revelación.
  if (!window.__amigoHashListener) {
    window.__amigoHashListener = true;
    window.addEventListener('hashchange', () => {
      if (new URLSearchParams(window.location.hash.slice(1)).get('revelar')) {
        window.location.reload();
      }
    });
  }

  // Resetear estados al re-entrar
  participantsList = [];
  textInput.value = '';
  updateParticipantsUI();
  offerSavedDraw();

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
      updateDrawWarning([]);
      return;
    }

    participantsList.forEach(p => {
      const tag = document.createElement('span');
      tag.className = 'participant-tag';
      // textContent, nunca innerHTML: el nombre lo escribe el usuario o llega
      // de un CSV ajeno, y como HTML podría ejecutar código en la página.
      tag.textContent = `${p.name} `;

      const removeSpan = document.createElement('span');
      removeSpan.className = 'tag-remove';
      removeSpan.textContent = '×';
      removeSpan.addEventListener('click', () => removeParticipant(p.id));

      tag.appendChild(removeSpan);
      tagsContainer.appendChild(tag);
    });

    const duplicates = findDuplicateNames();
    btnDraw.disabled = participantsList.length < 2 || duplicates.length > 0;
    updateDrawWarning(duplicates);
  }

  // Dos personas con el mismo nombre reciben enlaces idénticos y una creerá
  // que se tocó a sí misma: se bloquea el sorteo hasta que se distingan.
  function findDuplicateNames() {
    const seen = new Map();
    participantsList.forEach(p => {
      const key = p.name.toLocaleLowerCase('es').replace(/\s+/g, ' ');
      if (!seen.has(key)) seen.set(key, { name: p.name, count: 0 });
      seen.get(key).count++;
    });
    return [...seen.values()].filter(v => v.count > 1);
  }

  function updateDrawWarning(duplicates) {
    if (!drawWarning) return;
    let message = '';
    if (duplicates.length > 0) {
      const names = duplicates.map(d => `«${d.name}» (${d.count} veces)`).join(', ');
      message = `Hay nombres repetidos: ${names}. Agrega una inicial o un apellido para distinguirlos; si no, quien reciba ese nombre creerá que se tocó a sí mismo.`;
    } else if (participantsList.length === 2 || participantsList.length === 3) {
      message = `Con ${participantsList.length} participantes cada uno puede deducir quién le regala. El sorteo funciona, pero la sorpresa es mejor desde 4 personas.`;
    }
    drawWarning.textContent = message;
    drawWarning.hidden = !message;
  }

  // Sorteo de ciclo cerrado: todos regalan y todos reciben en una sola cadena,
  // sin subgrupos. El resultado se guarda en el navegador porque el móvil
  // descarga la pestaña al cambiar a WhatsApp y el organizador perdería los
  // enlaces que le faltaba repartir.
  function runSorteo() {
    if (participantsList.length < 2) return;

    const saved = loadSavedDraw();
    const sentCount = saved ? saved.links.filter(l => l.sent).length : 0;
    if (sentCount > 0 && !window.confirm(`Ya enviaste ${sentCount} enlace(s) del sorteo anterior. Si sorteas de nuevo, esos enlaces dejan de coincidir con los nuevos. ¿Sortear de nuevo?`)) {
      return;
    }

    // 1. Barajado de participantes (Fisher-Yates)
    const shuffled = [...participantsList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 2. Asignación secuencial cerrada (A -> B -> C -> ... -> A)
    const n = shuffled.length;
    const assignments = shuffled.map((giver, i) => ({ giver, receiver: shuffled[(i + 1) % n] }));

    // 3. Números anónimos para la matriz de validación
    const numberPool = Array.from({ length: n }, (_, idx) => idx + 1);
    for (let i = numberPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numberPool[i], numberPool[j]] = [numberPool[j], numberPool[i]];
    }
    const anonymousIds = {};
    participantsList.forEach((p, idx) => {
      anonymousIds[p.id] = `Participante #${numberPool[idx]}`;
    });

    // Filas mezcladas para no revelar el orden de la cadena
    const matrixRows = assignments.map(pair => ({
      giverAnon: anonymousIds[pair.giver.id],
      receiverAnon: anonymousIds[pair.receiver.id]
    }));
    for (let i = matrixRows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [matrixRows[i], matrixRows[j]] = [matrixRows[j], matrixRows[i]];
    }

    const baseUrl = window.location.origin + window.location.pathname;
    const links = assignments.map(pair => ({
      name: pair.giver.name,
      contact: pair.giver.contact,
      url: `${baseUrl}#revelar=${encryptName(pair.receiver.name)}`,
      sent: false
    }));

    currentDraw = { date: Date.now(), text: textInput.value, matrixRows, links };
    saveDraw();
    if (savedDrawBanner) savedDrawBanner.hidden = true;
    renderDraw(true);
  }

  function renderDraw(scroll) {
    if (!currentDraw) return;

    if (matrixTbody) {
      matrixTbody.innerHTML = '';
      currentDraw.matrixRows.forEach(row => {
        const tr = document.createElement('tr');
        const cells = [row.giverAnon, '➔ Regala a ➔', row.receiverAnon];
        cells.forEach((text, idx) => {
          const td = document.createElement('td');
          if (idx === 1) {
            td.className = 'matrix-arrow';
            td.textContent = text;
          } else {
            const strong = document.createElement('strong');
            strong.textContent = text;
            td.appendChild(strong);
          }
          tr.appendChild(td);
        });
        matrixTbody.appendChild(tr);
      });
    }
    if (validationSection) validationSection.classList.add('show');

    if (linksContainer) {
      linksContainer.innerHTML = '';
      currentDraw.links.forEach(link => linksContainer.appendChild(buildLinkRow(link)));
    }

    if (resultsSection) {
      resultsSection.classList.add('show');
      if (scroll) {
        setTimeout(() => {
          resultsSection.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }
    }
  }

  function buildLinkRow(link) {
    const row = document.createElement('div');
    row.className = 'link-row';

    const rowInfo = document.createElement('div');
    rowInfo.className = 'row-info';
    const rowName = document.createElement('div');
    rowName.className = 'row-name';
    const rowContact = document.createElement('div');
    rowContact.className = 'row-contact';
    rowContact.textContent = `Contacto: ${link.contact || 'No especificado'}`;
    rowInfo.append(rowName, rowContact);

    const paintSent = () => {
      rowName.textContent = link.sent ? `${link.name} · Enviado ✓` : link.name;
    };
    paintSent();
    const markSent = () => {
      link.sent = true;
      saveDraw();
      paintSent();
    };

    const rowActions = document.createElement('div');
    rowActions.className = 'row-actions';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn-action';
    btnCopy.textContent = '📋 Copiar Enlace';
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(link.url).then(() => {
        showToast("¡Enlace copiado al portapapeles!");
        markSent();
      });
    });

    const btnWa = document.createElement('button');
    btnWa.className = 'btn-action btn-wa';
    btnWa.textContent = '💬 Compartir';
    btnWa.addEventListener('click', () => {
      const text = `¡Hola ${link.name}! Aquí tienes tu enlace secreto de Amigo Secreto. Haz clic para descubrir quién te tocó regalar: ${link.url}`;
      const encodedText = encodeURIComponent(text);
      let waUrl = '';
      if (link.contact) {
        const cleanNumber = link.contact.replace(/[^0-9+]/g, '');
        waUrl = `https://wa.me/${cleanNumber}?text=${encodedText}`;
      } else {
        waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
      }
      markSent();
      window.open(waUrl, '_blank');
    });

    rowActions.append(btnCopy, btnWa);
    row.append(rowInfo, rowActions);
    return row;
  }

  // localStorage puede no existir o lanzar (modo privado, datos bloqueados):
  // en ese caso la herramienta funciona igual, solo que sin recuperar.
  function saveDraw() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentDraw));
    } catch (e) { /* sin almacenamiento disponible */ }
  }

  function loadSavedDraw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.links) && Array.isArray(data.matrixRows)) return data;
    } catch (e) { /* sin almacenamiento o dato corrupto */ }
    return null;
  }

  function clearSavedDraw() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* sin almacenamiento disponible */ }
  }

  function offerSavedDraw() {
    const saved = loadSavedDraw();
    if (!saved || !savedDrawBanner) return;

    const sent = saved.links.filter(l => l.sent).length;
    const date = new Date(saved.date).toLocaleString('es', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const info = savedDrawBanner.querySelector('[data-saved-info]');
    if (info) {
      info.textContent = `Tienes un sorteo guardado del ${date}: ${saved.links.length} participantes, ${sent} enlace(s) ya enviados.`;
    }
    savedDrawBanner.hidden = false;

    savedDrawBanner.querySelector('[data-saved-restore]').onclick = () => {
      currentDraw = saved;
      textInput.value = saved.text || '';
      handleManualInput();
      savedDrawBanner.hidden = true;
      renderDraw(true);
    };
    savedDrawBanner.querySelector('[data-saved-clear]').onclick = () => {
      if (!window.confirm('¿Borrar el sorteo guardado? Los enlaces que ya enviaste siguen funcionando, pero no podrás volver a verlos aquí.')) return;
      clearSavedDraw();
      savedDrawBanner.hidden = true;
    };
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
