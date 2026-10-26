import { settlementDetailsSchema } from '@tongzhang/contracts';
import type { LedgerStatus } from '@tongzhang/contracts';
import type { settlementBatches, settlementTransfers } from '../../db/schema/index.js';

type Transfer = typeof settlementTransfers.$inferSelect;

export function toTransferDto(transfer: Transfer) {
  return {
    id: transfer.id,
    sequence: transfer.sequence,
    payerMemberId: transfer.payerMemberId,
    payeeMemberId: transfer.payeeMemberId,
    amountCents: transfer.amountCents.toString(),
    status: transfer.status,
    registeredByMemberId: transfer.registeredByMemberId,
    registeredAt: transfer.registeredAt?.toISOString() ?? null,
    registrationNote: transfer.registrationNote,
  };
}

export function toProgressDto(transfers: readonly Transfer[]) {
  return {
    paidCount: transfers.filter((t) => t.status === 'PAID').length,
    totalCount: transfers.length,
    remainingCents: transfers
      .reduce((sum, t) => sum + (t.status === 'PAID' ? 0n : t.amountCents), 0n)
      .toString(),
  };
}

export function toSettlementDto(
  batch: typeof settlementBatches.$inferSelect,
  transfers: readonly Transfer[],
  ledgerStatus: LedgerStatus,
) {
  return settlementDetailsSchema.parse({
    id: batch.id,
    ledgerId: batch.ledgerId,
    sourceVersion: batch.sourceVersion,
    netSnapshot: batch.netSnapshot,
    expenseTotalCents: batch.expenseTotalCents.toString(),
    transferTotalCents: batch.transferTotalCents.toString(),
    transferCount: batch.transferCount,
    algorithmVersion: batch.algorithmVersion,
    createdAt: batch.createdAt.toISOString(),
    ledgerStatus,
    transfers: [...transfers].sort((a, b) => a.sequence - b.sequence).map(toTransferDto),
    progress: toProgressDto(transfers),
  });
}
