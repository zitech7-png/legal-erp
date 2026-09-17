require("dotenv/config");

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const [regions, forumTypes, caseTypes] = await Promise.all([
      prisma.region.findMany({
        select: { id: true, name: true, jurisdictionId: true },
      }),
      prisma.forumType.findMany({
        select: { id: true, name: true },
      }),
      prisma.caseType.findMany({
        select: { id: true, name: true, forumTypeId: true },
      }),
    ]);

    console.log("REGIONS");
    console.log(JSON.stringify(regions, null, 2));

    console.log("FORUM_TYPES");
    console.log(JSON.stringify(forumTypes, null, 2));

    console.log("CASE_TYPES");
    console.log(JSON.stringify(caseTypes, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
