import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Orm, Transaction } from '../../db/transaction.js';
import {
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  settlementBatches,
  settlementTransfers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import { requireLedgerMember, type LedgerAccess } from '../ledgers/index.js';

import type { MemberTotals } from './calculator.js';

export interface LedgerSnapshot {
  access: LedgerAccess;
  version: number;
  members: MemberTotals[];
}

/**
 * Read membership, version, expenses, splits and settlement progress from ONE
 * repeatable-read, read-only snapshot. No row locks are taken and nothing is written,
 * so a preview can never change the ledger version or freeze state.
 */
export function readLedgerSnapshot(
  db: Orm,
  ledgerId: string,
  userId: string,
): Promise<LedgerSnapshot> {
  return db.transaction(
    async (tx) => {
      return readLedgerSnapshotInTransaction(tx, ledgerId, userId);
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/** Caller owns tx and must hold the ledger write lock or use a repeatable-read snapshot. */
export async function readLedgerSnapshotInTransaction(
  tx: Transaction,
  ledgerId: string,
  userId: string,
): Promise<LedgerSnapshot> {
  const access = await requireLedgerMember(tx, ledgerId, userId);
  const [ledger] = await tx
    .select({ version: ledgers.version })
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId));
  if (!ledger) throw new AppError('FORBIDDEN', '你没有权限访问该账本', 403);
  const rows = await tx
    .select({ memberId: ledgerMembers.id, username: users.username })
    .from(ledgerMembers)
    .innerJoin(users, eq(users.id, ledgerMembers.userId))
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const paid = await tx
    .select({
      memberId: expenses.payerMemberId,
      total: sql<string>`sum(${expenses.amountCents})`,
    })
    .from(expenses)
    .where(and(eq(expenses.ledgerId, ledgerId), isNull(expenses.deletedAt)))
    .groupBy(expenses.payerMemberId);
  const shared = await tx
    .select({
      memberId: expenseSplits.memberId,
      total: sql<string>`sum(${expenseSplits.amountCents})`,
    })
    .from(expenseSplits)
    .innerJoin(
      expenses,
      and(eq(expenses.ledgerId, expenseSplits.ledgerId), eq(expenses.id, expenseSplits.expenseId)),
    )
    .where(and(eq(expenses.ledgerId, ledgerId), isNull(expenses.deletedAt)))
    .groupBy(expenseSplits.memberId);
  const transfers = await tx
    .select({
      payer: settlementTransfers.payerMemberId,
      payee: settlementTransfers.payeeMemberId,
      amount: settlementTransfers.amountCents,
    })
    .from(settlementTransfers)
    .innerJoin(
      settlementBatches,
      and(
        eq(settlementBatches.ledgerId, settlementTransfers.ledgerId),
        eq(settlementBatches.id, settlementTransfers.batchId),
      ),
    )
    .where(and(eq(settlementTransfers.ledgerId, ledgerId), eq(settlementTransfers.status, 'PAID')));
  const paidBy = new Map(paid.map((r) => [r.memberId, BigInt(r.total)]));
  const sharedBy = new Map(shared.map((r) => [r.memberId, BigInt(r.total)]));
  const settled = new Map<string, bigint>();
  for (const t of transfers) {
    settled.set(t.payer, (settled.get(t.payer) ?? 0n) + t.amount);
    settled.set(t.payee, (settled.get(t.payee) ?? 0n) - t.amount);
  }
  return {
    access,
    version: ledger.version,
    members: rows.map((r) => ({
      memberId: r.memberId,
      username: r.username,
      paidCents: paidBy.get(r.memberId) ?? 0n,
      sharedCents: sharedBy.get(r.memberId) ?? 0n,
      settledCents: settled.get(r.memberId) ?? 0n,
    })),
  };
}
