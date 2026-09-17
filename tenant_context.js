require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function withTenantTransaction(tenantId, work) {
  if (!tenantId || !/^[0-9a-fA-F-]{36}$/.test(tenantId)) {
    throw new Error("Invalid tenantId");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config(
        'app.current_tenant',
        ${tenantId},
        true
      )
    `;

    return work(tx);
  });
}

module.exports = {
  prisma,
  pool,
  withTenantTransaction,
};
