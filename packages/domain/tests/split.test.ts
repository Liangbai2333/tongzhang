import { expect, it } from 'vitest';
import { allocateExpense } from '../src/split.js';
it('conserves cents and assigns equal remainders by stable ID', () => {
  const members = [{ memberId: 'c' }, { memberId: 'b' }, { memberId: 'a' }];
  expect(allocateExpense(10000n, { mode: 'EQUAL', members })).toEqual([
    { memberId: 'a', amountCents: 3334n },
    { memberId: 'b', amountCents: 3333n },
    { memberId: 'c', amountCents: 3333n },
  ]);
  expect(allocateExpense(1n, { mode: 'EQUAL', members }).map((x) => x.amountCents)).toEqual([
    1n,
    0n,
    0n,
  ]);
  expect(allocateExpense(10000n, { mode: 'EQUAL', members })).toEqual(
    allocateExpense(10000n, { mode: 'EQUAL', members: [...members].reverse() }),
  );
});
it('weights shares and rejects an unbalanced manual allocation', () => {
  expect(
    allocateExpense(100n, {
      mode: 'SHARES',
      members: [
        { memberId: 'a', shares: 2 },
        { memberId: 'b', shares: 1 },
      ],
    }).map((x) => x.amountCents),
  ).toEqual([67n, 33n]);
  expect(() =>
    allocateExpense(100n, { mode: 'AMOUNT', members: [{ memberId: 'a', amountCents: 99n }] }),
  ).toThrow();
  expect(() =>
    allocateExpense(100n, { mode: 'SHARES', members: [{ memberId: 'a', shares: 0 }] }),
  ).toThrow();
});
