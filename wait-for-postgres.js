const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL ||
  `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'example'}@${process.env.PGHOST || 'db'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'gdpr'}`;

const maxAttempts = parseInt(process.env.DB_WAIT_ATTEMPTS || '60', 10);
const delayMs = parseInt(process.env.DB_WAIT_DELAY_MS || '1000', 10);

let attempt = 0;

async function check() {
  attempt += 1;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.end();
    console.log('Postgres is available');
    process.exit(0);
  } catch (err) {
    console.log(`Postgres not ready (attempt ${attempt}/${maxAttempts}): ${err.message}`);
    if (attempt >= maxAttempts) {
      console.error('Exceeded max attempts waiting for Postgres');
      process.exit(1);
    }
    setTimeout(check, delayMs);
  }
}

check();
