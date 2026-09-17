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

const TENANT_A = '0ef44b3b-6fae-48db-ba82-06ae8110d06e';
const OFFICE_ID = '0a5256b2-6039-459c-858a-6586c19215cd';

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config(
        'app.current_tenant',
        ${TENANT_A}::text,
        true
      )
    `;

    const office = await tx.office.findFirst({
      where: {
        id: OFFICE_ID,
        tenantId: TENANT_A,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
      },
    });

    const context = await tx.$queryRaw`
      SELECT current_setting(
        'app.current_tenant',
        true
      )::text AS current_tenant
    `;

    return { office, context };
  });

  console.log('=== PRISMA TENANT A OFFICE CHECK ===');
  console.log('Context:');
  console.table(result.context);

  console.log('Office:');
  console.table(result.office ? [result.office] : []);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
