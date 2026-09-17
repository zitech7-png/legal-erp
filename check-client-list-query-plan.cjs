require("dotenv/config");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const tenantId = "0ef44b3b-6fae-48db-ba82-06ae8110d06e";

  await pool.query(
    "SELECT set_config('app.current_tenant', $1, true)",
    [tenantId]
  );

  const result = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT
      id,
      tenant_id,
      client_type,
      display_name,
      normalized_name,
      billing_contact_id,
      status,
      created_at,
      updated_at
    FROM client
    WHERE tenant_id = '${tenantId}'
    ORDER BY created_at DESC;
  `);

  console.log("=== CLIENT LIST QUERY PLAN ===");
  console.log(result.rows.map(r => r["QUERY PLAN"]).join("\n"));
}

main()
  .catch(console.error)
  .finally(() => pool.end());
