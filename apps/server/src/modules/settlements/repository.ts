import { and, asc, desc, eq } from 'drizzle-orm';
import type { Transaction } from '../../db/transaction.js';
import {
  ledgerMembers,
  operationLogs,
  settlementBatches,
  settlementTransfers,
} from '../../db/schema/index.js';
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

export async function readMemberUserId(tx: Transaction, ledgerId: string, memberId: string) {
  const [member] = await tx
    .select({ userId: ledgerMembers.userId })
    .from(ledgerMembers)
    .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.id, memberId)))
    .limit(1);
  if (!member) throw new AppError('NOT_FOUND', '账本成员不存在', 404);
  return member.userId;
}

export async function findLatestTransferReminder(
  tx: Transaction,
  ledgerId: string,
  transferId: string,
): Promise<Date | null> {
  const [latest] = await tx
    .select({ createdAt: operationLogs.createdAt })
    .from(operationLogs)
    .where(
      and(
        eq(operationLogs.ledgerId, ledgerId),
        eq(operationLogs.action, 'TRANSFER_REMINDED'),
        eq(operationLogs.targetType, 'SETTLEMENT_TRANSFER'),
        eq(operationLogs.targetId, transferId),
      ),
    )
    .orderBy(desc(operationLogs.createdAt))
    .limit(1);
  return latest?.createdAt ?? null;
}
