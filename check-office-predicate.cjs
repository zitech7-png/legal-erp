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

    const result = await client.query(
      `
      SELECT
        o.id::text AS id,
        o.tenant_id::text AS tenant_id,
        o.name::text AS name,
        (o.id = $1::uuid) AS id_matches,
        (o.tenant_id = $2::uuid) AS tenant_matches,
        current_setting('app.current_tenant', true) AS current_tenant
      FROM office o
      WHERE o.tenant_id = $2::uuid
      ORDER BY o.name ASC
      `,
      [OFFICE_ID, TENANT_A],
    );

    console.log('=== OFFICE PREDICATE DIAGNOSTIC ===');
    console.table(result.rows);

    console.log('Requested OFFICE_ID:');
    console.log(OFFICE_ID);

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
