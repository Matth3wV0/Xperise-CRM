import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create default admin user
  const adminPassword = await bcrypt.hash("admin123456", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@xperise.com" },
    update: {},
    create: {
      email: "admin@xperise.com",
      name: "Admin",
      passwordHash: adminPassword,
      role: "ADMIN",
      provider: "EMAIL",
    },
  });
  console.log(`Created admin: ${admin.email}`);

  // Create BD staff users (from Excel PICs)
  const staffPassword = await bcrypt.hash("xperise2024", 12);
  const pics = [
    { email: "duong@xperise.com", name: "Anh Dương", role: "MANAGER" as const },
    { email: "khai@xperise.com", name: "Anh Khải", role: "MANAGER" as const },
    { email: "tai@xperise.com", name: "Tài", role: "BD_STAFF" as const },
    { email: "kimy@xperise.com", name: "Kimy", role: "BD_STAFF" as const },
  ];

  for (const pic of pics) {
    const user = await prisma.user.upsert({
      where: { email: pic.email },
      update: {},
      create: {
        email: pic.email,
        name: pic.name,
        passwordHash: staffPassword,
        role: pic.role,
        provider: "EMAIL",
      },
    });
    console.log(`Created user: ${user.email} (${user.role})`);
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
