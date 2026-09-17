const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await client.connect();

  const result = await client.query(`
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'assignment',
        'audit_log',
        'client',
        'client_contact',
        'conflict_check',
        'conflict_match',
        'contact',
        'matter',
        'matter_participant',
        'office',
        'proceeding',
        'proceeding_status_history',
        'role',
        'role_permission',
        'tenant_case_type',
        'tenant_feature',
        'user',
        'user_role'
      )
    ORDER BY tablename, policyname;
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
