import type { PrismaClient } from "@prisma/client";
import {
  PrismaSessionStorage,
  type PrismaSessionStorageInterface,
} from "@shopify/shopify-app-session-storage-prisma";
import { createPrismaClient } from "./db.server";

const storageOptions = {
  connectionRetries: 1,
  connectionRetryIntervalMs: 10,
};

type ScopedStorage = PrismaSessionStorage<PrismaClient>;

async function withPrismaSessionStorage<T>(
  operation: (storage: ScopedStorage) => Promise<T>,
): Promise<T> {
  const prisma = createPrismaClient();
  const storage = new PrismaSessionStorage(prisma, storageOptions);

  try {
    return await operation(storage);
  } finally {
    await prisma.$disconnect();
  }
}

export class RequestScopedPrismaSessionStorage
  implements PrismaSessionStorageInterface
{
  isReady() {
    return withPrismaSessionStorage((storage) => storage.isReady());
  }

  storeSession(session: Parameters<ScopedStorage["storeSession"]>[0]) {
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
