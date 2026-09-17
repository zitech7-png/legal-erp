const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await client.connect();

  const result = await client.query(`
    SELECT
      rolname,
      rolsuper,
      rolcreatedb,
      rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('postgres', 'app_user', 'user')
    ORDER BY rolname;
  `);

  console.table(result.rows);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
