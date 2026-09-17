require('dotenv/config');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `SELECT set_config(
        'app.current_tenant',
        '0ef44b3b-6fae-48db-ba82-06ae8110d06e',
        true
      )`,
    );

    const result = await client.query(`
      SELECT
        o.id::text AS db_id,
        '0a5256b2-6039-459c-9588-6586c19215cd' AS literal_id,
        (o.id = '0a5256b2-6039-459c-9588-6586c19215cd'::uuid) AS literal_uuid_match,
        (o.id::text = '0a5256b2-6039-459c-9588-6586c19215cd') AS literal_text_match,
        encode(uuid_send(o.id), 'hex') AS db_uuid_hex,
        encode(uuid_send('0a5256b2-6039-459c-9588-6586c19215cd'::uuid), 'hex') AS literal_uuid_hex
      FROM office o
      WHERE o.tenant_id =
        '0ef44b3b-6fae-48db-ba82-06ae8110d06e'::uuid
      ORDER BY o.name ASC
    `);

    console.log('=== DIRECT POSTGRES UUID TEST ===');
    console.table(result.rows);

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
