require("dotenv/config");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      SELECT set_config(
        'app.current_tenant',
        '0ef44b3b-6fae-48db-ba82-06ae8110d06e',
        true
      )
    `);

    const result = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT
        id,
        tenant_id,
        email,
        full_name,
        user_type,
        status,
        primary_office_id,
        created_at
      FROM "user"
      WHERE tenant_id =
        current_setting('app.current_tenant', true)::uuid
      ORDER BY created_at DESC;
    `);

    console.log("=== USER LIST QUERY PLAN ===");
    console.log(result.rows.map(r => r["QUERY PLAN"]).join("\n"));

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
