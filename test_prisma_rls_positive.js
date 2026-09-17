const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== POSITIVE RLS TENANT ISOLATION TEST ===");

  const tenants = await prisma.$queryRaw`
    SELECT id, name
    FROM public.tenant
    ORDER BY created_at
    LIMIT 2
  `;

  if (tenants.length < 2) {
    throw new Error("Need at least 2 tenants.");
  }

  const tenantA = tenants[0].id;
  const tenantB = tenants[1].id;
  const suffix = Date.now();

  const emailA = `rls-test-a-${suffix}@example.test`;
  const emailB = `rls-test-b-${suffix}@example.test`;

  console.log("Tenant A:", tenantA);
  console.log("Tenant B:", tenantB);

  try {
    // --------------------------------------------------
    // 1. Create Tenant A test user WITH Tenant A context
    // --------------------------------------------------
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantA}::text,
          true
        )
      `;

      const result = await tx.$queryRaw`
        INSERT INTO public."user"
          (tenant_id, email, password_hash, user_type, full_name, status)
        VALUES
          (
            ${tenantA},
            ${emailA},
            'TEST_ONLY',
            'staff',
            'RLS Test User A',
            'active'
          )
        RETURNING id, tenant_id, email, full_name
      `;

      console.log("\nCreated Tenant A user:");
      console.table(result);
    });

    // --------------------------------------------------
    // 2. Tenant A must see ONLY Tenant A test user
    // --------------------------------------------------
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantA}::text,
          true
        )
      `;

      const rows = await tx.$queryRaw`
        SELECT id, tenant_id, email, full_name
        FROM public."user"
        WHERE email LIKE 'rls-test-%@example.test'
        ORDER BY email
      `;

      console.log("\nTenant A sees:");
      console.table(rows);

      if (
        rows.length !== 1 ||
        rows[0].tenant_id !== tenantA
      ) {
        throw new Error(
          "RLS FAILURE: Tenant A did not see exactly its own test row."
        );
      }
    });

    // --------------------------------------------------
    // 3. Create Tenant B test user WITH Tenant B context
    // --------------------------------------------------
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantB}::text,
          true
        )
      `;

      const result = await tx.$queryRaw`
        INSERT INTO public."user"
          (tenant_id, email, password_hash, user_type, full_name, status)
        VALUES
          (
            ${tenantB},
            ${emailB},
            'TEST_ONLY',
            'staff',
            'RLS Test User B',
            'active'
          )
        RETURNING id, tenant_id, email, full_name
      `;

      console.log("\nCreated Tenant B user:");
      console.table(result);
    });

    // --------------------------------------------------
    // 4. Tenant B must see ONLY Tenant B test user
    // --------------------------------------------------
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantB}::text,
          true
        )
      `;

      const rows = await tx.$queryRaw`
        SELECT id, tenant_id, email, full_name
        FROM public."user"
        WHERE email LIKE 'rls-test-%@example.test'
        ORDER BY email
      `;

      console.log("\nTenant B sees:");
      console.table(rows);

      if (
        rows.length !== 1 ||
        rows[0].tenant_id !== tenantB
      ) {
        throw new Error(
          "RLS FAILURE: Tenant B did not see exactly its own test row."
        );
      }
    });

    // --------------------------------------------------
    // 5. No tenant context must see ZERO test rows
    // --------------------------------------------------
    const noContext = await prisma.$queryRaw`
      SELECT id, tenant_id, email, full_name
      FROM public."user"
      WHERE email LIKE 'rls-test-%@example.test'
      ORDER BY email
    `;

    console.log("\nNo tenant context sees:");
    console.table(noContext);

    if (noContext.length !== 0) {
      throw new Error(
        "RLS FAILURE: No-context query returned test rows."
      );
    }

    console.log("\n=== RESULT: POSITIVE RLS TEST PASSED ===");

  } finally {
    // --------------------------------------------------
    // 6. Cleanup Tenant A row using Tenant A context
    // --------------------------------------------------
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantA}::text,
          true
        )
      `;

      await tx.$executeRaw`
        DELETE FROM public."user"
        WHERE email = ${emailA}
      `;
    });

    // --------------------------------------------------
    // 7. Cleanup Tenant B row using Tenant B context
    // --------------------------------------------------
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantB}::text,
          true
        )
      `;

      await tx.$executeRaw`
        DELETE FROM public."user"
        WHERE email = ${emailB}
      `;
    });

    console.log("\nTemporary RLS test users cleaned up.");
  }
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