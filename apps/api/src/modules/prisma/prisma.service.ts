import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrisma, withTenant, type Db, type Tx } from '@sp/db';
import { ENV, type Env } from '../../config/env';
import { requestScope } from '../../common/als';

/** Verbindung der Laufzeit-Rolle `sp_app`: unterliegt Row-Level-Security. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: Db;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrisma(env.DATABASE_APP_URL);
  }

  /** Eigene, kurze Transaktion für einen Mandanten (unabhängig von der Anfrage-Transaktion). */
  runAsTenant<T>(
    tenantId: string,
    fn: (tx: Tx) => Promise<T>,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    return withTenant(this.client, tenantId, fn, options);
  }

  /** Transaktion der laufenden Anfrage (gesetzt vom TenantTransactionInterceptor). */
  get tx(): Tx {
    const scope = requestScope.getStore();
    if (!scope)
      throw new Error(
        'Keine Mandanten-Transaktion aktiv; Route braucht den TenantTransactionInterceptor',
      );
    return scope.tx;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
