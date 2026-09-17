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

const permissions = [
  {
    key: 'matter.read',
    description: 'Read matters',
    category: 'matter',
  },
  {
    key: 'matter.write',
    description: 'Create and update matters',
    category: 'matter',
  },
  {
    key: 'client.write',
    description: 'Create and update clients',
    category: 'client',
  },
  {
    key: 'trust.release_funds',
    description: 'Release trust funds',
    category: 'trust',
  },
  {
    key: 'billing.write_off',
    description: 'Write off billing amounts',
    category: 'billing',
  },
  {
    key: 'document.delete',
    description: 'Delete documents',
    category: 'document',
  },
  {
    key: 'user.manage_roles',
    description: 'Manage user role assignments',
    category: 'user',
  },
];

async function main() {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: {
        key: permission.key,
      },
      update: {
        description: permission.description,
        category: permission.category,
      },
      create: permission,
    });
  }

  console.log('Permission seed completed.');
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