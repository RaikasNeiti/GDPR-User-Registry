const { Pool } = require('pg');

const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
});

async function cleanDatabase() {
  await testPool.query('DELETE FROM deletion_requests');
  await testPool.query('DELETE FROM consent_log');
  await testPool.query('DELETE FROM audit_log');
  await testPool.query('DELETE FROM users');
}

async function closeDatabase() {
  await testPool.end();
}

module.exports = { cleanDatabase, closeDatabase, testPool };