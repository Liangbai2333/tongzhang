import { describe, expect, it } from 'vitest';
import {
  MAX_AI_DRAFT_TEXT_LENGTH,
  MAX_AI_DRAFT_WARNINGS,
  MAX_EXPENSE_CATEGORIES,
  MAX_REMINDER_NOTE_LENGTH,
  MAX_STATISTICS_DAILY_POINTS,
  MAX_TOP_EXPENSES,
  INVITE_QR_PREFIX,
  expenseDraftSchema,
  formatInviteQrPayload,
  inviteQrPayloadSchema,
  notificationListQuerySchema,
  notificationReadResultSchema,
  notificationSchema,
  parseExpenseDraftBodySchema,
  parseInviteQrPayload,
  remindTransferBodySchema,
  statisticsSchema,
  transferReminderResultSchema,
} from '../src/index.js';

/** B15 (#90): explicit negative cases for the Beta contracts; positives live in business.test.ts. */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [an, bai, chen, ding] = [uuid(1), uuid(2), uuid(3), uuid(4)];

/** Money strings that look plausible but are not canonical integer cents. */
const malformedMoney = ['120.00', '1.5', '-0', '01', '0100', '1e4', '+1', ' 1', '1 ', 'abc', ''];
const negativeMoney = ['-1', '-3000'];

const gushan = () => ({
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
      id: uuid(11),
      title: '鼓山食堂',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-15',
      payerMemberId: an,
      payerName: '小安',
    },
    {
      id: uuid(12),
      title: '涌泉寺门票',
      amountCents: '12000',
      category: 'TICKET',
      occurredOn: '2026-11-15',
      payerMemberId: bai,
      payerName: '小白',
    },
    {
      id: uuid(13),
      title: '往返打车',
      amountCents: '6000',
      category: 'TRANSPORT',
      occurredOn: '2026-11-16',
      payerMemberId: chen,
      payerName: '小陈',
    },
  ],
  members: [
    { memberId: an, username: '小安', paidCents: '12000', sharedCents: '9000', netCents: '3000' },
    { memberId: bai, username: '小白', paidCents: '12000', sharedCents: '6000', netCents: '6000' },
    { memberId: chen, username: '小陈', paidCents: '6000', sharedCents: '9000', netCents: '-3000' },
    { memberId: ding, username: '小丁', paidCents: '0', sharedCents: '6000', netCents: '-6000' },
  ],
});

const fullYearTrend = (days: number, startUtc = Date.UTC(2025, 0, 1)) =>
  Array.from({ length: days }, (_, idx) => ({
    date: new Date(startUtc + idx * 86_400_000).toISOString().slice(0, 10),
    amountCents: '1',
    expenseCount: 1,
  }));

/** Single-member, single-category stats whose daily trend has exactly `days` one-cent points. */
const trendStats = (days: number, totalCents: number, count: number, truncated: boolean) => ({
  expenseTotalCents: String(totalCents),
  expenseCount: count,
  categories: [
    { category: 'OTHER', amountCents: String(totalCents), expenseCount: count, percentage: '100' },
  ],
  dailyTrend: fullYearTrend(days),
  dailyTrendTruncated: truncated,
  topExpenses: [],
  members: [
    {
      memberId: an,
      username: '小安',
      paidCents: String(totalCents),
      sharedCents: String(totalCents),
      netCents: '0',
    },
  ],
});

const rejects = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success, JSON.stringify(value)?.slice(0, 160)).toBe(false);

describe('statisticsSchema (A21) negatives', () => {
  it('starts from a valid Gushan baseline so each negative isolates one fault', () => {
    expect(statisticsSchema.safeParse(gushan()).success).toBe(true);
  });

  it('rejects decimal, negative, zero-padded and non-digit money in every money field', () => {
    for (const bad of [...malformedMoney, ...negativeMoney, 30000, null]) {
      rejects(statisticsSchema, { ...gushan(), expenseTotalCents: bad });
      const s = gushan();
      rejects(statisticsSchema, {
        ...s,
        categories: s.categories.map((c, i) => (i === 0 ? { ...c, amountCents: bad } : c)),
      });
      rejects(statisticsSchema, {
        ...s,
        dailyTrend: s.dailyTrend.map((d, i) => (i === 0 ? { ...d, amountCents: bad } : d)),
      });
      rejects(statisticsSchema, {
        ...s,
        topExpenses: s.topExpenses.map((e, i) => (i === 0 ? { ...e, amountCents: bad } : e)),
      });
      for (const field of ['paidCents', 'sharedCents'] as const)
        rejects(statisticsSchema, {
          ...s,
          members: s.members.map((m, i) => (i === 0 ? { ...m, [field]: bad } : m)),
        });
    }
    // netCents may be negative, but must still be canonical integer cents.
    for (const bad of malformedMoney) {
      const s = gushan();
      rejects(statisticsSchema, {
        ...s,
        members: s.members.map((m, i) => (i === 2 ? { ...m, netCents: bad } : m)),
      });
    }
    // A top expense is a real expense, so zero cents is not allowed.
    const s = gushan();
    rejects(statisticsSchema, {
      ...s,
      topExpenses: s.topExpenses.map((e, i) => (i === 2 ? { ...e, amountCents: '0' } : e)),
    });
  });

  it('rejects non-integer or negative counts and malformed percentages', () => {
    for (const bad of [-1, 1.5, '3', null])
      rejects(statisticsSchema, { ...gushan(), expenseCount: bad });
    for (const bad of ['100.1', '101', '-1', '40%', '4e1', '', 40]) {
      const s = gushan();
      rejects(statisticsSchema, {
        ...s,
        categories: s.categories.map((c, i) => (i === 0 ? { ...c, percentage: bad } : c)),
      });
    }
  });

  it('rejects oversize arrays at each declared limit', () => {
    // The category enum has six values, so a seventh entry is necessarily also a duplicate.
    const categories = ['DINING', 'TRANSPORT', 'TICKET', 'LODGING', 'SHOPPING', 'OTHER', 'OTHER'];
    expect(categories.length).toBe(MAX_EXPENSE_CATEGORIES + 1);
    rejects(statisticsSchema, {
      ...gushan(),
      categories: categories.map((category) => ({
        category,
        amountCents: '0',
        expenseCount: 0,
        percentage: '0',
      })),
    });

    // Eleven one-cent expenses on one day: only the topExpenses limit is violated.
    const ranked = (n: number) => ({
      ...trendStats(0, 11, 11, false),
      dailyTrend: [{ date: '2026-11-16', amountCents: '11', expenseCount: 11 }],
      topExpenses: Array.from({ length: n }, (_, i) => ({
        ...gushan().topExpenses[2]!,
        id: uuid(100 + i),
        amountCents: '1',
      })),
    });
    expect(statisticsSchema.safeParse(ranked(MAX_TOP_EXPENSES)).success).toBe(true);
    rejects(statisticsSchema, ranked(MAX_TOP_EXPENSES + 1));

    rejects(statisticsSchema, trendStats(MAX_STATISTICS_DAILY_POINTS + 1, 400, 400, true));
  });

  it('rejects every missing top-level field and missing nested fields', () => {
    for (const key of Object.keys(gushan())) {
      const s: Record<string, unknown> = gushan();
      delete s[key];
      rejects(statisticsSchema, s);
    }
    const without = (row: object, key: string) => {
      const copy: Record<string, unknown> = { ...row };
      delete copy[key];
      return copy;
    };
    const s = gushan();
    rejects(statisticsSchema, {
      ...s,
      categories: [without(s.categories[0]!, 'percentage'), ...s.categories.slice(1)],
    });
    rejects(statisticsSchema, {
      ...s,
      members: [without(s.members[0]!, 'netCents'), ...s.members.slice(1)],
    });
    rejects(statisticsSchema, {
      ...s,
      topExpenses: [without(s.topExpenses[0]!, 'payerName'), ...s.topExpenses.slice(1)],
    });
  });

  it('enforces truncation flag rules', () => {
    // A full-length trend without truncation is fine when it accounts for every expense.
    expect(
      statisticsSchema.safeParse(trendStats(MAX_STATISTICS_DAILY_POINTS, 366, 366, false)).success,
    ).toBe(true);
    // The flag must be a real boolean.
    for (const bad of ['true', 'false', 1, 0, null, undefined])
      rejects(statisticsSchema, {
        ...trendStats(MAX_STATISTICS_DAILY_POINTS, 400, 400, true),
        dailyTrendTruncated: bad,
      });
    // Truncated trends may not claim more expenses than exist.
    rejects(statisticsSchema, trendStats(MAX_STATISTICS_DAILY_POINTS, 400, 365, true));
    // An empty ledger cannot be truncated.
    rejects(statisticsSchema, trendStats(0, 0, 0, true));
  });

  it('rejects duplicates and impossible rankings', () => {
    const s = gushan();
    rejects(statisticsSchema, {
      ...s,
      categories: [s.categories[0], { ...s.categories[1]!, category: 'DINING' }, s.categories[2]],
    });
    rejects(statisticsSchema, {
      ...s,
      dailyTrend: [
        { date: '2026-11-15', amountCents: '24000', expenseCount: 2 },
        { date: '2026-11-15', amountCents: '6000', expenseCount: 1 },
      ],
    });
    rejects(statisticsSchema, {
      ...s,
      topExpenses: [
        s.topExpenses[0],
        { ...s.topExpenses[1]!, id: s.topExpenses[0]!.id },
        s.topExpenses[2],
      ],
    });
    rejects(statisticsSchema, {
      ...s,
      members: [s.members[0], { ...s.members[1]!, memberId: an }, s.members[2], s.members[3]],
    });
    // More ranked rows than expenses, and a single row larger than the total.
    rejects(statisticsSchema, {
      ...s,
      topExpenses: [...s.topExpenses, { ...s.topExpenses[2]!, id: uuid(14) }],
    });
    rejects(statisticsSchema, {
      ...s,
      topExpenses: [{ ...s.topExpenses[0]!, amountCents: '30001' }],
    });
    // Paid / shared totals must each conserve the expense total.
    rejects(statisticsSchema, {
      ...s,
      members: s.members.map((m, i) => (i === 3 ? { ...m, paidCents: '1', netCents: '-5999' } : m)),
    });
    rejects(statisticsSchema, { ...s, members: [] });
  });
});

describe('AI draft contracts (A31) negatives', () => {
  it('rejects malformed parse requests', () => {
    expect(
      parseExpenseDraftBodySchema.safeParse({ text: 'x'.repeat(MAX_AI_DRAFT_TEXT_LENGTH) }).success,
    ).toBe(true);
    for (const bad of [
      { text: 'x'.repeat(MAX_AI_DRAFT_TEXT_LENGTH + 1) },
      { text: 120 },
      { text: null },
      { text: '' },
      { receiptImageId: 'not-a-uuid' },
      { receiptImageId: null },
      { referenceDate: '2026-11-16' },
      { text: '午餐 120', referenceDate: '2026-02-30' },
      { text: '午餐 120', referenceDate: '2026/11/16' },
      { text: '午餐 120', referenceDate: '2026-11-16T00:00:00Z' },
      { text: '午餐 120', model: 'gpt' },
      'text',
      null,
    ])
      rejects(parseExpenseDraftBodySchema, bad);
  });

  const draft = () => ({
    title: '午餐',
    amountCents: '12000',
    category: 'DINING',
    occurredOn: '2026-11-16',
    payerMemberId: an,
    splitMode: 'EQUAL',
    splits: [{ memberId: an }, { memberId: bai }],
    note: null,
    receiptImageId: null,
    warnings: [] as string[],
  });

  it('rejects malformed draft money and fields', () => {
    expect(expenseDraftSchema.safeParse(draft()).success).toBe(true);
    for (const bad of [...malformedMoney, ...negativeMoney, '0', 12000])
      rejects(expenseDraftSchema, { ...draft(), amountCents: bad });
    for (const [key, bad] of [
      ['title', ''],
      ['title', 'x'.repeat(61)],
      ['category', null],
      ['category', 'FOOD'],
      ['occurredOn', '2026-11-31'],
      ['payerMemberId', 'abc'],
      ['note', 'x'.repeat(501)],
      ['receiptImageId', 'abc'],
      ['splitMode', 'PERCENT'],
      ['splitMode', 'equal'],
    ] as const)
      rejects(expenseDraftSchema, { ...draft(), [key]: bad });
  });

  it('rejects missing or extra keys because drafts are strict', () => {
    for (const key of Object.keys(draft())) {
      const d: Record<string, unknown> = draft();
      delete d[key];
      rejects(expenseDraftSchema, d);
    }
    rejects(expenseDraftSchema, { ...draft(), confidence: 0.9 });
    rejects(expenseDraftSchema, { ...draft(), splits: [{ memberId: an, amountCents: '6000' }] });
  });

  it('rejects bad warnings', () => {
    rejects(expenseDraftSchema, {
      ...draft(),
      warnings: Array.from({ length: MAX_AI_DRAFT_WARNINGS + 1 }, (_, i) => `提示${i}`),
    });
    for (const bad of ['', '   ', 'x'.repeat(201)])
      rejects(expenseDraftSchema, { ...draft(), warnings: [bad] });
    rejects(expenseDraftSchema, { ...draft(), warnings: null });
  });

  it('rejects inconsistent split modes', () => {
    rejects(expenseDraftSchema, { ...draft(), splits: [{ memberId: an }, { memberId: an }] });
    rejects(expenseDraftSchema, {
      ...draft(),
      splits: Array.from({ length: 13 }, (_, i) => ({ memberId: uuid(200 + i) })),
    });
    rejects(expenseDraftSchema, { ...draft(), splitMode: 'SHARES', splits: [] });
    for (const shares of [0, -1, 1.5, 10001, '1'])
      rejects(expenseDraftSchema, {
        ...draft(),
        splitMode: 'SHARES',
        splits: [{ memberId: an, shares }],
      });
    rejects(expenseDraftSchema, {
      ...draft(),
      amountCents: null,
      splitMode: 'AMOUNT',
      splits: [{ memberId: an, amountCents: '0' }],
    });
    for (const bad of [...malformedMoney, ...negativeMoney])
      rejects(expenseDraftSchema, {
        ...draft(),
        splitMode: 'AMOUNT',
        splits: [
          { memberId: an, amountCents: bad },
          { memberId: bai, amountCents: '12000' },
        ],
      });
  });
});

describe('transfer reminder contracts (A32) negatives', () => {
  it('rejects malformed reminder bodies', () => {
    expect(
      remindTransferBodySchema.safeParse({ note: 'x'.repeat(MAX_REMINDER_NOTE_LENGTH) }).success,
    ).toBe(true);
    for (const bad of [
      { note: 'x'.repeat(MAX_REMINDER_NOTE_LENGTH + 1) },
      { note: '' },
      { note: null },
      { note: 3000 },
      { note: '提醒', amountCents: '3000' },
      null,
      '提醒',
    ])
      rejects(remindTransferBodySchema, bad);
  });

  const result = () => ({
    ledgerId: an,
    transferId: bai,
    remindedAt: '2026-11-16T10:00:00.000Z',
    cooldownEndsAt: '2026-11-16T16:00:00.000Z',
  });

  it('rejects malformed reminder results and never echoes delivery state', () => {
    expect(
      transferReminderResultSchema.safeParse({ ...result(), cooldownEndsAt: result().remindedAt })
        .success,
    ).toBe(true);
    for (const key of Object.keys(result())) {
      const r: Record<string, unknown> = result();
      delete r[key];
      rejects(transferReminderResultSchema, r);
    }
    for (const [key, bad] of [
      ['ledgerId', 'abc'],
      ['transferId', null],
      ['remindedAt', '2026-11-16'],
      ['remindedAt', '2026-11-16T10:00:00'],
      ['remindedAt', '2026-11-16 10:00:00Z'],
      ['cooldownEndsAt', 1763301600000],
    ] as const)
      rejects(transferReminderResultSchema, { ...result(), [key]: bad });
    // Offsets are compared as instants: 15:00+08:00 is 07:00Z, before the 10:00Z reminder.
    rejects(transferReminderResultSchema, {
      ...result(),
      cooldownEndsAt: '2026-11-16T15:00:00.000+08:00',
    });
    // #96 dropped `delivered`: it must not leak through even if a server sends it.
    const parsed = transferReminderResultSchema.parse({ ...result(), delivered: false });
    expect(parsed).not.toHaveProperty('delivered');
  });
});

describe('notification contracts (A33/A34) negatives', () => {
  it('rejects malformed list queries and applies defaults', () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: 20, unreadOnly: false });
    for (const bad of [
      { unreadOnly: '1' },
      { unreadOnly: 'TRUE' },
      { unreadOnly: 'yes' },
      { unreadOnly: true },
      { limit: '0' },
      { limit: '51' },
      { limit: '1.5' },
      { limit: 'abc' },
      { cursor: '' },
      { cursor: 'x'.repeat(513) },
    ])
      rejects(notificationListQuerySchema, bad);
  });

  const item = () => ({
    id: uuid(21),
    type: 'SETTLEMENT_REMINDER',
    ledgerId: uuid(22),
    ledgerName: '鼓山一日',
    transferId: uuid(23),
    actorUserId: uuid(24),
    actorName: '小安',
    amountCents: '3000',
    note: null,
    readAt: null,
    createdAt: '2026-11-16T10:00:00.000Z',
  });

  it('rejects malformed notification items', () => {
    expect(notificationSchema.safeParse(item()).success).toBe(true);
    for (const bad of [...malformedMoney, ...negativeMoney, 3000])
      rejects(notificationSchema, { ...item(), amountCents: bad });
    for (const [key, bad] of [
      ['type', 'settlement_reminder'],
      ['type', null],
      ['id', 'abc'],
      ['transferId', null],
      ['ledgerName', ''],
      ['ledgerName', '   '],
      ['ledgerName', 'x'.repeat(41)],
      ['note', 'x'.repeat(MAX_REMINDER_NOTE_LENGTH + 1)],
      ['readAt', '2026-11-16'],
      ['readAt', false],
      ['createdAt', null],
    ] as const)
      rejects(notificationSchema, { ...item(), [key]: bad });
    for (const key of Object.keys(item())) {
      const n: Record<string, unknown> = item();
      delete n[key];
      rejects(notificationSchema, n);
    }
  });

  it('rejects malformed read results', () => {
    for (const bad of [
      { notificationId: uuid(21) },
      { readAt: '2026-11-16T10:05:00.000Z' },
      { notificationId: uuid(21), readAt: null },
      { notificationId: 'abc', readAt: '2026-11-16T10:05:00.000Z' },
      { notificationId: uuid(21), readAt: '2026-11-16T10:05:00' },
      null,
    ])
      rejects(notificationReadResultSchema, bad);
  });
});

describe('invite QR helpers negatives', () => {
  it('round-trips every allowed code character', () => {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i += 6) {
      const code = alphabet.slice(i, i + 6).padEnd(6, 'Z');
      expect(parseInviteQrPayload(formatInviteQrPayload(code))).toBe(code);
    }
  });

  it('rejects each banned character 0/1/I/O individually and lowercase letters', () => {
    for (const ch of ['0', '1', 'I', 'O', 'a', 'z']) {
      const code = `ABC23${ch}`;
      expect(() => formatInviteQrPayload(code)).toThrow();
      rejects(inviteQrPayloadSchema, `${INVITE_QR_PREFIX}${code}`);
      expect(() => parseInviteQrPayload(`${INVITE_QR_PREFIX}${code}`)).toThrow();
    }
  });

  it('rejects wrong prefixes, versions and lengths', () => {
    for (const bad of [
      '',
      INVITE_QR_PREFIX,
      'TONGZHANG:INVITE:V1:ABC234',
      'tongzhang:invite:V1:ABC234',
      'tongzhang:invite:v0:ABC234',
      'tongzhang:invite:v10:ABC234',
      'tongzhang:invite:ABC234',
      'tongzhang:invite:v1ABC234',
      'tongzhang://invite/v1/ABC234',
      'tongzhang:invite:v1:ABC234\n',
      'tongzhang:invite:v1:ABC234?x=1',
      'xtongzhang:invite:v1:ABC234',
      `${INVITE_QR_PREFIX}ABCD`,
      `${INVITE_QR_PREFIX}ABCDEFGH`,
    ]) {
      rejects(inviteQrPayloadSchema, bad);
      expect(() => parseInviteQrPayload(bad)).toThrow();
    }
    for (const bad of ['', 'ABC23', 'ABC2345', `${INVITE_QR_PREFIX}ABC234`, ' ABC234'])
      expect(() => formatInviteQrPayload(bad)).toThrow();
  });

  it('rejects non-string input', () => {
    for (const bad of [
      undefined,
      0,
      true,
      {},
      [],
      ['tongzhang:invite:v1:ABC234'],
      { code: 'ABC234' },
    ]) {
      rejects(inviteQrPayloadSchema, bad);
      expect(() => parseInviteQrPayload(bad)).toThrow();
      expect(() => formatInviteQrPayload(bad as unknown as string)).toThrow();
    }
  });
});
