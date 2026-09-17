require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await c.connect();

  const r = await c.query(
    'SELECT id, tenant_id, email, user_type, status FROM "user" ORDER BY id LIMIT 10'
  );

  console.table(r.rows);

  await c.end();
})().catch(e => {
  console.error('RESULT: FAIL');
  console.error(e.message);
  process.exit(1);
});
