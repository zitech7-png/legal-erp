require('dotenv/config');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const TENANT_A = '0ef44b3b-6fae-48db-ba82-06ae8110d06e';
const TENANT_B = '946bcdb1-5b18-4db7-80c1-4e483d2c75f5';

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `SELECT set_config('app.current_tenant', $1, true)`,
      [TENANT_B],
    );

    const result = await client.query(`
      SELECT
        id,
        tenant_id,
        display_name
      FROM "client"
      WHERE tenant_id = $1::uuid
      ORDER BY created_at ASC
    `, [TENANT_A]);

    console.log('=== CROSS-TENANT RLS TEST ===');
    console.log('Current tenant context: TENANT B');
    console.log('Requested tenant data: TENANT A');
    console.log('');

    console.log('Rows returned:', result.rows.length);
    console.table(result.rows);

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
