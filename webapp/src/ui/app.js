/* global WebSocket, SpeechRecognition, webkitSpeechRecognition */
const $ = (id) => document.getElementById(id);

let ws = null;
let sessionId = null;
let selectedMode = 'masterclass';
let currentAssistantMsg = null;
let uploadedFiles = [];
let recognition = null;
let isRecording = false;
let sttEnabled = false;

// --- Status Check ---

async function checkStatus() {
  const dot = $('status-dot');
  const text = $('status-text');
  const setup = $('setup-panel');
  const start = $('start-panel');

  try {
    const res = await fetch('/api/v1/status');
    const status = await res.json();

    if (!status.installed) {
      dot.className = 'status-dot err';
      text.textContent = 'Claude Code not found';
      $('setup-msg').textContent = 'Claude Code CLI is not installed. Run:';
      $('install-cmd').textContent = 'npm install -g @anthropic-ai/claude-code';
      $('install-cmd').style.display = 'block';
      setup.style.display = 'block';
      start.style.display = 'none';
      return;
    }

    if (!status.authenticated) {
      dot.className = 'status-dot err';
      text.textContent = 'Not authenticated';
      $('setup-msg').textContent = 'Claude Code is installed but not logged in. Run:';
      $('install-cmd').textContent = 'claude auth login';
      $('install-cmd').style.display = 'block';
      setup.style.display = 'block';
      start.style.display = 'none';
      return;
    }

    dot.className = 'status-dot ok';
    text.textContent = `Ready (${status.version || 'unknown'})`;
    setup.style.display = 'none';
    start.style.display = 'block';
    initStt();
  } catch {
    dot.className = 'status-dot err';
    text.textContent = 'Server unreachable';
  }
}

// --- Mode Selection ---

function selectMode(btn) {
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  selectedMode = btn.dataset.mode;
}

// --- File Upload ---

async function handleFiles(fileList) {
  for (const file of fileList) {
    if (file.size > 20 * 1024 * 1024) {
      alert(`${file.name} is too large (max 20 MB)`);
      continue;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/upload', { method: 'POST', body: formData });
      const result = await res.json();

      if (!res.ok) {
        alert(result.error || 'Upload failed');
        continue;
      }

      uploadedFiles.push({ id: result.id, name: result.name, size: result.size });
      renderFileList();
    } catch {
      alert(`Failed to upload ${file.name}`);
    }
  }
  $('file-input').value = '';
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  const container = $('file-list');
  container.innerHTML = '';
  uploadedFiles.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    const sizeKb = Math.round(f.size / 1024);
    div.innerHTML = `<span class="name">${esc(f.name)}</span><span class="size">${sizeKb} KB</span>`;
    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.textContent = '\u00d7';
    btn.onclick = () => removeFile(i);
    div.appendChild(btn);
    container.appendChild(div);
  });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Voice / STT ---

function initStt() {
  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechAPI) return;

  $('stt-toggle').style.display = 'flex';

  recognition = new SpeechAPI();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const input = $('chat-input');
    if (input && transcript) {
      input.value = transcript;
    }
  };

  recognition.onend = () => {
    if (isRecording) {
      try { recognition.start(); } catch { /* already started */ }
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.error('STT error:', event.error);
      stopRecording();
    }
  };
}

function toggleStt(enabled) {
  sttEnabled = enabled;
  const micBtn = $('mic-btn');
  if (micBtn) {
    micBtn.style.display = enabled ? 'block' : 'none';
  }
  if (!enabled && isRecording) {
    stopRecording();
  }
}

function toggleRecording() {
  if (!recognition || !sttEnabled) return;
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!recognition) return;
  try {
    recognition.start();
    isRecording = true;
    $('mic-btn').classList.add('recording');
  } catch { /* already started */ }
}

function stopRecording() {
  if (!recognition) return;
  isRecording = false;
  recognition.stop();
  $('mic-btn').classList.remove('recording');
}

// --- Chat Messages ---

function addMessage(text, role) {
  const container = $('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// --- WebSocket ---

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    addMessage('Connection closed.', 'system');
    $('send-btn').disabled = true;
  };

  ws.onerror = () => {
    addMessage('Connection error.', 'system');
  };
}

function handleServerMessage(msg) {
  if (msg.type === 'status') {
    if (msg.status === 'spawning') addMessage('Starting evaluation session...', 'system');
    if (msg.status === 'ready') {
      sessionId = msg.detail;
      $('send-btn').disabled = false;
      $('chat-input').focus();
    }
    if (msg.status === 'error') addMessage(`Error: ${msg.detail || 'Unknown error'}`, 'system');
    return;
  }

  if (msg.type === 'chunk') {
    if (!currentAssistantMsg) currentAssistantMsg = addMessage('', 'assistant');
    currentAssistantMsg.textContent += msg.text;
    $('messages').scrollTop = $('messages').scrollHeight;
    return;
  }

  if (msg.type === 'message_end') {
    currentAssistantMsg = null;
    return;
  }

  if (msg.type === 'session_end') {
    currentAssistantMsg = null;
    addMessage('Session ended.', 'system');
    $('send-btn').disabled = true;
    $('chat-input').disabled = true;
    if (isRecording) stopRecording();
    if (msg.memoAvailable) $('pdf-bar').style.display = 'block';
    return;
  }

  if (msg.type === 'error') addMessage(`Error: ${msg.message}`, 'system');
}

// --- Session ---

function startSession() {
  const pitch = $('pitch-input').value.trim();
  if (!pitch) { $('pitch-input').focus(); return; }

  let fullPitch = pitch;
  if (uploadedFiles.length > 0) {
    const fileNames = uploadedFiles.map((f) => f.name).join(', ');
    fullPitch += `\n\n[Attached files: ${fileNames}]`;
  }

  $('start-panel').style.display = 'none';
  $('chat-panel').style.display = 'flex';
  $('send-btn').disabled = true;

  addMessage(pitch, 'user');
  if (uploadedFiles.length > 0) {
    addMessage(`${uploadedFiles.length} file(s) attached.`, 'system');
  }
  connectWebSocket();

  const waitForOpen = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      clearInterval(waitForOpen);
      ws.send(JSON.stringify({ type: 'start', mode: selectedMode, pitch: fullPitch }));
    }
  }, 100);
}

function sendMessage() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

  addMessage(text, 'user');
  ws.send(JSON.stringify({ type: 'message', text }));
  input.value = '';
  input.focus();
}

// --- PDF ---

async function downloadPdf() {
  if (!sessionId) return;

  try {
    const res = await fetch('/api/v1/memo/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to generate PDF');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investment-memo.pdf';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('Failed to download PDF');
  }
}

// --- Init ---
checkStatus();
