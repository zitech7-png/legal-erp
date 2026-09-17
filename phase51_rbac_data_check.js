require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();

    const r = await c.query(`
      SELECT
        (SELECT COUNT(*) FROM "permission") AS permissions,
        (SELECT COUNT(*) FROM "role") AS roles,
        (SELECT COUNT(*) FROM "role_permission") AS role_permissions,
        (SELECT COUNT(*) FROM "user_role") AS user_roles
    `);

    console.table(r.rows);
    console.log('RESULT: PASS');
  } catch (e) {
    console.error('RESULT: FAIL');
    console.error(e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
