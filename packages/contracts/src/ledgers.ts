import { z } from 'zod';
import {
  uuidSchema,
  instantSchema,
  nonnegativeMoneySchema,
  moneySchema,
  ledgerStatusSchema,
  versionSchema,
  coverKeySchema,
} from './scalars.js';
import { pageQueryShape } from './http.js';
export const createLedgerBodySchema = z
  .strictObject({
    name: z.string().trim().min(1).max(40),
    coverKey: coverKeySchema.optional(),
    coverImageId: uuidSchema.optional(),
  })
  .refine(
    (v) => Number(v.coverKey !== undefined) + Number(v.coverImageId !== undefined) === 1,
    '选择一种封面',
  );
export const ledgerListQuerySchema = z.object({
  ...pageQueryShape,
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((s) => s === 'true'),
});
export const memberSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  username: z.string(),
  role: z.enum(['CREATOR', 'MEMBER']),
  joinedAt: instantSchema,
  netCents: moneySchema,
  remainingNetCents: moneySchema,
});
export const ledgerSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  coverKey: coverKeySchema.nullable(),
  coverImageId: uuidSchema.nullable(),
  status: ledgerStatusSchema,
  version: versionSchema,
  memberCount: z.number().int().min(1).max(12),
  expenseTotalCents: nonnegativeMoneySchema,
  myRemainingNetCents: moneySchema,
  archivedAt: instantSchema.nullable(),
  createdAt: instantSchema,
});
export const ledgerDetailSchema = ledgerSummarySchema.extend({
  creatorUserId: uuidSchema,
  myMemberId: uuidSchema,
  myPaidCents: nonnegativeMoneySchema,
  mySharedCents: nonnegativeMoneySchema,
  myNetCents: moneySchema,
  members: z.array(memberSchema).max(12),
});
