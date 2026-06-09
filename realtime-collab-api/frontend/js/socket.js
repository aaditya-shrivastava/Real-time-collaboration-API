/**
 * socket.js — Socket.IO client wrapper
 * Manages connection lifecycle, auth, and event emitting.
 */

const SocketClient = (() => {
  let socket = null;
  const handlers = {};

  function connect(token) {
    socket = io('http://localhost:4000', {
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      setConnStatus('connected', 'Live');
      if (handlers.connect) handlers.connect();
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setConnStatus('disconnected', 'Disconnected');
      if (handlers.disconnect) handlers.disconnect(reason);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
      setConnStatus('disconnected', 'Error');
    });

    socket.on('reconnecting', () => {
      setConnStatus('connecting', 'Reconnecting…');
    });

    // Proxy all custom events to registered handlers
    const events = [
      'doc:init', 'doc:operation', 'doc:ack', 'doc:title',
      'presence:joined', 'presence:left',
      'cursor:update', 'error',
    ];
    events.forEach(ev => {
      socket.on(ev, (data) => {
        if (handlers[ev]) handlers[ev](data);
      });
    });
  }

  function on(event, fn) {
    handlers[event] = fn;
  }

  function emit(event, data) {
    if (socket && socket.connected) socket.emit(event, data);
  }

  function disconnect() {
    if (socket) socket.disconnect();
  }

  function setConnStatus(state, label) {
    const dot   = document.getElementById('conn-dot');
    const lbl   = document.getElementById('conn-label');
    if (dot) { dot.className = `conn-dot ${state}`; }
    if (lbl)   lbl.textContent = label;
  }

  return { connect, on, emit, disconnect };
})();
