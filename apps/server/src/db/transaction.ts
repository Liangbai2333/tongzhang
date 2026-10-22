import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
export type Orm = Database['orm'];
export type Transaction = Parameters<Parameters<Orm['transaction']>[0]>[0];
export type DatabaseExecutor = Orm | Transaction;
/** Service owns the transaction; repositories receive this exact tx. */
export function withTransaction<T>(db: Orm, work: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);
    return work(tx);
  });
}
