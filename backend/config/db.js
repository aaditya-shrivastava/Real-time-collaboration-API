const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL DEFAULT 'Untitled Document',
        content TEXT NOT NULL DEFAULT '',
        owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS document_collaborators (
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'editor',
        PRIMARY KEY (document_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        operation JSONB,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_versions_doc_id ON versions(document_id);
      CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
    `);
    console.log('✅ Database schema initialized');
  } catch (err) {
    console.error('❌ Schema init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, initSchema };
