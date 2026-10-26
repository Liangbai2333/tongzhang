import { and, asc, eq } from 'drizzle-orm';
import type { Transaction } from '../../db/transaction.js';
import { settlementBatches, settlementTransfers } from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';

/** Caller supplies a repeatable-read transaction or holds the ledger row lock. */
export async function readSettlement(tx: Transaction, ledgerId: string) {
  const [batch] = await tx
    .select()
    .from(settlementBatches)
    .where(eq(settlementBatches.ledgerId, ledgerId));
  if (!batch) throw new AppError('SETTLEMENT_NOT_FOUND', '账本尚未生成正式结算', 404);
  const transfers = await tx
    .select()
    .from(settlementTransfers)
    .where(
      and(eq(settlementTransfers.ledgerId, ledgerId), eq(settlementTransfers.batchId, batch.id)),
    )
    .orderBy(asc(settlementTransfers.sequence));
  return { batch, transfers };
}

export async function readTransfer(tx: Transaction, ledgerId: string, transferId: string) {
  const [transfer] = await tx
    .select()
    .from(settlementTransfers)
    .where(and(eq(settlementTransfers.ledgerId, ledgerId), eq(settlementTransfers.id, transferId)));
  if (!transfer) throw new AppError('TRANSFER_NOT_FOUND', '该账本中不存在此转账', 404);
  return transfer;
}
