import { MAX_LEDGER_MEMBERS } from '@tongzhang/domain';
export const SETTLEMENT_ALGORITHM = 'zero-sum-dp-v1';
export interface NetBalance {
  memberId: string;
  netCents: bigint;
}
export interface PlannedTransfer {
  payerMemberId: string;
  payeeMemberId: string;
  amountCents: bigint;
}
/** Exact minimum transfers, with deterministic tie breaking, for at most MAX_LEDGER_MEMBERS members. */
export function solveSettlement(input: readonly NetBalance[]): PlannedTransfer[] {
  if (
    input.length > MAX_LEDGER_MEMBERS ||
    new Set(input.map((m) => m.memberId)).size !== input.length
  )
    throw new Error('成员集合无效');
  if (input.reduce((sum, m) => sum + m.netCents, 0n) !== 0n) throw new Error('净额合计必须为零');
  const members = input
    .filter((m) => m.netCents !== 0n)
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
  const n = members.length;
  if (!n) return [];
  const size = 1 << n;
  const sums = Array<bigint>(size).fill(0n);
  const score = new Uint8Array(size);
  const parent = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const bit = mask & -mask;
    const i = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit]! + members[i]!.netCents;
    let best = -1;
    for (let j = 0; j < n; j++)
      if (mask & (1 << j)) {
        const candidate = score[mask ^ (1 << j)]! + Number(sums[mask] === 0n);
        if (candidate > best) {
          best = candidate;
          parent[mask] = j;
        }
      }
    score[mask] = best;
  }
  const order: number[] = [];
  for (let mask = size - 1; mask;) {
    const i = parent[mask]!;
    order.push(i);
    mask ^= 1 << i;
  }
  order.reverse();
  const groups: number[][] = [];
  let group: number[] = [];
  let sum = 0n;
  for (const i of order) {
    group.push(i);
    sum += members[i]!.netCents;
    if (sum === 0n) {
      groups.push(group.sort((a, b) => a - b));
      group = [];
    }
  }
  groups.sort((a, b) => a[0]! - b[0]!);
  const transfers: PlannedTransfer[] = [];
  for (const ids of groups) {
    const debt = ids
      .filter((i) => members[i]!.netCents < 0n)
      .map((i) => ({ memberId: members[i]!.memberId, left: -members[i]!.netCents }));
    const credit = ids
      .filter((i) => members[i]!.netCents > 0n)
      .map((i) => ({ memberId: members[i]!.memberId, left: members[i]!.netCents }));
    let a = 0;
    let b = 0;
    while (a < debt.length && b < credit.length) {
      const payer = debt[a]!;
      const payee = credit[b]!;
      const amountCents = payer.left < payee.left ? payer.left : payee.left;
      transfers.push({ payerMemberId: payer.memberId, payeeMemberId: payee.memberId, amountCents });
      payer.left -= amountCents;
      payee.left -= amountCents;
      if (!payer.left) a++;
      if (!payee.left) b++;
    }
  }
  return transfers;
}
