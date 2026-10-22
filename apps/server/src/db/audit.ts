import type { Transaction } from './transaction.js';
import { operationLogs } from './schema/index.js';
export const appendAudit = (tx: Transaction, event: typeof operationLogs.$inferInsert) =>
  tx.insert(operationLogs).values(event);
