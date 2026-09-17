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
  const tenantId = '0ef44b3b-6fae-48db-ba82-06ae8110d06e';

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config(
        'app.current_tenant',
        ${tenantId}::text,
        true
      )
    `;

    return tx.$queryRaw`
      SELECT
        id::text AS office_id,
        tenant_id::text AS tenant_id,
        name::text AS office_name
      FROM office
      ORDER BY name ASC
    `;
  });

  console.log('TENANT A OFFICES — RLS CONTEXT:');
  console.table(result);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
