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
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      subdomain: true,
    },
    orderBy: {
      subdomain: 'asc',
    },
  });

  for (const tenant of tenants) {
    const counts = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenant.id}::text,
          true
        )
      `;

      const clients = await tx.client.count();
      const users = await tx.user.count();
      const matters = await tx.matter.count();
      const proceedings = await tx.proceeding.count();

      return {
        clients,
        users,
        matters,
        proceedings,
      };
    });

    console.log(`TENANT: ${tenant.subdomain} (${tenant.name})`);
    console.table([counts]);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
