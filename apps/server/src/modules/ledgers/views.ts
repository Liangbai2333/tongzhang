import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { coverKeySchema, ledgerStatusSchema, type EndpointOutput } from '@tongzhang/contracts';
import type { DatabaseExecutor } from '../../db/transaction.js';
import {
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  settlementTransfers,
  users,
} from '../../db/schema/index.js';
import { computeBalances, type MemberBalance } from '../balances/index.js';

type LedgerRow = typeof ledgers.$inferSelect;
export type LedgerSummary = EndpointOutput<'listLedgers'>['data'][number];
export type LedgerMember = EndpointOutput<'listMembers'>['data'][number];

export interface Figures {
  total: bigint;
  memberCount: number;
  /** Per-member totals from `computeBalances`, the same formula used by the balances API. */
  balances: Map<string, MemberBalance>;
}

const add = (map: Map<string, bigint>, key: string, value: bigint) =>
  map.set(key, (map.get(key) ?? 0n) + value);

/**
 * Totals are derived from real members, expenses and registered transfers; nothing is stored
 * twice. Works for several ledgers at once so the list needs a fixed number of queries.
 */
export async function loadFigures(db: DatabaseExecutor, ledgerIds: string[]) {
  const result = new Map<string, Figures>();
  if (ledgerIds.length === 0) return result;
  const sum = (column: AnyPgColumn) => sql<string>`coalesce(sum(${column}), 0)::text`;

  const memberRows = await db
    .select({ ledgerId: ledgerMembers.ledgerId, id: ledgerMembers.id, username: users.username })
    .from(ledgerMembers)
    .innerJoin(users, eq(users.id, ledgerMembers.userId))
    .where(inArray(ledgerMembers.ledgerId, ledgerIds));
  const paid = new Map<string, Map<string, bigint>>();
  const shared = new Map<string, Map<string, bigint>>();
  const settled = new Map<string, Map<string, bigint>>();
  const totals = new Map<string, bigint>();
  for (const id of ledgerIds) {
    paid.set(id, new Map());
    shared.set(id, new Map());
    settled.set(id, new Map());
    totals.set(id, 0n);
  }

  const paidRows = await db
    .select({
      ledgerId: expenses.ledgerId,
      memberId: expenses.payerMemberId,
      cents: sum(expenses.amountCents),
    })
    .from(expenses)
    .where(and(inArray(expenses.ledgerId, ledgerIds), isNull(expenses.deletedAt)))
    .groupBy(expenses.ledgerId, expenses.payerMemberId);
  for (const row of paidRows) {
    totals.set(row.ledgerId, totals.get(row.ledgerId)! + BigInt(row.cents));
    add(paid.get(row.ledgerId)!, row.memberId, BigInt(row.cents));
  }
  const sharedRows = await db
    .select({
      ledgerId: expenseSplits.ledgerId,
      memberId: expenseSplits.memberId,
      cents: sum(expenseSplits.amountCents),
    })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenses.id, expenseSplits.expenseId))
    .where(and(inArray(expenseSplits.ledgerId, ledgerIds), isNull(expenses.deletedAt)))
    .groupBy(expenseSplits.ledgerId, expenseSplits.memberId);
  for (const row of sharedRows) add(shared.get(row.ledgerId)!, row.memberId, BigInt(row.cents));
  const transfers = await db
    .select({
      ledgerId: settlementTransfers.ledgerId,
      payer: settlementTransfers.payerMemberId,
      payee: settlementTransfers.payeeMemberId,
      amount: settlementTransfers.amountCents,
    })
    .from(settlementTransfers)
    .where(
      and(inArray(settlementTransfers.ledgerId, ledgerIds), eq(settlementTransfers.status, 'PAID')),
    );
  for (const t of transfers) {
    add(settled.get(t.ledgerId)!, t.payer, t.amount);
    add(settled.get(t.ledgerId)!, t.payee, -t.amount);
  }

  for (const id of ledgerIds) {
    const members = memberRows.filter((m) => m.ledgerId === id);
    const balances = computeBalances(
      members.map((m) => ({
        memberId: m.id,
        username: m.username,
        paidCents: paid.get(id)!.get(m.id) ?? 0n,
        sharedCents: shared.get(id)!.get(m.id) ?? 0n,
        settledCents: settled.get(id)!.get(m.id) ?? 0n,
      })),
    );
    result.set(id, {
      total: totals.get(id)!,
      memberCount: members.length,
      balances: new Map(balances.map((b) => [b.memberId, b])),
    });
  }
  return result;
}

export async function loadMembers(
  db: DatabaseExecutor,
  ledgerId: string,
  creatorUserId: string,
  figures: Figures,
): Promise<LedgerMember[]> {
  const rows = await db
    .select({
      id: ledgerMembers.id,
      userId: ledgerMembers.userId,
      username: users.username,
      joinedAt: ledgerMembers.joinedAt,
    })
    .from(ledgerMembers)
    .innerJoin(users, eq(users.id, ledgerMembers.userId))
    .where(eq(ledgerMembers.ledgerId, ledgerId))
    .orderBy(asc(ledgerMembers.joinedAt), asc(ledgerMembers.id));
  return rows.map((row) => {
    const balance = figures.balances.get(row.id)!;
    return {
      id: row.id,
      userId: row.userId,
      username: row.username,
      role: row.userId === creatorUserId ? ('CREATOR' as const) : ('MEMBER' as const),
      joinedAt: row.joinedAt.toISOString(),
      netCents: balance.netCents.toString(),
      remainingNetCents: balance.remainingNetCents.toString(),
    };
  });
}

export function toSummary(
  ledger: LedgerRow,
  figures: Figures,
  myMemberId: string,
  archivedAt: Date | null,
): LedgerSummary {
  return {
    id: ledger.id,
    name: ledger.name,
    coverKey: coverKeySchema.nullable().parse(ledger.coverKey),
    coverImageId: ledger.coverImageId,
    status: ledgerStatusSchema.parse(ledger.status),
    version: ledger.version,
    memberCount: figures.memberCount,
    expenseTotalCents: figures.total.toString(),
    myRemainingNetCents: figures.balances.get(myMemberId)!.remainingNetCents.toString(),
    archivedAt: archivedAt?.toISOString() ?? null,
    createdAt: ledger.createdAt.toISOString(),
  };
}
