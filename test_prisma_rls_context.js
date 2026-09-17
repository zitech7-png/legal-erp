const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== PRISMA 7 + RLS TENANT CONTEXT TEST ===");

  const tenants = await prisma.$queryRaw`
    SELECT id, name
    FROM public.tenant
    ORDER BY created_at
    LIMIT 2
  `;

  if (tenants.length < 2) {
    throw new Error("Need at least 2 tenants for this test.");
  }

  const tenantA = tenants[0].id;
  const tenantB = tenants[1].id;

  console.log("Tenant A:", tenantA);
  console.log("Tenant B:", tenantB);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config('app.current_tenant', ${tenantA}::text, true)
    `;

    const rows = await tx.$queryRaw`
      SELECT id, tenant_id
      FROM public.user
      ORDER BY id
    `;

    console.log("\nTenant A visible rows:");
    console.table(rows);

    if (!rows.every((row) => row.tenant_id === tenantA)) {
      throw new Error("RLS FAILURE: Tenant A saw another tenant's row.");
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config('app.current_tenant', ${tenantB}::text, true)
    `;

    const rows = await tx.$queryRaw`
      SELECT id, tenant_id
      FROM public.user
      ORDER BY id
    `;

    console.log("\nTenant B visible rows:");
    console.table(rows);

    if (!rows.every((row) => row.tenant_id === tenantB)) {
      throw new Error("RLS FAILURE: Tenant B saw another tenant's row.");
    }
  });

  const noContext = await prisma.$queryRaw`
    SELECT id, tenant_id
    FROM public.user
    ORDER BY id
  `;

  console.log("\nNo tenant context rows:");
  console.table(noContext);

  if (noContext.length !== 0) {
    throw new Error("RLS FAILURE: no-context query returned rows.");
  }

  console.log("\n=== RESULT: PRISMA 7 + RLS TEST PASSED ===");
}

main()
  .catch((error) => {
    console.error("\n=== TEST FAILED ===");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
