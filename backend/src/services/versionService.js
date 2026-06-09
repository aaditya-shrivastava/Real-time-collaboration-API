const Version = require('../models/version');
const Document = require('../models/document');

const saveVersion = async ({ documentId, content, operation, userId }) => {
  const doc = await Document.findById(documentId);
  if (!doc) throw new Error('Document not found');
  return Version.create({
    documentId,
    versionNumber: doc.version,
    content,
    operation,
    createdBy: userId,
  });
};

module.exports = { saveVersion };
