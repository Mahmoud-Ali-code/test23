import { PrismaClient } from '@prisma/client';

const prisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = prisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  prisma.prisma = db;
}
