require("dotenv/config");

const { prisma, pool, withTenantTransaction } = require("./tenant_context");

async function runDbAccessPoc() {
  const tenantId = "5be29433-0a4c-4c6c-be4e-bff9cd633622";

  const result = await withTenantTransaction(tenantId, async (tx) => {
    return tx.$queryRawUnsafe(`
      SELECT
        current_setting('app.current_tenant', true) AS tenant_context,
        current_database() AS database_name,
        current_user AS database_user
    `);
  });

  console.log("=== PHASE 3.4 DB ACCESS POC ===");
  console.log("Tenant context :", result[0].tenant_context);
  console.log("Database       :", result[0].database_name);
  console.log("Database user  :", result[0].database_user);

  if (
    result[0].tenant_context === tenantId &&
    result[0].database_name === "legal_erp_dev" &&
    result[0].database_user === "app_user"
  ) {
    console.log("RESULT: PASS");
  } else {
    console.log("RESULT: FAIL");
  }

  await prisma.$disconnect();
  await pool.end();
}

runDbAccessPoc().catch((error) => {
  console.error("RESULT: FAIL");
  console.error(error.message);
  process.exit(1);
});
