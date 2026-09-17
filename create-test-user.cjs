require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const argon2 = require('argon2');

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
      status: true,
    },
  });

  if (!tenant) {
    throw new Error('Tenant tenant-a not found');
  }

  const passwordHash = await argon2.hash('Test12345');

  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config(
        'app.current_tenant',
        ${tenant.id}::text,
        true
      )
    `;

    return tx.user.create({
      data: {
        tenantId: tenant.id,
        email: 'test@tenant-a.local',
        passwordHash,
        userType: 'staff',
        fullName: 'Test User',
        status: 'active',
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        fullName: true,
        userType: true,
        status: true,
      },
    });
  });

  console.log('TEST USER CREATED');
  console.table([user]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
