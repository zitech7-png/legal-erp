require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const rows = await prisma.matter.findMany({
    select: {
      id: true,
      tenantId: true,
      matterNumber: true,
      title: true,
      clientId: true,
      officeId: true,
      status: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
