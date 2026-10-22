import { z } from 'zod';
import { uuidSchema, moneySchema, nonnegativeMoneySchema, categorySchema } from './scalars.js';
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
export const statisticsSchema = z.object({
  expenseTotalCents: nonnegativeMoneySchema,
  categories: z.array(
    z.object({
      category: categorySchema,
      amountCents: nonnegativeMoneySchema,
      percentage: z.string().regex(/^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)$/),
    }),
  ),
  members: z.array(
    memberBalanceSchema.pick({ memberId: true, paidCents: true, sharedCents: true }),
  ),
});
