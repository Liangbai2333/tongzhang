import { z } from 'zod';
import {
  uuidSchema,
  localDateSchema,
  moneySchema,
  nonnegativeMoneySchema,
  expenseMoneySchema,
  categorySchema,
} from './scalars.js';
import {
  MAX_EXPENSE_CATEGORIES,
  MAX_LEDGER_MEMBERS,
  MAX_STATISTICS_DAILY_POINTS,
  MAX_TOP_EXPENSES,
} from './limits.js';

export const percentageSchema = z.string().regex(/^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)$/);

export const memberBalanceSchema = z.object({
  memberId: uuidSchema,
  username: z.string(),
  paidCents: nonnegativeMoneySchema,
  sharedCents: nonnegativeMoneySchema,
  netCents: moneySchema,
  remainingNetCents: moneySchema,
});
export const balancesSchema = z.object({
  expenseTotalCents: nonnegativeMoneySchema,
  members: z.array(memberBalanceSchema),
});

export const categoryStatSchema = z.object({
  category: categorySchema,
  amountCents: nonnegativeMoneySchema,
  expenseCount: z.number().int().nonnegative(),
  percentage: percentageSchema,
});

export const dailyExpenseStatSchema = z.object({
  date: localDateSchema,
  amountCents: nonnegativeMoneySchema,
  expenseCount: z.number().int().nonnegative(),
});

export const topExpenseStatSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(60),
  amountCents: expenseMoneySchema,
  category: categorySchema,
  occurredOn: localDateSchema,
  payerMemberId: uuidSchema,
  payerName: z.string(),
});

export const memberExpenseStatSchema = memberBalanceSchema.pick({
  memberId: true,
  username: true,
  paidCents: true,
  sharedCents: true,
  netCents: true,
});

export const statisticsSchema = z
  .object({
    expenseTotalCents: nonnegativeMoneySchema,
    expenseCount: z.number().int().nonnegative(),
    categories: z.array(categoryStatSchema).max(MAX_EXPENSE_CATEGORIES),
    dailyTrend: z.array(dailyExpenseStatSchema).max(MAX_STATISTICS_DAILY_POINTS),
    topExpenses: z.array(topExpenseStatSchema).max(MAX_TOP_EXPENSES),
    members: z.array(memberExpenseStatSchema).max(MAX_LEDGER_MEMBERS),
  })
  .superRefine((v, ctx) => {
    if (!nonnegativeMoneySchema.safeParse(v.expenseTotalCents).success) return;
    const totalCents = BigInt(v.expenseTotalCents);

    if (new Set(v.categories.map((c) => c.category)).size !== v.categories.length)
      ctx.addIssue({ code: 'custom', path: ['categories'], message: '统计类别不能重复' });
    if (
      v.categories.every((c) => nonnegativeMoneySchema.safeParse(c.amountCents).success) &&
      v.categories.reduce((sum, c) => sum + BigInt(c.amountCents), 0n) !== totalCents
    )
      ctx.addIssue({
        code: 'custom',
        path: ['categories'],
        message: '分类金额合计必须等于有效消费总额',
      });
    if (v.categories.reduce((sum, c) => sum + c.expenseCount, 0) !== v.expenseCount)
      ctx.addIssue({
        code: 'custom',
        path: ['categories'],
        message: '分类笔数合计必须等于有效消费笔数',
      });

    for (let i = 1; i < v.dailyTrend.length; i += 1) {
      if (v.dailyTrend[i]!.date <= v.dailyTrend[i - 1]!.date) {
        ctx.addIssue({
          code: 'custom',
          path: ['dailyTrend'],
          message: '按日趋势必须按日期严格升序且不重复',
        });
        break;
      }
    }
    if (
      v.dailyTrend.length < MAX_STATISTICS_DAILY_POINTS &&
      v.dailyTrend.every((d) => nonnegativeMoneySchema.safeParse(d.amountCents).success) &&
      v.dailyTrend.reduce((sum, d) => sum + BigInt(d.amountCents), 0n) !== totalCents
    )
      ctx.addIssue({
        code: 'custom',
        path: ['dailyTrend'],
        message: '按日趋势金额合计必须等于有效消费总额',
      });
    if (
      v.dailyTrend.length < MAX_STATISTICS_DAILY_POINTS &&
      v.dailyTrend.reduce((sum, d) => sum + d.expenseCount, 0) !== v.expenseCount
    )
      ctx.addIssue({
        code: 'custom',
        path: ['dailyTrend'],
        message: '按日趋势笔数合计必须等于有效消费笔数',
      });

    if (new Set(v.topExpenses.map((e) => e.id)).size !== v.topExpenses.length)
      ctx.addIssue({ code: 'custom', path: ['topExpenses'], message: '排行消费不能重复' });
    if (v.topExpenses.length > v.expenseCount)
      ctx.addIssue({
        code: 'custom',
        path: ['topExpenses'],
        message: '排行条数不能超过有效消费笔数',
      });
    if (v.topExpenses.every((e) => expenseMoneySchema.safeParse(e.amountCents).success)) {
      for (let i = 0; i < v.topExpenses.length; i += 1) {
        const current = BigInt(v.topExpenses[i]!.amountCents);
        if (current > totalCents) {
          ctx.addIssue({
            code: 'custom',
            path: ['topExpenses', i, 'amountCents'],
            message: '单笔消费金额不能超过有效消费总额',
          });
        }
        if (i > 0 && current > BigInt(v.topExpenses[i - 1]!.amountCents)) {
          ctx.addIssue({
            code: 'custom',
            path: ['topExpenses'],
            message: '单笔支出排行必须按金额降序排列',
          });
          break;
        }
      }
    }

    if (new Set(v.members.map((m) => m.memberId)).size !== v.members.length)
      ctx.addIssue({ code: 'custom', path: ['members'], message: '统计成员不能重复' });
    if (
      v.members.every(
        (m) =>
          nonnegativeMoneySchema.safeParse(m.paidCents).success &&
          nonnegativeMoneySchema.safeParse(m.sharedCents).success &&
          moneySchema.safeParse(m.netCents).success,
      )
    ) {
      for (let i = 0; i < v.members.length; i += 1) {
        const m = v.members[i]!;
        if (BigInt(m.paidCents) - BigInt(m.sharedCents) !== BigInt(m.netCents)) {
          ctx.addIssue({
            code: 'custom',
            path: ['members', i, 'netCents'],
            message: '成员净额必须等于已付减应摊',
          });
        }
      }
      if (v.members.length > 0 || totalCents > 0n) {
        if (v.members.reduce((sum, m) => sum + BigInt(m.paidCents), 0n) !== totalCents)
          ctx.addIssue({
            code: 'custom',
            path: ['members'],
            message: '成员已付合计必须等于有效消费总额',
          });
        if (v.members.reduce((sum, m) => sum + BigInt(m.sharedCents), 0n) !== totalCents)
          ctx.addIssue({
            code: 'custom',
            path: ['members'],
            message: '成员应摊合计必须等于有效消费总额',
          });
      }
    }
  });

export type Statistics = z.infer<typeof statisticsSchema>;
