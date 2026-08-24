import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}

export function lazySingletonProxy<T extends object>(factory: () => T, cache: { value?: T }): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const client = cache.value ?? (cache.value = factory());
      const value = client[property as keyof T];
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

const prismaCache = {
  get value() { return globalForPrisma.prisma; },
  set value(client: PrismaClient | undefined) { globalForPrisma.prisma = client; },
};

export const db = lazySingletonProxy(createClient, prismaCache);
