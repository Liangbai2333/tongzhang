import { z } from 'zod';
import {
  uuidSchema,
  instantSchema,
  localDateSchema,
  expenseMoneySchema,
  nonnegativeMoneySchema,
  categorySchema,
  versionSchema,
} from './scalars.js';
import { pageQueryShape } from './http.js';
const base = {
  title: z.string().trim().min(1).max(60),
  amountCents: expenseMoneySchema,
  category: categorySchema,
  occurredOn: localDateSchema,
  payerMemberId: uuidSchema,
  note: z.string().max(500).nullable().optional(),
  receiptImageId: uuidSchema.nullable().optional(),
};
const equal = z.strictObject({ memberId: uuidSchema });
const shares = equal.extend({ shares: z.number().int().min(1).max(10000) });
const amounts = equal.extend({ amountCents: nonnegativeMoneySchema });
const equalExpense = z.strictObject({
  ...base,
  splitMode: z.literal('EQUAL'),
  splits: z.array(equal).min(1).max(12),
});
const sharesExpense = z.strictObject({
  ...base,
  splitMode: z.literal('SHARES'),
  splits: z.array(shares).min(1).max(12),
});
const amountsExpense = z.strictObject({
  ...base,
  splitMode: z.literal('AMOUNT'),
  splits: z.array(amounts).min(1).max(12),
});
const expenseInputSchema = z.discriminatedUnion('splitMode', [
  equalExpense,
  sharesExpense,
  amountsExpense,
]);
function validateSplit(v: z.output<typeof expenseInputSchema>, ctx: z.RefinementCtx) {
  if (new Set(v.splits.map((s) => s.memberId)).size !== v.splits.length)
    ctx.addIssue({ code: 'custom', path: ['splits'], message: '分摊成员不能重复' });
  if (
    v.splitMode === 'AMOUNT' &&
    expenseMoneySchema.safeParse(v.amountCents).success &&
    v.splits.every((m) => nonnegativeMoneySchema.safeParse(m.amountCents).success) &&
    v.splits.reduce((sum, s) => sum + BigInt(s.amountCents), 0n) !== BigInt(v.amountCents)
  )
    ctx.addIssue({ code: 'custom', path: ['splits'], message: '分摊合计必须等于消费金额' });
}
export const createExpenseBodySchema = expenseInputSchema.superRefine(validateSplit);
export const updateExpenseBodySchema = z
  .discriminatedUnion('splitMode', [
    equalExpense.extend({ version: versionSchema }),
    sharesExpense.extend({ version: versionSchema }),
    amountsExpense.extend({ version: versionSchema }),
  ])
  .superRefine(validateSplit);
export const expenseListQuerySchema = z
  .object({
    ...pageQueryShape,
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    payerMemberId: uuidSchema.optional(),
    category: categorySchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, '开始日期不能晚于结束日期');
export const expenseSummarySchema = z.object({
  id: uuidSchema,
  title: z.string(),
  amountCents: expenseMoneySchema,
  category: categorySchema,
  occurredOn: localDateSchema,
  payerMemberId: uuidSchema,
  payerName: z.string(),
  version: versionSchema,
});
export const expenseDetailSchema = expenseSummarySchema.extend({
  ledgerId: uuidSchema,
  recorderMemberId: uuidSchema,
  recorderName: z.string(),
  splitMode: z.enum(['EQUAL', 'SHARES', 'AMOUNT']),
  splits: z.array(
    z.object({
      memberId: uuidSchema,
      username: z.string(),
      shares: z.number().int().positive().nullable(),
      amountCents: nonnegativeMoneySchema,
    }),
  ),
  note: z.string().nullable(),
  receiptImageId: uuidSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  canEdit: z.boolean(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseBodySchema>;
