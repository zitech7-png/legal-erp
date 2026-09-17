require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const courtForum = await prisma.courtForum.findUnique({
    where: { id: '2d823558-6c86-4324-a67b-cbc302b78063' },
    select: {
      id: true,
      name: true,
      forumTypeId: true,
    },
  });

  const caseType = await prisma.caseType.findUnique({
    where: { id: '369cdfbf-399a-4345-97de-e120192cd405' },
    select: {
      id: true,
      name: true,
      forumTypeId: true,
    },
  });

  console.log(JSON.stringify({ courtForum, caseType }, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
