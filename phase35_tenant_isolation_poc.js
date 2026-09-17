require("dotenv/config");

const { prisma, pool, withTenantTransaction } = require("./tenant_context");

const TENANT_A = "0ef44b3b-6fae-48db-ba82-06ae8110d06e";
const TENANT_B = "946bcdb1-5b18-4db7-80c1-4e483d2c75f5";

(async () => {
  let clientAId;
  let clientBId;

  try {
    const clientA = await withTenantTransaction(TENANT_A, async (tx) => {
      return tx.client.create({
        data: {
          tenantId: TENANT_A,
          clientType: "individual",
          displayName: "Phase35 Tenant A Test",
          normalizedName: "phase35 tenant a test",
          status: "active"
        }
      });
    });
    clientAId = clientA.id;

    const clientB = await withTenantTransaction(TENANT_B, async (tx) => {
      return tx.client.create({
        data: {
          tenantId: TENANT_B,
          clientType: "individual",
          displayName: "Phase35 Tenant B Test",
          normalizedName: "phase35 tenant b test",
          status: "active"
        }
      });
    });
    clientBId = clientB.id;

    const tenantAView = await withTenantTransaction(TENANT_A, async (tx) => {
      const rows = await tx.client.findMany({
        where: {
          displayName: {
            startsWith: "Phase35 Tenant"
          }
        },
        select: {
          id: true,
          tenantId: true,
          displayName: true
        }
      });

      const crossTenant = await tx.client.findUnique({
        where: { id: clientBId },
        select: {
          id: true,
          tenantId: true,
          displayName: true
        }
      });

      return { rows, crossTenant };
    });

    const tenantBView = await withTenantTransaction(TENANT_B, async (tx) => {
      return tx.client.findMany({
        where: {
          displayName: {
            startsWith: "Phase35 Tenant"
          }
        },
        select: {
          id: true,
          tenantId: true,
          displayName: true
        }
      });
    });

    console.log("=== PHASE 3.5 TENANT ISOLATION POC ===");
    console.log("Tenant A visible rows :", tenantAView.rows.length);
    console.log("Tenant A cross-access :", tenantAView.crossTenant === null ? "BLOCKED" : "VISIBLE");
    console.log("Tenant B visible rows :", tenantBView.length);

    const tenantAOnly =
      tenantAView.rows.length === 1 &&
      tenantAView.rows[0].tenantId === TENANT_A;

    const tenantBOnly =
      tenantBView.length === 1 &&
      tenantBView[0].tenantId === TENANT_B;

    const crossTenantBlocked =
      tenantAView.crossTenant === null;

    console.log(
      tenantAOnly && tenantBOnly && crossTenantBlocked
        ? "RESULT: PASS"
        : "RESULT: FAIL"
    );
  } finally {
    if (clientAId) {
      await withTenantTransaction(TENANT_A, async (tx) => {
        await tx.client.delete({ where: { id: clientAId } });
      });
    }

    if (clientBId) {
      await withTenantTransaction(TENANT_B, async (tx) => {
        await tx.client.delete({ where: { id: clientBId } });
      });
    }

    await prisma.$disconnect();
    await pool.end();
  }
})().catch((error) => {
  console.error("RESULT: FAIL");
  console.error(error.message);
  process.exit(1);
});
