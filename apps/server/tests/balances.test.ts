import { expect, it } from 'vitest';
import { computeBalances, toBalanceDto } from '../src/modules/balances/calculator.js';
import { solveSettlement } from '../src/modules/settlements/solver.js';

const m = (memberId: string, paid: number, shared: number, settled = 0) => ({
  memberId,
  username: memberId,
  paidCents: BigInt(paid),
  sharedCents: BigInt(shared),
  settledCents: BigInt(settled),
});

it('computes paid/shared/net with bigint and sums to zero', () => {
  const balances = computeBalances([m('b', 0, 6000), m('a', 12000, 6000)]);
  expect(balances.map((x) => x.netCents)).toEqual([6000n, -6000n]);
  expect(balances.reduce((s, x) => s + x.netCents, 0n)).toBe(0n);
  expect(toBalanceDto(balances[0]!)).toMatchObject({ paidCents: '12000', netCents: '6000' });
});

it('previews one 6000-cent transfer from debtor to creditor', () => {
  const balances = computeBalances([m('a', 12000, 6000), m('b', 0, 6000)]);
  const transfers = solveSettlement(
    balances.map((x) => ({ memberId: x.memberId, netCents: x.netCents })),
  );
  expect(transfers).toEqual([{ payerMemberId: 'b', payeeMemberId: 'a', amountCents: 6000n }]);
});

it('subtracts paid settlement transfers from remaining net and rejects inconsistent data', () => {
  const [a, b] = computeBalances([m('a', 12000, 6000, -6000), m('b', 0, 6000, 6000)]);
  expect([a!.remainingNetCents, b!.remainingNetCents]).toEqual([0n, 0n]);
  expect(() => computeBalances([m('a', 100, 0), m('b', 0, 50)])).toThrow();
});
