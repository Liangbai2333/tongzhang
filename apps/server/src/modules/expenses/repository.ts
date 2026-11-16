import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Category } from '@tongzhang/contracts';
import type { DatabaseExecutor, Transaction } from '../../db/transaction.js';
import {
  expenseImages,
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../http/errors.js';
import type { ExpenseRow, PersistedSplit } from './mapper.js';

/** Serialize expense writes against settlement freeze and member changes on the same ledger. */
export async function lockLedger(tx: Transaction, ledgerId: string) {
  const [ledger] = await tx
    .select({ id: ledgers.id })
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .for('update');
  if (!ledger) throw new AppError('FORBIDDEN', '你没有权限访问此账本', 403);
  return ledger;
}

export async function readMemberNames(
  db: DatabaseExecutor,
  ledgerId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: ledgerMembers.id, username: users.username })
    .from(ledgerMembers)
    .innerJoin(users, eq(users.id, ledgerMembers.userId))
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  return new Map(rows.map((m) => [m.id, m.username]));
}

export async function findActiveExpense(
  db: DatabaseExecutor,
  ledgerId: string,
  expenseId: string,
): Promise<ExpenseRow | null> {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.ledgerId, ledgerId), eq(expenses.id, expenseId), isNull(expenses.deletedAt)),
    );
  return expense ?? null;
}

export async function readExpenseSplits(
  db: DatabaseExecutor,
  ledgerId: string,
  expenseId: string,
): Promise<PersistedSplit[]> {
  return db
    .select({
      memberId: expenseSplits.memberId,
      shares: expenseSplits.shares,
      amountCents: expenseSplits.amountCents,
    })
    .from(expenseSplits)
    .where(and(eq(expenseSplits.ledgerId, ledgerId), eq(expenseSplits.expenseId, expenseId)))
    .orderBy(asc(expenseSplits.memberId));
}

export async function readReceiptImageId(
  db: DatabaseExecutor,
  ledgerId: string,
  expenseId: string,
): Promise<string | null> {
  const [receipt] = await db
    .select({ imageId: expenseImages.imageId })
    .from(expenseImages)
    .where(and(eq(expenseImages.ledgerId, ledgerId), eq(expenseImages.expenseId, expenseId)));
  return receipt?.imageId ?? null;
}

export async function insertExpenseWithSplits(
  tx: Transaction,
  input: {
    ledgerId: string;
    recorderMemberId: string;
    payerMemberId: string;
    title: string;
    amountCents: bigint;
    category: Category;
    occurredOn: string;
    splitMode: 'EQUAL' | 'SHARES' | 'AMOUNT';
    note: string | null;
    splits: readonly PersistedSplit[];
  },
): Promise<ExpenseRow> {
  const [expense] = await tx
    .insert(expenses)
    .values({
      ledgerId: input.ledgerId,
      recorderMemberId: input.recorderMemberId,
      payerMemberId: input.payerMemberId,
      title: input.title,
      amountCents: input.amountCents,
      category: input.category,
      occurredOn: input.occurredOn,
      splitMode: input.splitMode,
      note: input.note,
    })
    .returning();
  await tx.insert(expenseSplits).values(
    input.splits.map((s) => ({
      expenseId: expense!.id,
      ledgerId: input.ledgerId,
      memberId: s.memberId,
      shares: s.shares,
      amountCents: s.amountCents,
    })),
  );
  return expense!;
}

/** Preserve recorderMemberId and enforce optimistic locking on the expense row. */
export async function updateExpenseWithSplits(
  tx: Transaction,
  input: {
    ledgerId: string;
    expenseId: string;
    expectedVersion: number;
    payerMemberId: string;
    title: string;
    amountCents: bigint;
    category: Category;
    occurredOn: string;
    splitMode: 'EQUAL' | 'SHARES' | 'AMOUNT';
    note: string | null;
    splits: readonly PersistedSplit[];
    now: Date;
  },
): Promise<ExpenseRow> {
  const [updated] = await tx
    .update(expenses)
    .set({
      payerMemberId: input.payerMemberId,
      title: input.title,
      amountCents: input.amountCents,
      category: input.category,
      occurredOn: input.occurredOn,
      splitMode: input.splitMode,
      note: input.note,
      version: input.expectedVersion + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(expenses.ledgerId, input.ledgerId),
        eq(expenses.id, input.expenseId),
        eq(expenses.version, input.expectedVersion),
        isNull(expenses.deletedAt),
      ),
    )
    .returning();
  if (!updated) throw new AppError('VERSION_CONFLICT', '消费记录已更新，请刷新后重试', 409);
  await tx
    .delete(expenseSplits)
    .where(
      and(eq(expenseSplits.ledgerId, input.ledgerId), eq(expenseSplits.expenseId, input.expenseId)),
    );
  await tx.insert(expenseSplits).values(
    input.splits.map((s) => ({
      expenseId: updated.id,
      ledgerId: input.ledgerId,
      memberId: s.memberId,
      shares: s.shares,
      amountCents: s.amountCents,
    })),
  );
  return updated;
}

/** Detach expense_images while keeping image_assets bound to the ledger to prevent cross-ledger reuse. */
export async function clearExpenseReceipt(tx: Transaction, ledgerId: string, expenseId: string) {
  await tx
    .delete(expenseImages)
    .where(and(eq(expenseImages.ledgerId, ledgerId), eq(expenseImages.expenseId, expenseId)));
}

export async function softDeleteExpenseRow(
  tx: Transaction,
  input: {
    ledgerId: string;
    expenseId: string;
    expectedVersion: number;
    deletedAt: Date;
  },
) {
  const [deleted] = await tx
    .update(expenses)
    .set({
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    })
    .where(
      and(
        eq(expenses.ledgerId, input.ledgerId),
        eq(expenses.id, input.expenseId),
        eq(expenses.version, input.expectedVersion),
        isNull(expenses.deletedAt),
      ),
    )
    .returning({ id: expenses.id });
  if (!deleted) throw new AppError('VERSION_CONFLICT', '消费记录已更新，请刷新后重试', 409);
}

export async function incrementLedgerVersion(tx: Transaction, ledgerId: string, now: Date) {
  await tx
    .update(ledgers)
    .set({ version: sql`${ledgers.version} + 1`, updatedAt: now })
    .where(eq(ledgers.id, ledgerId));
}
