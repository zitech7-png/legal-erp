const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== NEGATIVE RLS MUTATION TEST ===");

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

  const emailA = `rls-negative-a-${suffix}@example.test`;
  const emailB = `rls-negative-b-${suffix}@example.test`;

  console.log("Tenant A:", tenantA);
  console.log("Tenant B:", tenantB);

  try {
    // --------------------------------------------------
    // 1. Create legitimate Tenant B test row
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
        INSERT INTO public."user"
          (tenant_id, email, password_hash, user_type, full_name, status)
        VALUES
          (
            ${tenantB},
            ${emailB},
            'TEST_ONLY',
            'staff',
            'Negative RLS User B',
            'active'
          )
      `;
    });

    console.log("\nTenant B test row created.");

    // --------------------------------------------------
    // 2. Tenant A attempts cross-tenant INSERT
    // --------------------------------------------------
    let insertBlocked = false;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT set_config(
            'app.current_tenant',
            ${tenantA}::text,
            true
          )
        `;

        await tx.$executeRaw`
          INSERT INTO public."user"
            (tenant_id, email, password_hash, user_type, full_name, status)
          VALUES
            (
              ${tenantB},
              ${emailA},
              'TEST_ONLY',
              'staff',
              'Illegal Cross Tenant User',
              'active'
            )
        `;
      });
    } catch (error) {
      insertBlocked = true;
      console.log("\nCross-tenant INSERT blocked: YES");
      console.log("Expected error code:", error.code || "SQL");
    }

    if (!insertBlocked) {
      throw new Error("RLS FAILURE: Cross-tenant INSERT was allowed.");
    }

    // --------------------------------------------------
    // 3. Tenant A attempts UPDATE of Tenant B row
    // --------------------------------------------------
    const updateResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantA}::text,
          true
        )
      `;

      return await tx.$executeRaw`
        UPDATE public."user"
        SET full_name = 'ILLEGAL UPDATE'
        WHERE email = ${emailB}
      `;
    });

    console.log("\nCross-tenant UPDATE result:", updateResult);

    if (Number(updateResult) !== 0) {
      throw new Error("RLS FAILURE: Cross-tenant UPDATE affected a row.");
    }

    // --------------------------------------------------
    // 4. Tenant A attempts DELETE of Tenant B row
    // --------------------------------------------------
    const deleteResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantA}::text,
          true
        )
      `;

      return await tx.$executeRaw`
        DELETE FROM public."user"
        WHERE email = ${emailB}
      `;
    });

    console.log("\nCross-tenant DELETE result:", deleteResult);

    if (Number(deleteResult) !== 0) {
      throw new Error("RLS FAILURE: Cross-tenant DELETE affected a row.");
    }

    // --------------------------------------------------
    // 5. Tenant B verifies its own row still exists
    // --------------------------------------------------
    const verification = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantB}::text,
          true
        )
      `;

      return await tx.$queryRaw`
        SELECT id, tenant_id, email, full_name
        FROM public."user"
        WHERE email = ${emailB}
      `;
    });

    console.log("\nTenant B verification:");
    console.table(verification);

    if (
      verification.length !== 1 ||
      verification[0].tenant_id !== tenantB ||
      verification[0].full_name === "ILLEGAL UPDATE"
    ) {
      throw new Error(
        "RLS FAILURE: Tenant B test row was modified or removed."
      );
    }

    console.log("\n=== RESULT: NEGATIVE RLS TEST PASSED ===");

  } finally {
    // --------------------------------------------------
    // Cleanup Tenant B test row
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

    // Cleanup any accidentally created A row
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

    console.log("\nTemporary negative-test data cleaned up.");
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