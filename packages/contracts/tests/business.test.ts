import { describe, expect, it } from 'vitest';
import {
  createExpenseBodySchema,
  updateExpenseBodySchema,
  ledgerListQuerySchema,
  moneySchema,
  endpoints,
} from '../src/index.js';
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const expense = {
  title: '午餐',
  amountCents: '100',
  category: 'DINING',
  occurredOn: '2026-10-22',
  payerMemberId: ids[0],
  splitMode: 'AMOUNT',
  splits: [
    { memberId: ids[0], amountCents: '50' },
    { memberId: ids[1], amountCents: '50' },
  ],
};
describe('business contracts', () => {
  it('rejects unsafe money formats and out-of-range values', () => {
    for (const value of [1.2, '1.2', '01', '-0', '1e3', '+1', '9223372036854775808'])
      expect(moneySchema.safeParse(value).success).toBe(false);
    expect(moneySchema.parse('-9223372036854775808')).toBe('-9223372036854775808');
  });
  it('checks amount conservation, duplicate participants, and mode-specific inputs', () => {
    expect(createExpenseBodySchema.safeParse(expense).success).toBe(true);
    expect(createExpenseBodySchema.safeParse({ ...expense, amountCents: '101' }).success).toBe(
      false,
    );
    expect(createExpenseBodySchema.safeParse({ ...expense, amountCents: '1.2' }).success).toBe(
      false,
    );
    expect(
      createExpenseBodySchema.safeParse({
        ...expense,
        splits: [{ memberId: ids[0], amountCents: 'bad' }],
      }).success,
    ).toBe(false);
    expect(
      createExpenseBodySchema.safeParse({
        ...expense,
        splits: [expense.splits[0], expense.splits[0]],
      }).success,
    ).toBe(false);
    expect(createExpenseBodySchema.safeParse({ ...expense, splitMode: 'EQUAL' }).success).toBe(
      false,
    );
    expect(
      createExpenseBodySchema.safeParse({ ...expense, occurredOn: '2026-02-30' }).success,
    ).toBe(false);
  });
  it('requires a version on updates and parses false without truthiness coercion', () => {
    expect(updateExpenseBodySchema.safeParse(expense).success).toBe(false);
    expect(updateExpenseBodySchema.safeParse({ ...expense, version: 1 }).success).toBe(true);
    expect(ledgerListQuerySchema.parse({ archived: 'false' }).archived).toBe(false);
  });
  it('defines 29 distinct routes and operation IDs', () => {
    const all = Object.values(endpoints);
    expect(all).toHaveLength(29);
    expect(new Set(all.map((e) => e.method + ' ' + e.path)).size).toBe(29);
    expect(new Set(all.map((e) => e.id)).size).toBe(29);
  });
});
