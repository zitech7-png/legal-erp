require("dotenv/config");

const { randomUUID } = require("crypto");
const { prisma, pool, withTenantTransaction } = require("./tenant_context");

(async () => {
  const tenantId = randomUUID();

  const inside = await withTenantTransaction(tenantId, async (tx) => {
    const result = await tx.$queryRawUnsafe(
      "SELECT current_setting('app.current_tenant', true) AS tenant"
    );
    return result[0].tenant;
  });

  const outside = await prisma.$queryRawUnsafe(
    "SELECT current_setting('app.current_tenant', true) AS tenant"
  );

  console.log("TENANT CONTEXT TRANSACTION TEST");
  console.log("Inside transaction :", inside);
  console.log("After transaction  :", outside[0].tenant);
  console.log(
    inside === tenantId && outside[0].tenant === null
      ? "RESULT: PASS"
      : "RESULT: FAIL"
  );

  await prisma.$disconnect();
  await pool.end();
})().catch(async (error) => {
  console.error("RESULT: FAIL");
  console.error(error.message);
  process.exit(1);
});
