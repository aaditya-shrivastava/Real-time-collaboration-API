const Document = require('../src/models/document');
const Version = require('../src/models/version');
const presenceService = require('../src/services/presenceService');
const { applyOperation, transform } = require('../src/services/otService');

// In-memory doc state: docId -> { content, version, pendingOps[] }
const docState = new Map();

const getDocState = async (docId) => {
  if (!docState.has(docId)) {
    const doc = await Document.findById(docId);
    if (!doc) return null;
    docState.set(docId, {
      content: doc.content,
      version: doc.version,
      pendingOps: [],
    });
  }
  return docState.get(docId);
};

const persistDoc = async (docId, content, operation, userId) => {
  try {
    const doc = await Document.updateContent({ id: docId, content, userId });
    await Version.create({
      documentId: docId,
      versionNumber: doc.version,
      content,
      operation,
      createdBy: userId,
    });
  } catch (err) {
    console.error('Persist error:', err.message);
  }
};

// Debounce persist: only write to DB after 2s of inactivity per doc
const persistTimers = new Map();
const debouncePersist = (docId, content, operation, userId) => {
  if (persistTimers.has(docId)) clearTimeout(persistTimers.get(docId));
  persistTimers.set(
    docId,
    setTimeout(() => {
      persistDoc(docId, content, operation, userId);
      persistTimers.delete(docId);
    }, 2000)
  );
};

module.exports = (io) => {
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🔌 Socket connected: ${user.username} (${socket.id})`);

    // ── JOIN DOCUMENT ROOM ──
    socket.on('doc:join', async ({ docId }) => {
      try {
        const allowed = await Document.isOwnerOrCollaborator(docId, user.id);
        if (!allowed) {
          socket.emit('error', { message: 'Access denied to this document' });
          return;
        }

        socket.join(docId);
        socket.currentDocId = docId;

        // Load document state
        const state = await getDocState(docId);
        if (!state) {
          socket.emit('error', { message: 'Document not found' });
          return;
        }

        // Register presence
        await presenceService.userJoined(docId, user);
        const activeUsers = await presenceService.getActiveUsers(docId);

        // Send current document state to the joining client
        socket.emit('doc:init', {
          content: state.content,
          version: state.version,
          activeUsers,
        });

        // Notify others in the room
        socket.to(docId).emit('presence:joined', {
          user: { id: user.id, username: user.username },
          activeUsers,
        });

        console.log(`📄 ${user.username} joined doc ${docId}`);
      } catch (err) {
        console.error('doc:join error:', err.message);
        socket.emit('error', { message: err.message });
      }
    });

    // ── OPERATION (OT) ──
    socket.on('doc:operation', async ({ docId, operation, clientVersion }) => {
      try {
        const state = await getDocState(docId);
        if (!state) return;

        // Transform against any ops that happened since client's version
        let transformedOp = operation;
        if (clientVersion < state.version && state.pendingOps.length) {
          const opsToTransformAgainst = state.pendingOps.filter(
            (p) => p.version > clientVersion
          );
          for (const pending of opsToTransformAgainst) {
            transformedOp = transform(transformedOp, pending.op);
          }
        }

        // Apply to server state
        const newContent = applyOperation(state.content, transformedOp);
        state.version += 1;
        state.content = newContent;
        state.pendingOps.push({ op: transformedOp, version: state.version });

        // Keep pending ops buffer lean
        if (state.pendingOps.length > 100) {
          state.pendingOps = state.pendingOps.slice(-50);
        }

        // Ack to sender with transformed op + new version
        socket.emit('doc:ack', {
          operation: transformedOp,
          version: state.version,
        });

        // Broadcast transformed op to all other clients in room
        socket.to(docId).emit('doc:operation', {
          operation: transformedOp,
          version: state.version,
          userId: user.id,
          username: user.username,
        });

        // Debounced persist to DB
        debouncePersist(docId, newContent, transformedOp, user.id);
      } catch (err) {
        console.error('doc:operation error:', err.message);
      }
    });

    // ── CURSOR UPDATE ──
    socket.on('cursor:update', async ({ docId, cursor }) => {
      await presenceService.updateCursor(docId, user.id, cursor);
      socket.to(docId).emit('cursor:update', {
        userId: user.id,
        username: user.username,
        cursor,
      });
    });

    // ── TITLE UPDATE ──
    socket.on('doc:title', ({ docId, title }) => {
      socket.to(docId).emit('doc:title', { title, username: user.username });
    });

    // ── LEAVE DOCUMENT ──
    socket.on('doc:leave', async ({ docId }) => {
      await handleLeave(socket, docId);
    });

    // ── DISCONNECT ──
    socket.on('disconnect', async () => {
      console.log(`❌ Socket disconnected: ${user.username}`);
      if (socket.currentDocId) {
        await handleLeave(socket, socket.currentDocId);
      }
    });

    async function handleLeave(socket, docId) {
      socket.leave(docId);
      await presenceService.userLeft(docId, user.id);
      const activeUsers = await presenceService.getActiveUsers(docId);
      io.to(docId).emit('presence:left', {
        user: { id: user.id, username: user.username },
        activeUsers,
      });
    }
  });
};
