import { describe, expect, it } from 'vitest';
import { computeExpenseAllocation } from '../src/modules/expenses/service.js';
import { toExpenseDetailDto } from '../src/modules/expenses/mapper.js';
import { AppError } from '../src/http/errors.js';

const m1 = '00000000-0000-4000-8000-000000000001';
const m2 = '00000000-0000-4000-8000-000000000002';
const m3 = '00000000-0000-4000-8000-000000000003';
const stranger = '00000000-0000-4000-8000-000000000099';
const names = new Map([
  [m1, '小安'],
  [m2, '小白'],
  [m3, '小陈'],
]);

describe('computeExpenseAllocation', () => {
  it('recomputes EQUAL and SHARES splits in bigint cents with conserved totals', () => {
    const equal = computeExpenseAllocation(
      {
        amountCents: '10000',
        payerMemberId: m1,
        splitMode: 'EQUAL',
        splits: [{ memberId: m3 }, { memberId: m1 }, { memberId: m2 }],
      },
      names,
    );
    expect(equal.total).toBe(10000n);
    expect(equal.splits).toEqual([
      { memberId: m1, shares: null, amountCents: 3334n },
      { memberId: m2, shares: null, amountCents: 3333n },
      { memberId: m3, shares: null, amountCents: 3333n },
    ]);

    const shares = computeExpenseAllocation(
      {
        amountCents: '10000',
        payerMemberId: m2,
        splitMode: 'SHARES',
        splits: [
          { memberId: m2, shares: 2 },
          { memberId: m1, shares: 1 },
        ],
      },
      names,
    );
    expect(shares.splits).toEqual([
      { memberId: m1, shares: 1, amountCents: 3333n },
      { memberId: m2, shares: 2, amountCents: 6667n },
    ]);
  });

  it('rejects non-member payer or split participants with 400 VALIDATION_ERROR', () => {
    expect(() =>
      computeExpenseAllocation(
        {
          amountCents: '6000',
          payerMemberId: stranger,
          splitMode: 'EQUAL',
          splits: [{ memberId: m1 }],
        },
        names,
      ),
    ).toThrowError(new AppError('VALIDATION_ERROR', '付款人不是账本成员', 400));

    expect(() =>
      computeExpenseAllocation(
        {
          amountCents: '6000',
          payerMemberId: m1,
          splitMode: 'EQUAL',
          splits: [{ memberId: m1 }, { memberId: stranger }],
        },
        names,
      ),
    ).toThrowError(new AppError('VALIDATION_ERROR', '分摊成员不是账本成员', 400));
  });

  it('maps persisted expense rows and preserves recorder identity on DTO serialization', () => {
    const now = new Date('2026-11-16T08:00:00.000Z');
    const dto = toExpenseDetailDto({
      expense: {
        id: '00000000-0000-4000-8000-000000000101',
        ledgerId: '00000000-0000-4000-8000-000000000201',
        recorderMemberId: m2,
        payerMemberId: m1,
        title: '车费更正',
        amountCents: 6000n,
        category: 'TRANSPORT',
        occurredOn: '2026-11-16',
        splitMode: 'AMOUNT',
        note: '修改后备注',
        version: 2,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      splits: [
        { memberId: m1, shares: null, amountCents: 3000n },
        { memberId: m3, shares: null, amountCents: 3000n },
      ],
      names,
      receiptImageId: null,
      canEdit: true,
    });
    expect(dto).toMatchObject({
      version: 2,
      recorderMemberId: m2,
      recorderName: '小白',
      payerMemberId: m1,
      payerName: '小安',
      amountCents: '6000',
      canEdit: true,
    });
  });
});
