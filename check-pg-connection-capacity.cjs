require("dotenv/config");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const result = await pool.query(`
    SELECT
      current_setting('max_connections') AS max_connections,
      current_setting('superuser_reserved_connections') AS superuser_reserved_connections,
      (SELECT count(*) FROM pg_stat_activity) AS current_connections
  `);

  console.table(result.rows);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
