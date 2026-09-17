const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const tables = [
  "assignment",
  "audit_log",
  "client",
  "client_contact",
  "conflict_check",
  "conflict_match",
  "contact",
  "matter",
  "matter_participant",
  "office",
  "proceeding",
  "proceeding_status_history",
  "role",
  "role_permission",
  "tenant_case_type",
  "tenant_feature",
  "user",
  "user_role"
];

async function main() {
  await client.connect();

  const result = await client.query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      p.polname AS policy_name,
      p.polpermissive AS permissive,
      p.polcmd AS command,
      pg_get_expr(p.polqual, p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p
      ON p.polrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = ANY($1)
    ORDER BY c.relname, p.polname;
  `, [tables]);

  console.table(result.rows);

  console.log("\n=== FINAL RLS POLICY COUNTS ===\n");

  const summary = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled_count,
      COUNT(*) FILTER (WHERE c.relforcerowsecurity) AS rls_forced_count,
      COUNT(p.polname) AS policy_count,
      COUNT(DISTINCT c.relname) FILTER (WHERE p.polname IS NOT NULL) AS tables_with_policy
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p
      ON p.polrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = ANY($1);
  `, [tables]);

  console.table(summary.rows);
}

main()
  .catch(error => {
    console.error("\nFINAL RLS AUDIT FAILED:\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
