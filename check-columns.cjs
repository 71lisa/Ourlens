const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('Event', 'Package', 'PromotionSettings')
      AND column_name IN ('organizerName', 'guestCapacity', 'isUnlimited', 'updatedAt')
    ORDER BY table_name, column_name;
  `;

  console.table(rows);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
