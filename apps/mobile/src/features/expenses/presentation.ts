import { allocateExpense, formatYuan, parseYuan, MAX_EXPENSE_CENTS } from '@tongzhang/domain';
import type { Category, CreateExpenseInput, EndpointOutput } from '@tongzhang/contracts';
import { ApiError } from '@/lib/api-error';
export type Ledger = EndpointOutput<'getLedger'>['data'];
export type ExpenseDetail = EndpointOutput<'getExpense'>['data'];
export type ExpenseWriteConflict = {
  kind: 'version' | 'frozen';
  message: string;
  actionLabel: string;
};
export function expenseWriteConflict(error: unknown): ExpenseWriteConflict | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'VERSION_CONFLICT')
    return {
      kind: 'version',
      message: '消费记录已在其他设备或会话中更新，请刷新最新内容后再操作。',
      actionLabel: '刷新最新消费',
    };
  if (error.code === 'LEDGER_FROZEN')
    return {
      kind: 'frozen',
      message: '账本已进入结算或结清状态，消费已冻结，无法继续编辑或删除。',
      actionLabel: '刷新账本状态',
    };
  return null;
}
export function splitSettingsFromExpense(expense: ExpenseDetail): SplitSettings {
  const memberIds = expense.splits.map((s) => s.memberId);
  const values: Record<string, string> = {};
  if (expense.splitMode === 'SHARES') {
    for (const s of expense.splits) values[s.memberId] = String(s.shares ?? 1);
  } else if (expense.splitMode === 'AMOUNT') {
    for (const s of expense.splits) values[s.memberId] = formatYuan(BigInt(s.amountCents));
  }
  return { mode: expense.splitMode, memberIds, values };
}
export const categories: { value: Category; label: string }[] = [
  { value: 'DINING', label: '餐饮' },
  { value: 'TRANSPORT', label: '交通' },
  { value: 'TICKET', label: '门票' },
  { value: 'LODGING', label: '住宿' },
  { value: 'SHOPPING', label: '购物' },
  { value: 'OTHER', label: '其他' },
];
export const categoryLabel = (value: Category) => categories.find((c) => c.value === value)!.label;
export const splitLabels = { EQUAL: '人均', SHARES: '按份', AMOUNT: '按金额' } as const;
export type SplitSettings = {
  mode: keyof typeof splitLabels;
  memberIds: string[];
  values: Record<string, string>;
};
export function expenseCents(value: string) {
  const cents = parseYuan(value.trim());
  if (cents < 1n || cents > MAX_EXPENSE_CENTS)
    throw new Error('金额须在 ¥0.01–¥9999999.99 之间，最多两位小数');
  return cents;
}
export function splitInput(
  settings: SplitSettings,
): Pick<CreateExpenseInput, 'splitMode' | 'splits'> {
  const { mode, memberIds, values } = settings;
  if (mode === 'EQUAL')
    return { splitMode: mode, splits: memberIds.map((memberId) => ({ memberId })) };
  if (mode === 'SHARES')
    return {
      splitMode: mode,
      splits: memberIds.map((memberId) => {
        const value = values[memberId] ?? '1';
        if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 10000)
          throw new Error('份数须为 1–10000 的整数');
        return { memberId, shares: Number(value) };
      }),
    };
  return {
    splitMode: mode,
    splits: memberIds.map((memberId) => ({
      memberId,
      amountCents: parseYuan((values[memberId] ?? '').trim()).toString(),
    })),
  };
}
export function splitPreview(total: bigint, settings: SplitSettings) {
  const input = splitInput(settings);
  if (input.splitMode === 'EQUAL')
    return allocateExpense(total, {
      mode: 'EQUAL',
      members: input.splits as { memberId: string }[],
    });
  if (input.splitMode === 'SHARES')
    return allocateExpense(total, {
      mode: 'SHARES',
      members: input.splits as { memberId: string; shares: number }[],
    });
  return allocateExpense(total, {
    mode: 'AMOUNT',
    members: (input.splits as { memberId: string; amountCents: string }[]).map((s) => ({
      memberId: s.memberId,
      amountCents: BigInt(s.amountCents),
    })),
  });
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
