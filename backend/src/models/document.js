const { pool } = require('../../config/db');

const Document = {
  async create({ title, content = '', ownerId }) {
    const { rows } = await pool.query(
      `INSERT INTO documents (title, content, owner_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title, content, ownerId]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT d.*, u.username AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByUser(userId) {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.version, d.updated_at, u.username AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.owner_id = $1
       ORDER BY d.updated_at DESC`,
      [userId]
    );
    return rows;
  },

  async updateContent({ id, content, userId }) {
    const { rows } = await pool.query(
      `UPDATE documents
       SET content = $1, version = version + 1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [content, id]
    );
    return rows[0];
  },

  async updateTitle({ id, title }) {
    const { rows } = await pool.query(
      `UPDATE documents SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [title, id]
    );
    return rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);
  },

  async isOwnerOrCollaborator(docId, userId) {
    // Allow any authenticated user to join via shared URL
    const { rows } = await pool.query(
      `SELECT 1 FROM documents WHERE id = $1`,
      [docId]
    );
    return rows.length > 0;
  },
};

module.exports = Document;
