import { MAX_STATISTICS_DAILY_POINTS, categorySchema, type Category } from '@tongzhang/contracts';

const CATEGORY_ORDER: readonly Category[] = categorySchema.options;

/**
 * Display-only share of `partCents` in `totalCents`, one decimal place, rounded half up
 * with bigint arithmetic (no floats). A zero total yields "0.0" instead of dividing by
 * zero. Each category is rounded on its own, so the list may add up to 99.9–100.1.
 */
export function formatPercentage(partCents: bigint, totalCents: bigint): string {
  if (partCents < 0n || totalCents < 0n || partCents > totalCents)
    throw new RangeError('占比金额必须满足 0 ≤ 分子 ≤ 分母');
  if (totalCents === 0n) return '0.0';
  const tenths = (partCents * 2000n + totalCents) / (2n * totalCents);
  return `${tenths / 10n}.${tenths % 10n}`;
}

export interface CategoryTotal {
  category: Category;
  amountCents: bigint;
  expenseCount: number;
}

/** Amount descending; ties keep the fixed contract category order. Percentages per row. */
export function buildCategoryStats(rows: readonly CategoryTotal[], totalCents: bigint) {
  return [...rows]
    .sort((a, b) =>
      a.amountCents === b.amountCents
        ? CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
        : a.amountCents > b.amountCents
          ? -1
          : 1,
    )
    .map((r) => ({
      category: r.category,
      amountCents: r.amountCents.toString(),
      expenseCount: r.expenseCount,
      percentage: formatPercentage(r.amountCents, totalCents),
    }));
}

export interface DailyTotal {
  date: string;
  amountCents: bigint;
  expenseCount: number;
}

/**
 * Input: per-day totals ordered by date DESCENDING, fetched with LIMIT MAX + 1.
 * Keeps the latest MAX days, returns them ascending and reports whether older days were cut.
 */
export function buildDailyTrend(latestFirst: readonly DailyTotal[]) {
  const dailyTrendTruncated = latestFirst.length > MAX_STATISTICS_DAILY_POINTS;
  const dailyTrend = latestFirst
    .slice(0, MAX_STATISTICS_DAILY_POINTS)
    .reverse()
    .map((d) => ({
      date: d.date,
      amountCents: d.amountCents.toString(),
      expenseCount: d.expenseCount,
    }));
  return { dailyTrend, dailyTrendTruncated };
}

export interface TopExpenseRow {
  id: string;
  title: string;
  amountCents: bigint;
  category: Category;
  occurredOn: string;
  payerMemberId: string;
  payerName: string;
}

/**
 * Ranking order shared with the SQL query: amount desc, then the more recent occurredOn,
 * then id ascending so equal rows always come back in the same order.
 */
export function compareTopExpenses(a: TopExpenseRow, b: TopExpenseRow): number {
  if (a.amountCents !== b.amountCents) return a.amountCents > b.amountCents ? -1 : 1;
  if (a.occurredOn !== b.occurredOn) return a.occurredOn > b.occurredOn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function toTopExpenseDto(r: TopExpenseRow) {
  return { ...r, amountCents: r.amountCents.toString() };
}
