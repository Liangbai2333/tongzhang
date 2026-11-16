import { describe, expect, it } from 'vitest';
import {
  MAX_STATISTICS_DAILY_POINTS,
  createExpenseBodySchema,
  updateExpenseBodySchema,
  parseExpenseDraftBodySchema,
  expenseDraftSchema,
  statisticsSchema,
  remindTransferBodySchema,
  transferReminderResultSchema,
  notificationListQuerySchema,
  notificationSchema,
  notificationReadResultSchema,
  inviteQrPayloadSchema,
  formatInviteQrPayload,
  parseInviteQrPayload,
  invitationSchema,
  ledgerListQuerySchema,
  moneySchema,
  endpoints,
} from '../src/index.js';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
] as const;

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
    expect(notificationListQuerySchema.parse({ unreadOnly: 'false' }).unreadOnly).toBe(false);
    expect(notificationListQuerySchema.parse({ unreadOnly: 'true' }).unreadOnly).toBe(true);
  });

  it('validates multi-dimensional statistics (A21) conservation, ordering, and empty states', () => {
    const emptyStats = {
      expenseTotalCents: '0',
      expenseCount: 0,
      categories: [],
      dailyTrend: [],
      dailyTrendTruncated: false,
      topExpenses: [],
      members: [
        { memberId: ids[0], username: '小安', paidCents: '0', sharedCents: '0', netCents: '0' },
      ],
    };
    expect(statisticsSchema.safeParse(emptyStats).success).toBe(true);

    const gushanStats = {
      expenseTotalCents: '30000',
      expenseCount: 3,
      categories: [
        { category: 'DINING', amountCents: '12000', expenseCount: 1, percentage: '40' },
        { category: 'TICKET', amountCents: '12000', expenseCount: 1, percentage: '40' },
        { category: 'TRANSPORT', amountCents: '6000', expenseCount: 1, percentage: '20' },
      ],
      dailyTrend: [
        { date: '2026-11-15', amountCents: '24000', expenseCount: 2 },
        { date: '2026-11-16', amountCents: '6000', expenseCount: 1 },
      ],
      dailyTrendTruncated: false,
      topExpenses: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          title: '鼓山食堂',
          amountCents: '12000',
          category: 'DINING',
          occurredOn: '2026-11-15',
          payerMemberId: ids[0],
          payerName: '小安',
        },
        {
          id: '00000000-0000-4000-8000-000000000012',
          title: '涌泉寺门票',
          amountCents: '12000',
          category: 'TICKET',
          occurredOn: '2026-11-15',
          payerMemberId: ids[1],
          payerName: '小白',
        },
        {
          id: '00000000-0000-4000-8000-000000000013',
          title: '往返打车',
          amountCents: '6000',
          category: 'TRANSPORT',
          occurredOn: '2026-11-16',
          payerMemberId: ids[2],
          payerName: '小陈',
        },
      ],
      members: [
        {
          memberId: ids[0],
          username: '小安',
          paidCents: '12000',
          sharedCents: '9000',
          netCents: '3000',
        },
        {
          memberId: ids[1],
          username: '小白',
          paidCents: '12000',
          sharedCents: '6000',
          netCents: '6000',
        },
        {
          memberId: ids[2],
          username: '小陈',
          paidCents: '6000',
          sharedCents: '9000',
          netCents: '-3000',
        },
        {
          memberId: ids[3],
          username: '小丁',
          paidCents: '0',
          sharedCents: '6000',
          netCents: '-6000',
        },
      ],
    };
    expect(statisticsSchema.safeParse(gushanStats).success).toBe(true);

    // Reject broken category sum, non-ascending daily dates, out-of-order topExpenses, and broken member net
    expect(statisticsSchema.safeParse({ ...gushanStats, expenseTotalCents: '30001' }).success).toBe(
      false,
    );
    expect(
      statisticsSchema.safeParse({
        ...gushanStats,
        dailyTrend: [gushanStats.dailyTrend[1], gushanStats.dailyTrend[0]],
      }).success,
    ).toBe(false);
    expect(
      statisticsSchema.safeParse({
        ...gushanStats,
        topExpenses: [gushanStats.topExpenses[2], gushanStats.topExpenses[0]],
      }).success,
    ).toBe(false);
    expect(
      statisticsSchema.safeParse({
        ...gushanStats,
        members: gushanStats.members.map((m, i) => (i === 0 ? { ...m, netCents: '2999' } : m)),
      }).success,
    ).toBe(false);
    // Truncated trends keep only the latest days: allowed only at the limit, sums may fall short
    const fullTrend = Array.from({ length: MAX_STATISTICS_DAILY_POINTS }, (_, idx) => ({
      date: new Date(Date.UTC(2025, 0, 1) + idx * 86_400_000).toISOString().slice(0, 10),
      amountCents: '1',
      expenseCount: 1,
    }));
    const truncatedStats = {
      ...emptyStats,
      expenseTotalCents: '400',
      expenseCount: 400,
      categories: [{ category: 'OTHER', amountCents: '400', expenseCount: 400, percentage: '100' }],
      dailyTrend: fullTrend,
      dailyTrendTruncated: true,
      members: [
        { memberId: ids[0], username: '小安', paidCents: '400', sharedCents: '400', netCents: '0' },
      ],
    };
    expect(statisticsSchema.safeParse(truncatedStats).success).toBe(true);
    expect(
      statisticsSchema.safeParse({ ...truncatedStats, dailyTrendTruncated: false }).success,
    ).toBe(false);
    expect(
      statisticsSchema.safeParse({ ...truncatedStats, dailyTrend: fullTrend.slice(1) }).success,
    ).toBe(false);
    expect(statisticsSchema.safeParse({ ...gushanStats, dailyTrendTruncated: true }).success).toBe(
      false,
    );
    expect(
      statisticsSchema.safeParse({ ...truncatedStats, expenseTotalCents: '300' }).success,
    ).toBe(false);
    // Reject out-of-bounds arrays and missing required fields
    expect(
      statisticsSchema.safeParse({
        ...emptyStats,
        members: Array.from({ length: 13 }, (_, idx) => ({
          memberId: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
          username: `成员${idx + 1}`,
          paidCents: '0',
          sharedCents: '0',
          netCents: '0',
        })),
      }).success,
    ).toBe(false);
    expect(
      statisticsSchema.safeParse({
        expenseTotalCents: '0',
        categories: [],
        dailyTrend: [],
        topExpenses: [],
      }).success,
    ).toBe(false);
  });

  it('validates AI expense draft input and response schemas (A31)', () => {
    expect(parseExpenseDraftBodySchema.safeParse({}).success).toBe(false);
    expect(parseExpenseDraftBodySchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(
      parseExpenseDraftBodySchema.safeParse({
        text: '今天午餐小安付了 120 元大家均分',
        referenceDate: '2026-11-16',
      }).success,
    ).toBe(true);
    expect(parseExpenseDraftBodySchema.safeParse({ receiptImageId: ids[0] }).success).toBe(true);

    const equalDraft = {
      title: '午餐',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-16',
      payerMemberId: ids[0],
      splitMode: 'EQUAL',
      splits: [{ memberId: ids[0] }, { memberId: ids[1] }],
      note: null,
      receiptImageId: null,
      warnings: [],
    };
    expect(expenseDraftSchema.safeParse(equalDraft).success).toBe(true);
    expect(
      expenseDraftSchema.safeParse({ ...equalDraft, amountCents: null, splits: [] }).success,
    ).toBe(true);
    expect(expenseDraftSchema.safeParse({ ...equalDraft, amountCents: '120.00' }).success).toBe(
      false,
    );
    expect(
      expenseDraftSchema.safeParse({
        ...equalDraft,
        splitMode: 'AMOUNT',
        splits: [
          { memberId: ids[0], amountCents: '5000' },
          { memberId: ids[1], amountCents: '6000' },
        ],
      }).success,
    ).toBe(false);
  });

  it('validates transfer reminder (A32) and in-app notification schemas (A33/A34)', () => {
    expect(remindTransferBodySchema.safeParse({}).success).toBe(true);
    expect(remindTransferBodySchema.safeParse({ note: '麻烦今天结清一下' }).success).toBe(true);
    expect(remindTransferBodySchema.safeParse({ note: '   ' }).success).toBe(false);
    expect(remindTransferBodySchema.safeParse({ extra: true }).success).toBe(false);

    expect(
      transferReminderResultSchema.safeParse({
        ledgerId: ids[0],
        transferId: ids[1],
        remindedAt: '2026-11-16T10:00:00.000Z',
        cooldownEndsAt: '2026-11-16T16:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      transferReminderResultSchema.safeParse({
        ledgerId: ids[0],
        transferId: ids[1],
        remindedAt: '2026-11-16T16:00:00.000Z',
        cooldownEndsAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      notificationSchema.safeParse({
        id: ids[0],
        type: 'SETTLEMENT_REMINDER',
        ledgerId: ids[1],
        ledgerName: '鼓山一日',
        transferId: ids[2],
        actorUserId: ids[3],
        actorName: '小安',
        amountCents: '3000',
        note: '麻烦今天结清一下',
        readAt: null,
        createdAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      notificationSchema.safeParse({
        id: ids[0],
        type: 'SETTLEMENT_REMINDER',
        ledgerId: ids[1],
        ledgerName: '鼓山一日',
        transferId: ids[2],
        actorUserId: ids[3],
        actorName: '小安',
        amountCents: '0',
        note: null,
        readAt: null,
        createdAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      notificationSchema.safeParse({
        id: ids[0],
        type: 'SETTLEMENT_STARTED',
        ledgerId: ids[1],
        ledgerName: '鼓山一日',
        transferId: ids[2],
        actorUserId: ids[3],
        actorName: '小安',
        amountCents: '3000',
        note: null,
        readAt: null,
        createdAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      notificationReadResultSchema.safeParse({
        notificationId: ids[0],
        readAt: '2026-11-16T10:05:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('validates and parses invitation QR payloads', () => {
    const payload = formatInviteQrPayload('ABC234');
    expect(payload).toBe('tongzhang:invite:v1:ABC234');
    expect(inviteQrPayloadSchema.safeParse(payload).success).toBe(true);
    expect(parseInviteQrPayload(payload)).toBe('ABC234');

    for (const invalid of [
      null,
      123,
      'ABC234',
      'tongzhang:invite:v2:ABC234',
      'https://example.com/invite/ABC234',
      'tongzhang:invite:v1:abc234',
      'tongzhang:invite:v1:01IOAB',
      'tongzhang:invite:v1:ABC23',
      'tongzhang:invite:v1:ABC2345',
      ' tongzhang:invite:v1:ABC234 ',
    ]) {
      expect(inviteQrPayloadSchema.safeParse(invalid).success).toBe(false);
      expect(() => parseInviteQrPayload(invalid)).toThrow();
    }

    expect(
      invitationSchema.safeParse({
        id: ids[0],
        code: 'ABC234',
        expiresAt: '2099-10-25T00:00:00.000Z',
        expired: false,
        qrPayload: 'tongzhang:invite:v1:XYZ789',
      }).success,
    ).toBe(false);
  });

  it('defines 34 distinct routes and operation IDs', () => {
    const all = Object.values(endpoints);
    expect(all).toHaveLength(34);
    expect(new Set(all.map((e) => e.method + ' ' + e.path)).size).toBe(34);
    expect(new Set(all.map((e) => e.id)).size).toBe(34);
  });
});
