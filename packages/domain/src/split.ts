import { MAX_EXPENSE_CENTS, MAX_LEDGER_MEMBERS } from './limits.js';
export type SplitInput =
  | { mode: 'EQUAL'; members: { memberId: string }[] }
  | { mode: 'SHARES'; members: { memberId: string; shares: number }[] }
  | { mode: 'AMOUNT'; members: { memberId: string; amountCents: bigint }[] };
export interface SplitAmount {
  memberId: string;
  amountCents: bigint;
}
export function allocateExpense(totalCents: bigint, input: SplitInput): SplitAmount[] {
  if (totalCents < 1n || totalCents > MAX_EXPENSE_CENTS) throw new Error('消费金额超出范围');
  if (
    input.members.length < 1 ||
    input.members.length > MAX_LEDGER_MEMBERS ||
    new Set(input.members.map((m) => m.memberId)).size !== input.members.length
  )
    throw new Error('分摊成员无效');
  if (input.mode === 'AMOUNT') {
    if (
      input.members.some((m) => m.amountCents < 0n) ||
      input.members.reduce((sum, m) => sum + m.amountCents, 0n) !== totalCents
    )
      throw new Error('分摊合计必须等于消费金额');
    return input.members
      .map((m) => ({ ...m }))
      .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  }
  const weighted =
    input.mode === 'EQUAL' ? input.members.map((m) => ({ ...m, shares: 1 })) : input.members;
  if (weighted.some((m) => !Number.isInteger(m.shares) || m.shares < 1 || m.shares > 10000))
    throw new Error('份数无效');
  const denominator = weighted.reduce((sum, m) => sum + BigInt(m.shares), 0n);
  const allocated = weighted.map((m) => ({
    memberId: m.memberId,
    amountCents: (totalCents * BigInt(m.shares)) / denominator,
    remainder: (totalCents * BigInt(m.shares)) % denominator,
  }));
  allocated.sort((a, b) =>
    a.remainder !== b.remainder
      ? a.remainder > b.remainder
        ? -1
        : 1
      : a.memberId < b.memberId
        ? -1
        : 1,
  );
  const left = totalCents - allocated.reduce((sum, m) => sum + m.amountCents, 0n);
  for (let i = 0; i < Number(left); i++) allocated[i]!.amountCents += 1n;
  return allocated
    .map(({ memberId, amountCents }) => ({ memberId, amountCents }))
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
}
