const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await client.connect();

  const result = await client.query(`
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS return_type,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname ILIKE '%tenant%'
        OR p.proname ILIKE '%rls%'
        OR p.proname ILIKE '%context%'
      )
    ORDER BY p.proname;
  `);

  for (const row of result.rows) {
    console.log("\\n========================================");
    console.log(`${row.schema_name}.${row.function_name}(${row.arguments})`);
    console.log("========================================");
    console.log(row.definition);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
