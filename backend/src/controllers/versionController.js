const Version = require('../models/version');
const Document = require('../models/document');

const getVersions = async (req, res, next) => {
  try {
    const { docId } = req.params;
    const allowed = await Document.isOwnerOrCollaborator(docId, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const versions = await Version.findByDocument(docId);
    res.json({ versions });
  } catch (err) {
    next(err);
  }
};

const rollback = async (req, res, next) => {
  try {
    const { docId, versionNumber } = req.params;
    const allowed = await Document.isOwnerOrCollaborator(docId, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const target = await Version.findByVersion(docId, parseInt(versionNumber));
    if (!target) return res.status(404).json({ error: 'Version not found' });

    const updated = await Document.updateContent({
      id: docId,
      content: target.content,
      userId: req.user.id,
    });

    await Version.create({
      documentId: docId,
      versionNumber: updated.version,
      content: target.content,
      operation: { type: 'rollback', rolledBackTo: parseInt(versionNumber) },
      createdBy: req.user.id,
    });

    res.json({ document: updated, rolledBackTo: parseInt(versionNumber) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getVersions, rollback };
