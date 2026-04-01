/* global WebSocket */
const $ = (id) => document.getElementById(id);

let ws = null;
let sessionId = null;
let selectedMode = 'masterclass';
let currentAssistantMsg = null;

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
  } catch {
    dot.className = 'status-dot err';
    text.textContent = 'Server unreachable';
  }
}

function selectMode(btn) {
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  selectedMode = btn.dataset.mode;
}

function addMessage(text, role) {
  const container = $('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

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
    if (msg.status === 'spawning') {
      addMessage('Starting evaluation session...', 'system');
    }
    if (msg.status === 'ready') {
      sessionId = msg.detail;
      $('send-btn').disabled = false;
      $('chat-input').focus();
    }
    if (msg.status === 'error') {
      addMessage(`Error: ${msg.detail || 'Unknown error'}`, 'system');
    }
    return;
  }

  if (msg.type === 'chunk') {
    if (!currentAssistantMsg) {
      currentAssistantMsg = addMessage('', 'assistant');
    }
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
    if (msg.memoAvailable) {
      $('pdf-bar').style.display = 'block';
    }
    return;
  }

  if (msg.type === 'error') {
    addMessage(`Error: ${msg.message}`, 'system');
  }
}

function startSession() {
  const pitch = $('pitch-input').value.trim();
  if (!pitch) {
    $('pitch-input').focus();
    return;
  }

  $('start-panel').style.display = 'none';
  $('chat-panel').style.display = 'flex';
  $('send-btn').disabled = true;

  addMessage(pitch, 'user');
  connectWebSocket();

  const waitForOpen = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      clearInterval(waitForOpen);
      ws.send(JSON.stringify({ type: 'start', mode: selectedMode, pitch }));
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

checkStatus();
