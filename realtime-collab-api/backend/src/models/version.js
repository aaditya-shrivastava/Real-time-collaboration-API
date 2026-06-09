const { pool } = require('../../config/db');

const Version = {
  async create({ documentId, versionNumber, content, operation, createdBy }) {
    const { rows } = await pool.query(
      `INSERT INTO versions (document_id, version_number, content, operation, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [documentId, versionNumber, content, JSON.stringify(operation), createdBy]
    );
    return rows[0];
  },

  async findByDocument(documentId, limit = 50) {
    const { rows } = await pool.query(
      `SELECT v.*, u.username AS author
       FROM versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.document_id = $1
       ORDER BY v.version_number DESC
       LIMIT $2`,
      [documentId, limit]
    );
    return rows;
  },

  async findByVersion(documentId, versionNumber) {
    const { rows } = await pool.query(
      `SELECT * FROM versions WHERE document_id = $1 AND version_number = $2`,
      [documentId, versionNumber]
    );
    return rows[0] || null;
  },
};

module.exports = Version;
