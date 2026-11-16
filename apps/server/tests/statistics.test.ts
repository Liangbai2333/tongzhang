import { describe, expect, it } from 'vitest';
import { MAX_STATISTICS_DAILY_POINTS } from '@tongzhang/contracts';
import {
  buildCategoryStats,
  buildDailyTrend,
  compareTopExpenses,
  formatPercentage,
  type TopExpenseRow,
} from '../src/modules/balances/statistics.js';

describe('formatPercentage', () => {
  it('rounds half up to one decimal with bigint math', () => {
    expect(formatPercentage(12000n, 30000n)).toBe('40.0');
    expect(formatPercentage(6000n, 30000n)).toBe('20.0');
    expect(formatPercentage(1n, 3n)).toBe('33.3');
    expect(formatPercentage(2n, 3n)).toBe('66.7');
    expect(formatPercentage(1n, 8n)).toBe('12.5');
    expect(formatPercentage(1n, 16n)).toBe('6.3'); // 6.25 → half up
    expect(formatPercentage(1n, 2001n)).toBe('0.0');
    expect(formatPercentage(5n, 5n)).toBe('100.0');
  });
  it('returns 0.0 for a zero total instead of dividing by zero', () => {
    expect(formatPercentage(0n, 0n)).toBe('0.0');
  });
  it('rejects a part outside 0..total', () => {
    expect(() => formatPercentage(2n, 1n)).toThrow(RangeError);
    expect(() => formatPercentage(-1n, 1n)).toThrow(RangeError);
  });
  it('handles amounts far beyond Number.MAX_SAFE_INTEGER', () => {
    const total = 2n ** 62n;
    expect(formatPercentage(total / 4n, total)).toBe('25.0');
  });
});

describe('buildCategoryStats', () => {
  it('orders by amount desc then fixed category order, per-row percentages', () => {
    const stats = buildCategoryStats(
      [
        { category: 'OTHER', amountCents: 100n, expenseCount: 1 },
        { category: 'TICKET', amountCents: 100n, expenseCount: 1 },
        { category: 'DINING', amountCents: 100n, expenseCount: 1 },
      ],
      300n,
    );
    expect(stats.map((s) => s.category)).toEqual(['DINING', 'TICKET', 'OTHER']);
    // Independently rounded: 33.3 × 3 = 99.9, documented as acceptable.
    expect(stats.map((s) => s.percentage)).toEqual(['33.3', '33.3', '33.3']);
    expect(stats[0]).toMatchObject({ amountCents: '100', expenseCount: 1 });
  });
  it('returns an empty list for no expenses', () => {
    expect(buildCategoryStats([], 0n)).toEqual([]);
  });
});

describe('buildDailyTrend', () => {
  const day = (i: number) => ({
    date: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    amountCents: BigInt(i + 1),
    expenseCount: 1,
  });
  it('returns ascending dates without truncation at the limit', () => {
    const rows = Array.from({ length: MAX_STATISTICS_DAILY_POINTS }, (_, i) => day(i)).reverse();
    const { dailyTrend, dailyTrendTruncated } = buildDailyTrend(rows);
    expect(dailyTrendTruncated).toBe(false);
    expect(dailyTrend).toHaveLength(MAX_STATISTICS_DAILY_POINTS);
    expect(dailyTrend[0]!.date).toBe('2025-01-01');
    expect(dailyTrend.at(-1)!.amountCents).toBe(String(MAX_STATISTICS_DAILY_POINTS));
  });
  it('keeps the latest days and flags truncation beyond the limit', () => {
    const rows = Array.from({ length: MAX_STATISTICS_DAILY_POINTS + 1 }, (_, i) =>
      day(i),
    ).reverse();
    const { dailyTrend, dailyTrendTruncated } = buildDailyTrend(rows);
    expect(dailyTrendTruncated).toBe(true);
    expect(dailyTrend).toHaveLength(MAX_STATISTICS_DAILY_POINTS);
    expect(dailyTrend[0]!.date).toBe(day(1).date);
    expect(dailyTrend.at(-1)!.date).toBe(day(MAX_STATISTICS_DAILY_POINTS).date);
  });
  it('handles no expense days', () => {
    expect(buildDailyTrend([])).toEqual({ dailyTrend: [], dailyTrendTruncated: false });
  });
});

describe('compareTopExpenses', () => {
  const row = (id: string, amount: bigint, occurredOn: string): TopExpenseRow => ({
    id,
    title: id,
    amountCents: amount,
    category: 'OTHER',
    occurredOn,
    payerMemberId: '00000000-0000-4000-8000-000000000000',
    payerName: 'x',
  });
  it('sorts by amount desc, newer date, then id asc', () => {
    const rows = [
      row('b', 100n, '2026-01-01'),
      row('a', 100n, '2026-01-01'),
      row('c', 100n, '2026-02-01'),
      row('d', 500n, '2025-01-01'),
    ];
    expect([...rows].sort(compareTopExpenses).map((r) => r.id)).toEqual(['d', 'c', 'a', 'b']);
  });
});
