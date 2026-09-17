require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await c.connect();

  const r = await c.query(
    'SELECT id, name, subdomain, status FROM tenant WHERE subdomain = $1',
    ['does-not-exist']
  );

  console.log('Unknown subdomain rows:', r.rows.length);
  console.log(r.rows.length === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');

  await c.end();
})().catch(e => {
  console.error('RESULT: FAIL');
  console.error(e.message);
  process.exit(1);
});
