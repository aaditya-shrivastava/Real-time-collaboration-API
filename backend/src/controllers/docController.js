const Document = require('../models/document');
const Version = require('../models/version');

const createDocument = async (req, res, next) => {
  try {
    const { title = 'Untitled Document', content = '' } = req.body;
    const doc = await Document.create({ title, content, ownerId: req.user.id });
    // Save initial version
    await Version.create({
      documentId: doc.id,
      versionNumber: 1,
      content: doc.content,
      operation: { type: 'init' },
      createdBy: req.user.id,
    });
    res.status(201).json({ document: doc });
  } catch (err) {
    next(err);
  }
};

const getDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const allowed = await Document.isOwnerOrCollaborator(doc.id, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
};

const listDocuments = async (req, res, next) => {
  try {
    const docs = await Document.findByUser(req.user.id);
    res.json({ documents: docs });
  } catch (err) {
    next(err);
  }
};

const updateDocument = async (req, res, next) => {
  try {
    const { content, title } = req.body;
    const existing = await Document.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const allowed = await Document.isOwnerOrCollaborator(existing.id, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    let doc = existing;
    if (content !== undefined) {
      doc = await Document.updateContent({ id: existing.id, content, userId: req.user.id });
      await Version.create({
        documentId: doc.id,
        versionNumber: doc.version,
        content: doc.content,
        operation: { type: 'update', source: 'http' },
        createdBy: req.user.id,
      });
    }
    if (title !== undefined) {
      doc = await Document.updateTitle({ id: existing.id, title });
    }
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
};

const deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Only owner can delete' });
    await Document.delete(req.params.id);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createDocument, getDocument, listDocuments, updateDocument, deleteDocument };
