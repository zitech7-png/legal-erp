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
        o.id::text AS db_id,
        length(o.id::text) AS db_id_length,
        pg_typeof(o.id)::text AS db_id_type,
        $1::text AS requested_id,
        length($1::text) AS requested_id_length,
        pg_typeof($1::uuid)::text AS requested_id_type,
        (o.id::text = $1::text) AS text_matches,
        (o.id = $1::uuid) AS uuid_matches,
        encode(o.id::text::bytea, 'hex') AS db_id_hex,
        encode($1::text::bytea, 'hex') AS requested_id_hex
      FROM office o
      WHERE o.tenant_id = $2::uuid
      ORDER BY o.name ASC
      `,
      [OFFICE_ID, TENANT_A],
    );

    console.log('=== UUID EXACT-VALUE DIAGNOSTIC ===');
    console.table(result.rows);

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
