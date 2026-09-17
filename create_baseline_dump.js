const { spawnSync } = require("child_process");

const pgDump = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe";
const output = process.argv[2];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not loaded.");
  process.exit(1);
}

console.log("Using DATABASE_URL from .env");
console.log("Starting PostgreSQL baseline backup...");

const result = spawnSync(
  pgDump,
  [
    "--dbname=" + process.env.DATABASE_URL,
    "--format=custom",
    "--file=" + output
  ],
  {
    stdio: "inherit"
  }
);

if (result.error) {
  console.error("pg_dump failed to start:", result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("pg_dump exited with code:", result.status);
  process.exit(result.status);
}

console.log("PostgreSQL baseline backup completed successfully.");
console.log("Backup:", output);
