import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getAppEnvironment } from "./environment.server";

export function createPrismaClient() {
  if (getAppEnvironment() === "development") {
    return new PrismaClient({
      log: ["error"],
    });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for hosted Prisma.");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: ["error"],
  });
}

export async function withPrismaClient<T>(
  operation: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = createPrismaClient();

  try {
    return await operation(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
