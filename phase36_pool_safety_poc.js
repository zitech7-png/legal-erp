require("dotenv/config");

const { randomUUID } = require("crypto");
const { prisma, pool, withTenantTransaction } = require("./tenant_context");

(async () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  const results = [];

  for (let i = 1; i <= 10; i++) {
    const a = await withTenantTransaction(tenantA, async (tx) => {
      const r = await tx.$queryRawUnsafe(
        "SELECT current_setting('app.current_tenant', true) AS tenant"
      );
      return r[0].tenant;
    });

    const b = await withTenantTransaction(tenantB, async (tx) => {
      const r = await tx.$queryRawUnsafe(
        "SELECT current_setting('app.current_tenant', true) AS tenant"
      );
      return r[0].tenant;
    });

    results.push({
      iteration: i,
      tenantA: a,
      tenantB: b,
      pass: a === tenantA && b === tenantB
    });
  }

  const outside = await prisma.$queryRawUnsafe(
    "SELECT current_setting('app.current_tenant', true) AS tenant"
  );

  const allPassed = results.every(r => r.pass);
  const outsideClean = outside[0].tenant === "";

  console.log("=== PHASE 3.6 CONNECTION-POOL SAFETY POC ===");
  console.log("Transactions tested :", results.length);
  console.log("All tenant contexts :", allPassed ? "CORRECT" : "FAILED");
  console.log("Outside transaction :", JSON.stringify(outside[0].tenant));
  console.log("Pool context clean  :", outsideClean ? "YES" : "NO");
  console.log("RESULT:", allPassed && outsideClean ? "PASS" : "FAIL");

  await prisma.$disconnect();
  await pool.end();
})().catch((error) => {
  console.error("RESULT: FAIL");
  console.error(error.message);
  process.exit(1);
});
