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
  const tenant = await prisma.tenant.findUnique({
    where: {
      subdomain: 'tenant-a',
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
    },
  });

  if (!tenant) {
    throw new Error('Tenant tenant-a not found');
  }

  const offices = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config(
        'app.current_tenant',
        ${tenant.id}::text,
        true
      )
    `;

    return tx.office.findMany({
      where: {
        tenantId: tenant.id,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  });

  console.log('TENANT A OFFICES:');
  console.table(offices);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
