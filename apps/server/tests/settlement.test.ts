import { expect, it } from 'vitest';
import { solveSettlement } from '../src/modules/settlements/solver.js';
const balances = (values: number[]) =>
  values.map((v, i) => ({ memberId: String(i).padStart(2, '0'), netCents: BigInt(v) }));
function oracle(values: number[]): number {
  const n = values.length;
  const memo = new Map<number, number>([[0, 0]]);
  const groups = (mask: number): number => {
    if (memo.has(mask)) return memo.get(mask)!;
    let best = -100;
    const first = mask & -mask;
    for (let subset = mask; subset; subset = (subset - 1) & mask) {
      if (!(subset & first)) continue;
      if (values.reduce((sum, v, i) => sum + (subset & (1 << i) ? v : 0), 0) === 0)
        best = Math.max(best, 1 + groups(mask ^ subset));
    }
    memo.set(mask, best);
    return best;
  };
  return n - groups((1 << n) - 1);
}
it('uses three transfers for a greedy counterexample and is order independent', () => {
  const input = balances([-4, -3, -3, 6, 4]);
  expect(solveSettlement(input)).toHaveLength(3);
  expect(solveSettlement(input)).toEqual(solveSettlement([...input].reverse()));
  expect(solveSettlement(balances([0, 0]))).toEqual([]);
  expect(() => solveSettlement(balances([1, 2]))).toThrow();
  expect(() => solveSettlement(balances(Array(13).fill(0)))).toThrow();
});
it('matches an independent partition oracle and clears every balance', () => {
  let seed = 42;
  for (let k = 0; k < 120; k++) {
    const n = 2 + (k % 7);
    const values: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      values.push((seed % 41) - 20);
    }
    values.push(-values.reduce((a, b) => a + b, 0));
    const input = balances(values),
      plan = solveSettlement(input);
    expect(plan).toHaveLength(oracle(values));
    const net = new Map(input.map((m) => [m.memberId, m.netCents]));
    for (const t of plan) {
      expect(t.amountCents > 0n).toBe(true);
      net.set(t.payerMemberId, net.get(t.payerMemberId)! + t.amountCents);
      net.set(t.payeeMemberId, net.get(t.payeeMemberId)! - t.amountCents);
    }
    expect([...net.values()].every((v) => v === 0n)).toBe(true);
  }
});
