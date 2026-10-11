import { AsyncLocalStorage } from 'node:async_hooks';
import type { Tx } from '@sp/db';

/** Pro Anfrage: die Transaktion, in der `app.tenant_id` gesetzt ist (Row-Level-Security). */
export interface RequestScope {
  tx: Tx;
}
export const requestScope = new AsyncLocalStorage<RequestScope>();
