import { PrismaClient, type Prisma } from '@prisma/client';

export * from '@prisma/client';

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

/**
 * Führt `fn` in einer Transaktion aus, in der `app.tenant_id` gesetzt ist.
 * Row-Level-Security (Migration "enable_rls") beschränkt dort jede Abfrage auf diesen Mandanten.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: options.timeoutMs ?? 15_000, maxWait: 10_000 },
  );
}
