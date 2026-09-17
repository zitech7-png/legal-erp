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
  const result = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "client") AS client_count,
      (SELECT COUNT(*) FROM "user") AS user_count,
      (SELECT COUNT(*) FROM "tenant") AS tenant_count,
      (SELECT COUNT(*) FROM "matter") AS matter_count,
      (SELECT COUNT(*) FROM "proceeding") AS proceeding_count
  `;

  console.table(result);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
