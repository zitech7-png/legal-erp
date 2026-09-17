require('dotenv/config');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const TENANT_A = '0ef44b3b-6fae-48db-ba82-06ae8110d06e';
const OFFICE_ID = '0a5256b2-6039-459c-9588-6586c19215cd';

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `SELECT set_config('app.current_tenant', $1, true)`,
      [TENANT_A],
    );

    const context = await client.query(`
      SELECT current_setting(
        'app.current_tenant',
        true
      ) AS current_tenant
    `);

    const exact = await client.query(
      `
      SELECT
        id::text AS id,
        tenant_id::text AS tenant_id,
        name::text AS name
      FROM office
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      `,
      [OFFICE_ID, TENANT_A],
    );

    const byTenant = await client.query(
      `
      SELECT
        id::text AS id,
        tenant_id::text AS tenant_id,
        name::text AS name
      FROM office
      WHERE tenant_id = $1::uuid
      ORDER BY name ASC
      `,
      [TENANT_A],
    );

    console.log('=== RAW SQL OFFICE DIAGNOSTIC ===');

    console.log('Context:');
    console.table(context.rows);

    console.log('Exact office query:');
    console.table(exact.rows);

    console.log('Tenant A office query:');
    console.table(byTenant.rows);

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
