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
  const result = await prisma.$queryRawUnsafe(`
    SELECT
      o.id::text AS id,
      o.tenant_id::text AS tenant_id,
      o.name::text AS name,
      current_setting('app.current_tenant', true)::text AS current_tenant
    FROM office o
    WHERE o.id = '0a5256b2-6039-459c-9588-6586c19215cd'::uuid
  `);

  console.log('OFFICE ROW:');
  console.table(result);

  const policies = await prisma.$queryRawUnsafe(`
    SELECT
      schemaname::text,
      tablename::text,
      policyname::text,
      permissive::text,
      array_to_string(roles, ',') AS roles,
      cmd::text,
      COALESCE(qual::text, '') AS qual,
      COALESCE(with_check::text, '') AS with_check
    FROM pg_policies
    WHERE tablename = 'office'
  `);

  console.log('OFFICE RLS POLICIES:');
  console.table(policies);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
