require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await c.connect();

    const r = await c.query(`
      SELECT tenant_id, feature_key, enabled, plan_tier
      FROM tenant_feature
      ORDER BY tenant_id, feature_key
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
