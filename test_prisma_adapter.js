const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.$queryRaw`SELECT 1 AS ok`;

    console.log("=== PRISMA 7 ADAPTER SMOKE TEST ===");
    console.log(result);
    console.log("PrismaPg adapter connection: SUCCESS");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("PrismaPg adapter test FAILED:");
  console.error(error);
  process.exitCode = 1;
});
