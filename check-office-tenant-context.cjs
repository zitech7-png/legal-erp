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
  const officeId = '0a5256b2-6039-459c-8588-6586c19215cd';

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
        current_database()::text AS database_name,
        current_setting('app.current_tenant', true)::text AS current_tenant,
        o.id::text AS office_id,
        o.tenant_id::text AS office_tenant_id,
        o.name::text AS office_name
      FROM office o
      WHERE o.id = ${officeId}::uuid
    `;
  });

  console.log('OFFICE CHECK INSIDE TENANT CONTEXT:');
  console.table(result);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
