import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { createPrismaClient } from "./db.server";

const storageOptions = {
  connectionRetries: 1,
  connectionRetryIntervalMs: 10,
};

async function withPrismaSessionStorage<T>(
  operation: (storage: PrismaSessionStorage) => Promise<T>,
): Promise<T> {
  const prisma = createPrismaClient();
  const storage = new PrismaSessionStorage(prisma, storageOptions);

  try {
    return await operation(storage);
  } finally {
    await prisma.$disconnect();
  }
}

export class RequestScopedPrismaSessionStorage {
  isReady() {
    return withPrismaSessionStorage((storage) => storage.isReady());
  }

  storeSession(session: Parameters<PrismaSessionStorage["storeSession"]>[0]) {
    return withPrismaSessionStorage((storage) => storage.storeSession(session));
  }

  loadSession(id: string) {
    return withPrismaSessionStorage((storage) => storage.loadSession(id));
  }

  deleteSession(id: string) {
    return withPrismaSessionStorage((storage) => storage.deleteSession(id));
  }

  deleteSessions(ids: string[]) {
    return withPrismaSessionStorage((storage) => storage.deleteSessions(ids));
  }

  findSessionsByShop(shop: string) {
    return withPrismaSessionStorage((storage) =>
      storage.findSessionsByShop(shop),
    );
  }
}
