/**
 * presence.js — Tracks and renders active collaborators
 */

const CURSOR_COLORS = [
  '#f56565','#ed8936','#ecc94b','#48bb78',
  '#38b2ac','#4299e1','#9f7aea','#ed64a6',
];

const Presence = (() => {
  const userColors = {};
  let colorIdx = 0;
  let currentUserId = null;

  function init(myUserId) {
    currentUserId = myUserId;
  }

  function getColor(userId) {
    if (!userColors[userId]) {
      userColors[userId] = CURSOR_COLORS[colorIdx % CURSOR_COLORS.length];
      colorIdx++;
    }
    return userColors[userId];
  }

  function render(activeUsers) {
    const list = document.getElementById('user-list');
    if (!list) return;

    if (!activeUsers || activeUsers.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text2)">No one else here yet</div>';
      return;
    }

    list.innerHTML = activeUsers.map(u => {
      const isMe = u.id === currentUserId;
      const color = getColor(u.id);
      const initials = u.username.slice(0, 2).toUpperCase();
      return `
        <div class="user-item">
          <div class="user-avatar" style="background:${color}20;color:${color}">
            ${initials}
          </div>
          <div>
            <div class="user-name">${escHtml(u.username)}</div>
            ${isMe ? '<div class="user-you">You</div>' : ''}
          </div>
          <div style="margin-left:auto">
            <div class="conn-dot connected" style="background:${color}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { init, getColor, render };
})();
