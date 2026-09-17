const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const tables = [
  "assignment",
  "client",
  "client_contact",
  "conflict_check",
  "conflict_match",
  "matter",
  "matter_participant",
  "proceeding",
  "proceeding_status_history",
  "user"
];

async function main() {
  await client.connect();

  console.log("\n=== CHECK CONSTRAINT AUDIT ===\n");

  const checks = await client.query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c
      ON c.oid = con.conrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND con.contype = 'c'
      AND c.relname = ANY($1)
    ORDER BY c.relname, con.conname;
  `, [tables]);

  if (checks.rows.length === 0) {
    console.log("NO CHECK CONSTRAINTS FOUND.");
  } else {
    console.table(checks.rows);
  }

  console.log("\n=== TRIGGER AUDIT ===\n");

  const triggers = await client.query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      t.tgname AS trigger_name,
      pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c
      ON c.oid = t.tgrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND c.relname = ANY($1)
    ORDER BY c.relname, t.tgname;
  `, [tables]);

  if (triggers.rows.length === 0) {
    console.log("NO USER TRIGGERS FOUND.");
  } else {
    console.table(triggers.rows);
  }

  console.log("\n=== CONSTRAINT + TRIGGER COUNTS ===\n");
  console.log(`CHECK constraints found: ${checks.rows.length}`);
  console.log(`Triggers found: ${triggers.rows.length}`);
}

main()
  .catch(error => {
    console.error("\nAUDIT FAILED:\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
