const API = '/api';

// ── Utils ──
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function getToken() { return localStorage.getItem('token'); }
function getUser()  { return JSON.parse(localStorage.getItem('user') || 'null'); }

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ──
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
  document.getElementById('login-form').classList.toggle('active', tab === 'login');
  document.getElementById('register-form').classList.toggle('active', tab === 'register');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!email || !password) return toast('Fill in all fields', 'error');
  try {
    const { user, token } = await apiFetch('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuth(token, user);
    showDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  if (!username || !email || !password) return toast('Fill in all fields', 'error');
  try {
    const { user, token } = await apiFetch('/users/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    setAuth(token, user);
    showDashboard();
    toast('Account created!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function handleLogout() {
  clearAuth();
  document.getElementById('dashboard-page').style.display = 'none';
  document.getElementById('auth-page').style.display = 'flex';
}

// ── Dashboard ──
function showDashboard() {
  const user = getUser();
  if (!user) return;
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('dashboard-page').style.display = 'block';
  document.getElementById('nav-username').textContent = user.username;
  loadDocuments();
}

async function loadDocuments() {
  try {
    const { documents } = await apiFetch('/documents');
    renderDocuments(documents);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderDocuments(docs) {
  const grid = document.getElementById('doc-grid');
  const empty = document.getElementById('docs-empty');
  grid.innerHTML = '';

  if (!docs.length) {
    empty.style.display = 'block';
    grid.appendChild(empty);
    return;
  }

  empty.style.display = 'none';
  docs.forEach(doc => {
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.innerHTML = `
      <h3>${escHtml(doc.title)}</h3>
      <div class="doc-meta">
        <span class="badge badge-blue">v${doc.version}</span>
        &nbsp;${timeAgo(doc.updated_at)} · ${doc.owner_name}
      </div>
      <div class="doc-actions">
        <button class="icon-btn danger" title="Delete" onclick="deleteDoc(event,'${doc.id}')">🗑</button>
      </div>
    `;
    card.addEventListener('click', () => openDoc(doc.id));
    grid.appendChild(card);
  });
}

async function createDocument() {
  try {
    const { document: doc } = await apiFetch('/documents', {
      method: 'POST',
      body: JSON.stringify({ title: 'Untitled Document' }),
    });
    openDoc(doc.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteDoc(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this document?')) return;
  try {
    await apiFetch(`/documents/${id}`, { method: 'DELETE' });
    toast('Document deleted', 'success');
    loadDocuments();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openDoc(id) {
  window.location.href = `/pages/editor.html?doc=${id}`;
}

// ── Helpers ──
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// ── Init ──
(function init() {
  if (getToken() && getUser()) {
    showDashboard();
  }
})();
