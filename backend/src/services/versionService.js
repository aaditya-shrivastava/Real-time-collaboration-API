const { pool } = require('../../config/db');
const Version = require('../models/version');
const Document = require('../models/document');

const saveVersion = async ({ documentId, content, operation, userId }) => {
  const doc = await Document.findById(documentId);
  if (!doc) throw new Error('Document not found');

  const version = await Version.create({
    documentId,
    versionNumber: doc.version,
    content,
    operation,
    createdBy: userId,
  });

  // Keep only the latest 5 versions — delete the rest
  await pool.query(
    `DELETE FROM versions
     WHERE document_id = $1
       AND id NOT IN (
         SELECT id FROM versions
         WHERE document_id = $1
         ORDER BY version_number DESC
         LIMIT 5
       )`,
    [documentId]
  );

  return version;
};

module.exports = { saveVersion };