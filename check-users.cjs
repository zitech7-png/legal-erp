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
  const users = await prisma.user.findMany({
    select: {
      id: true,
      tenantId: true,
      email: true,
      fullName: true,
      userType: true,
      status: true,
      primaryOfficeId: true,
    },
  });

  console.table(users);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
