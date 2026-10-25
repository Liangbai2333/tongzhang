import { allocateExpense, parseYuan, MAX_EXPENSE_CENTS } from '@tongzhang/domain';
import type { Category, CreateExpenseInput, EndpointOutput } from '@tongzhang/contracts';
export type Ledger = EndpointOutput<'getLedger'>['data'];
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
