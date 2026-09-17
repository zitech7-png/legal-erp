require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const jurisdiction = await prisma.jurisdiction.upsert({
    where: { name: 'India' },
    update: {},
    create: { name: 'India' },
  });

  const region = await prisma.region.upsert({
    where: {
      jurisdictionId_name: {
        jurisdictionId: jurisdiction.id,
        name: 'Tamil Nadu',
      },
    },
    update: {},
    create: {
      jurisdictionId: jurisdiction.id,
      name: 'Tamil Nadu',
    },
  });

  const forumType = await prisma.forumType.upsert({
    where: { name: 'High Court' },
    update: {},
    create: { name: 'High Court' },
  });

  const caseType = await prisma.caseType.upsert({
    where: {
      forumTypeId_name: {
        forumTypeId: forumType.id,
        name: 'Civil',
      },
    },
    update: {},
    create: {
      forumTypeId: forumType.id,
      name: 'Civil',
    },
  });

  const courtForum = await prisma.courtForum.upsert({
    where: {
      regionId_forumTypeId_name: {
        regionId: region.id,
        forumTypeId: forumType.id,
        name: 'Test High Court',
      },
    },
    update: {},
    create: {
      regionId: region.id,
      forumTypeId: forumType.id,
      name: 'Test High Court',
    },
  });

  const bench = await prisma.bench.upsert({
    where: {
      courtForumId_name: {
        courtForumId: courtForum.id,
        name: 'Test Bench 1',
      },
    },
    update: {},
    create: {
      courtForumId: courtForum.id,
      name: 'Test Bench 1',
    },
  });

  console.log(JSON.stringify({
    jurisdiction,
    region,
    forumType,
    caseType,
    courtForum,
    bench,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
