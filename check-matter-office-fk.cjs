require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT
      con.conname AS constraint_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel
      ON rel.oid = con.conrelid
    WHERE rel.relname = 'matter'
      AND con.conname = 'matter_office_id_fkey'
  `);

  console.table(result);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
