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
    const forums = await prisma.courtForum.findMany({
      select: {
        id: true,
        name: true,
        regionId: true,
        forumTypeId: true,
      },
      orderBy: { name: "asc" },
    });

    console.log(JSON.stringify(forums, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
