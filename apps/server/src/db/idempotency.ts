import { sql } from 'drizzle-orm';
import type { Transaction } from './transaction.js';
/** Acquire before the ledger lock; lookup and result insert stay in the same tx. */
export const lockIdempotencyKey = (
  tx: Transaction,
  userId: string,
  operation: string,
  key: string,
) =>
  tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, operation, key])}, 0))`,
  );
