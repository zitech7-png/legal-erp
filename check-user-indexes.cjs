require("dotenv/config");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const result = await pool.query(`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'user'
    ORDER BY indexname;
  `);

  console.log("=== USER TABLE INDEXES ===");
  console.table(result.rows);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
