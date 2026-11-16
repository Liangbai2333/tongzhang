import { expenseDetailSchema, type EndpointOutput } from '@tongzhang/contracts';
import type { expenses } from '../../db/schema/index.js';

export type ExpenseRow = typeof expenses.$inferSelect;
export type ExpenseDetailDto = EndpointOutput<'getExpense'>['data'];

export interface PersistedSplit {
  memberId: string;
  shares: number | null;
  amountCents: bigint;
}

export function toExpenseDetailDto(input: {
  expense: ExpenseRow;
  splits: readonly PersistedSplit[];
  names: ReadonlyMap<string, string>;
  receiptImageId: string | null;
  canEdit: boolean;
}): ExpenseDetailDto {
  const { expense, splits, names, receiptImageId, canEdit } = input;
  return expenseDetailSchema.parse({
    id: expense.id,
    ledgerId: expense.ledgerId,
    title: expense.title,
    amountCents: expense.amountCents.toString(),
    category: expense.category,
    occurredOn: expense.occurredOn,
    payerMemberId: expense.payerMemberId,
    payerName: names.get(expense.payerMemberId),
    version: expense.version,
    recorderMemberId: expense.recorderMemberId,
    recorderName: names.get(expense.recorderMemberId),
    splitMode: expense.splitMode,
    splits: splits.map((s) => ({
      memberId: s.memberId,
      username: names.get(s.memberId),
      shares: s.shares,
      amountCents: s.amountCents.toString(),
    })),
    note: expense.note,
    receiptImageId,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    canEdit,
  });
}
