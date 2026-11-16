import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  MAX_STATISTICS_DAILY_POINTS,
  MAX_TOP_EXPENSES,
  statisticsSchema,
  type Category,
  type Statistics,
} from '@tongzhang/contracts';
import type { Orm } from '../../db/transaction.js';
import { expenses, ledgerMembers, users } from '../../db/schema/index.js';
import { computeBalances } from './calculator.js';
import { readLedgerSnapshotInTransaction } from './snapshot.js';
import {
  buildCategoryStats,
  buildDailyTrend,
  compareTopExpenses,
  toTopExpenseDto,
} from './statistics.js';

/**
 * A21: membership check, A20 member totals and every aggregate come from ONE
 * repeatable-read, read-only snapshot, so the figures are mutually consistent.
 * Only active expenses (deleted_at IS NULL) of this ledger are counted.
 */
export function readStatistics(db: Orm, ledgerId: string, userId: string): Promise<Statistics> {
  return db.transaction(
    async (tx) => {
      const snapshot = await readLedgerSnapshotInTransaction(tx, ledgerId, userId);
      const active = and(eq(expenses.ledgerId, ledgerId), isNull(expenses.deletedAt));

      const categoryRows = await tx
        .select({
          category: expenses.category,
          total: sql<string>`sum(${expenses.amountCents})`,
          count: sql<number>`count(*)::int`,
        })
        .from(expenses)
        .where(active)
        .groupBy(expenses.category);
      const categoryTotals = categoryRows.map((r) => ({
        category: r.category as Category,
        amountCents: BigInt(r.total),
        expenseCount: Number(r.count),
      }));
      const expenseTotalCents = categoryTotals.reduce((s, c) => s + c.amountCents, 0n);
      const expenseCount = categoryTotals.reduce((s, c) => s + c.expenseCount, 0);

      const dailyRows = await tx
        .select({
          date: expenses.occurredOn,
          total: sql<string>`sum(${expenses.amountCents})`,
          count: sql<number>`count(*)::int`,
        })
        .from(expenses)
        .where(active)
        .groupBy(expenses.occurredOn)
        .orderBy(desc(expenses.occurredOn))
        .limit(MAX_STATISTICS_DAILY_POINTS + 1);

      const topRows = await tx
        .select({
          id: expenses.id,
          title: expenses.title,
          amountCents: expenses.amountCents,
          category: expenses.category,
          occurredOn: expenses.occurredOn,
          payerMemberId: expenses.payerMemberId,
          payerName: users.username,
        })
        .from(expenses)
        .innerJoin(
          ledgerMembers,
          and(
            eq(ledgerMembers.ledgerId, expenses.ledgerId),
            eq(ledgerMembers.id, expenses.payerMemberId),
          ),
        )
        .innerJoin(users, eq(users.id, ledgerMembers.userId))
        .where(active)
        .orderBy(desc(expenses.amountCents), desc(expenses.occurredOn), asc(expenses.id))
        .limit(MAX_TOP_EXPENSES);

      const members = computeBalances(snapshot.members).map((m) => ({
        memberId: m.memberId,
        username: m.username,
        paidCents: m.paidCents.toString(),
        sharedCents: m.sharedCents.toString(),
        netCents: m.netCents.toString(),
      }));

      return statisticsSchema.parse({
        expenseTotalCents: expenseTotalCents.toString(),
        expenseCount,
        categories: buildCategoryStats(categoryTotals, expenseTotalCents),
        ...buildDailyTrend(
          dailyRows.map((r) => ({
            date: r.date,
            amountCents: BigInt(r.total),
            expenseCount: Number(r.count),
          })),
        ),
        topExpenses: topRows
          .map((r) => ({ ...r, category: r.category as Category }))
          .sort(compareTopExpenses)
          .map(toTopExpenseDto),
        members,
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
