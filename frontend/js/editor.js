/**
 * editor.js — Collaborative editor core
 * Handles OT operations, socket sync, version history, cursor tracking
 */

const API = '/api';

// ── State ──
let docId       = null;
let token       = null;
let currentUser = null;
let serverVersion = 0;
let localContent  = '';
let isApplyingRemote = false;
let saveStatusTimer  = null;
let cursorTimer      = null;
let titleTimer       = null;

// Remote cursors: userId -> { position, username, color }
const remoteCursors = {};
let cursorOverlay = null;

// ── Cursor Colors ──
const CURSOR_COLORS = [
  '#f56565','#ed8936','#ecc94b','#48bb78',
  '#38b2ac','#4299e1','#9f7aea','#ed64a6',
];
const userColorMap = {};
let colorIndex = 0;

function getUserColor(userId) {
  if (!userColorMap[userId]) {
    userColorMap[userId] = CURSOR_COLORS[colorIndex % CURSOR_COLORS.length];
    colorIndex++;
  }
  return userColorMap[userId];
}

// ── Init ──
(function init() {
  token = localStorage.getItem('token');
  currentUser = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !currentUser) {
    window.location.href = '/';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  docId = params.get('doc');
  if (!docId) { window.location.href = '/'; return; }

  Presence.init(currentUser.id);

  // Connect socket
  SocketClient.connect(token);
  setupSocketHandlers();
  setupEditorHandlers();
  loadVersionHistory();

  // Setup cursor overlay after DOM is ready
  window.addEventListener('load', setupCursorOverlay);
})();

// ── Socket Handlers ──
function setupSocketHandlers() {
  SocketClient.on('connect', () => {
    SocketClient.emit('doc:join', { docId });
  });

  SocketClient.on('doc:init', ({ content, version, activeUsers }) => {
    localContent  = content;
    serverVersion = version;
    document.getElementById('editor').value = content;
    document.getElementById('doc-version').textContent = `v${version}`;
    updateWordCount(content);
    Presence.render(activeUsers);
  });

  SocketClient.on('doc:operation', ({ operation, version, userId, username }) => {
    if (userId === currentUser.id) return; // ignore our own broadcast
    applyRemoteOperation(operation);
    serverVersion = version;
    document.getElementById('doc-version').textContent = `v${version}`;
  });

  SocketClient.on('doc:ack', ({ operation, version }) => {
    serverVersion = version;
    document.getElementById('doc-version').textContent = `v${version}`;
    setSaveStatus('saved');
  });

  SocketClient.on('doc:title', ({ title }) => {
    const input = document.getElementById('doc-title-input');
    if (document.activeElement !== input) {
      input.value = title;
      document.title = `${title} — CollabDocs`;
    }
  });

  SocketClient.on('presence:joined', ({ user, activeUsers }) => {
    Presence.render(activeUsers);
    showToast(`${user.username} joined`, 'info');
  });

  SocketClient.on('presence:left', ({ user, activeUsers }) => {
    Presence.render(activeUsers);
    delete remoteCursors[user.id];
    renderRemoteCursors();
    showToast(`${user.username} left`, 'info');
  });

  SocketClient.on('cursor:update', ({ userId, username, cursor }) => {
    if (userId === currentUser.id) return;
    remoteCursors[userId] = { position: cursor.position, username };
    renderRemoteCursors();
  });

  SocketClient.on('error', ({ message }) => {
    showToast(message, 'error');
  });
}

// ── Editor Handlers ──
function setupEditorHandlers() {
  const editor = document.getElementById('editor');
  const titleInput = document.getElementById('doc-title-input');

  // Load document title
  fetch(`${API}/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.json())
    .then(({ document: doc }) => {
      if (doc) {
        titleInput.value = doc.title;
        document.title = `${doc.title} — CollabDocs`;
      }
    })
    .catch(() => {});

  // Editor input → generate OT operation
  let lastContent = '';
  editor.addEventListener('input', () => {
    if (isApplyingRemote) return;

    const newContent = editor.value;
    const op = diffToOperation(lastContent || localContent, newContent);
    lastContent = newContent;
    localContent = newContent;

    updateWordCount(newContent);
    setSaveStatus('saving');

    if (op) {
      SocketClient.emit('doc:operation', {
        docId,
        operation: op,
        clientVersion: serverVersion,
      });
    }
  });

  // Cursor position broadcast
  editor.addEventListener('keyup', () => {
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      SocketClient.emit('cursor:update', {
        docId,
        cursor: {
          position: editor.selectionStart,
          line: getLineNumber(editor),
        },
      });
    }, 100);
  });

  editor.addEventListener('click', () => {
    SocketClient.emit('cursor:update', {
      docId,
      cursor: { position: editor.selectionStart, line: getLineNumber(editor) },
    });
  });

  // Title change broadcast
  titleInput.addEventListener('input', () => {
    clearTimeout(titleTimer);
    document.title = `${titleInput.value || 'Untitled'} — CollabDocs`;
    titleTimer = setTimeout(() => {
      SocketClient.emit('doc:title', { docId, title: titleInput.value });
      fetch(`${API}/documents/${docId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: titleInput.value }),
      }).catch(() => {});
    }, 1000);
  });
}

// ── OT: Diff two strings into an operation ──
function diffToOperation(oldStr, newStr) {
  if (oldStr === newStr) return null;

  // Find common prefix
  let start = 0;
  while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) {
    start++;
  }

  // Find common suffix
  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const deletedText = oldStr.slice(start, oldEnd);
  const insertedText = newStr.slice(start, newEnd);

  if (deletedText && insertedText) {
    // Replace = delete then insert (send as two ops, use insert for simplicity)
    return { type: 'insert', position: start, text: insertedText, deleteLength: deletedText.length };
  }
  if (deletedText) {
    return { type: 'delete', position: start, length: deletedText.length };
  }
  if (insertedText) {
    return { type: 'insert', position: start, text: insertedText };
  }
  return null;
}

// ── Apply a remote operation to the editor ──
function applyRemoteOperation(op) {
  if (!op || op.type === 'noop') return;
  const editor = document.getElementById('editor');
  const cursorPos = editor.selectionStart;

  isApplyingRemote = true;

  let content = editor.value;

  if (op.type === 'insert') {
    const pos = Math.min(op.position, content.length);
    if (op.deleteLength) content = content.slice(0, pos) + content.slice(pos + op.deleteLength);
    content = content.slice(0, pos) + op.text + content.slice(pos);
  } else if (op.type === 'delete') {
    const pos = Math.min(op.position, content.length);
    const end = Math.min(pos + op.length, content.length);
    content = content.slice(0, pos) + content.slice(end);
  }

  editor.value = content;
  localContent = content;

  // Restore cursor position
  const newCursor = adjustCursorPos(cursorPos, op);
  editor.setSelectionRange(newCursor, newCursor);

  updateWordCount(content);
  isApplyingRemote = false;
}

function adjustCursorPos(cursorPos, op) {
  if (op.type === 'insert' && op.position <= cursorPos) {
    return cursorPos + op.text.length - (op.deleteLength || 0);
  }
  if (op.type === 'delete' && op.position < cursorPos) {
    return Math.max(op.position, cursorPos - op.length);
  }
  return cursorPos;
}

// ── Version History ──
async function loadVersionHistory() {
  try {
    const res = await fetch(`${API}/documents/${docId}/versions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { versions } = await res.json();
    renderVersions(versions, 'version-list');
  } catch (err) {
    console.error('Version load error:', err);
  }
}

function renderVersions(versions, containerId) {
  const list = document.getElementById(containerId);
  if (!list) return;
  if (!versions || !versions.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text2)">No versions yet</div>';
    return;
  }
  list.innerHTML = versions.map(v => `
    <div class="version-item">
      <div>
        <span class="v-num">v${v.version_number}</span>
        ${v.operation?.type === 'rollback'
          ? `<span class="badge badge-blue" style="margin-left:4px">rollback</span>`
          : ''}
      </div>
      <div class="v-meta">${v.author || 'Unknown'} · ${timeAgo(v.created_at)}</div>
      <div class="v-actions">
        <button class="btn btn-ghost btn-sm"
          onclick="previewVersion('${v.id}','${v.version_number}','${escHtml(v.content || '')}')">
          Preview
        </button>
        <button class="btn btn-danger btn-sm"
          onclick="rollbackTo(${v.version_number})">
          Restore
        </button>
      </div>
    </div>
  `).join('');
}

function previewVersion(id, num, content) {
  const editor = document.getElementById('editor');
  if (confirm(`Preview version ${num}? Your current content will be temporarily replaced.`)) {
    editor.value = content;
    showToast(`Previewing v${num} — click Restore to apply`, 'info');
  }
}

async function rollbackTo(versionNumber) {
  if (!confirm(`Restore document to version ${versionNumber}?`)) return;
  try {
    const res = await fetch(`${API}/documents/${docId}/versions/rollback/${versionNumber}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const { document: doc } = await res.json();
    document.getElementById('editor').value = doc.content;
    localContent = doc.content;
    serverVersion = doc.version;
    document.getElementById('doc-version').textContent = `v${doc.version}`;
    showToast(`Rolled back to v${versionNumber}`, 'success');
    loadVersionHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openVersionModal() {
  document.getElementById('version-modal').classList.add('open');
  // Reload into modal
  fetch(`${API}/documents/${docId}/versions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.json())
    .then(({ versions }) => renderVersions(versions, 'modal-version-list'))
    .catch(() => {});
}

function closeVersionModal() {
  document.getElementById('version-modal').classList.remove('open');
}

// Close modal on overlay click
document.getElementById('version-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeVersionModal();
});

// ── Remote Cursor Rendering ──
function setupCursorOverlay() {
  const editorEl = document.getElementById('editor');
  if (!editorEl) return;
  const wrapper = editorEl.parentElement;
  if (!wrapper) return;

  // Make wrapper relative so overlay can sit on top
  wrapper.style.position = 'relative';

  cursorOverlay = document.createElement('div');
  cursorOverlay.id = 'cursor-overlay';
  cursorOverlay.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    overflow: hidden;
    border-radius: 10px;
  `;
  wrapper.appendChild(cursorOverlay);
}

function getCaretCoordinates(textarea, position) {
  // Create a mirror div to measure caret position
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  mirror.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    font: ${style.font};
    font-size: ${style.fontSize};
    font-family: ${style.fontFamily};
    line-height: ${style.lineHeight};
    padding: ${style.padding};
    border: ${style.border};
    width: ${textarea.offsetWidth}px;
    box-sizing: border-box;
  `;

  const text = textarea.value.substring(0, position);
  mirror.textContent = text;

  const cursor = document.createElement('span');
  cursor.textContent = '|';
  mirror.appendChild(cursor);

  document.body.appendChild(mirror);
  const rect = cursor.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    top: rect.top - textareaRect.top + textarea.scrollTop,
    left: rect.left - textareaRect.left,
  };
}

function renderRemoteCursors() {
  if (!cursorOverlay) return;
  const editor = document.getElementById('editor');
  cursorOverlay.innerHTML = '';

  Object.entries(remoteCursors).forEach(([userId, { position, username }]) => {
    if (position === undefined || position === null) return;

    const color = getUserColor(userId);
    const coords = getCaretCoordinates(editor, position);

    // Cursor line
    const line = document.createElement('div');
    line.style.cssText = `
      position: absolute;
      top: ${coords.top}px;
      left: ${coords.left}px;
      width: 2px;
      height: 20px;
      background: ${color};
      border-radius: 1px;
      animation: cursorBlink 1s ease-in-out infinite;
    `;

    // Name tag
    const tag = document.createElement('div');
    tag.textContent = username;
    tag.style.cssText = `
      position: absolute;
      top: ${coords.top - 22}px;
      left: ${coords.left}px;
      background: ${color};
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      font-family: Inter, system-ui, sans-serif;
      padding: 2px 7px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
    `;

    cursorOverlay.appendChild(line);
    cursorOverlay.appendChild(tag);
  });
}

// ── Misc ──
function goToDashboard() {
  SocketClient.emit('doc:leave', { docId });
  window.location.href = '/';
}

function shareDoc() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied to clipboard!', 'success');
  }).catch(() => {
    prompt('Share this link:', url);
  });
}

function setSaveStatus(state) {
  const el = document.getElementById('save-status');
  if (!el) return;
  clearTimeout(saveStatusTimer);
  if (state === 'saving') {
    el.textContent = 'Saving…';
    el.className = 'saving';
  } else {
    el.textContent = 'Saved';
    el.className = 'saved';
    saveStatusTimer = setTimeout(() => {
      el.textContent = 'Saved';
      el.className = '';
    }, 3000);
  }
}

function updateWordCount(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const el = document.getElementById('word-count');
  if (el) el.textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

function getLineNumber(textarea) {
  const text = textarea.value.substr(0, textarea.selectionStart);
  return text.split('\n').length;
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}