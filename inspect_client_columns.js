require("dotenv/config");

const { Client } = require("pg");

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await c.connect();

  const r = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client' ORDER BY ordinal_position"
  );

  console.table(r.rows);

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
