import { z } from 'zod';
import {
  uuidSchema,
  instantSchema,
  nonnegativeMoneySchema,
  transferMoneySchema,
  versionSchema,
  ledgerStatusSchema,
  moneySchema,
} from './scalars.js';
import { memberBalanceSchema } from './balances.js';
export const planTransferSchema = z.object({
  sequence: z.number().int().min(1).max(11),
  payerMemberId: uuidSchema,
  payeeMemberId: uuidSchema,
  amountCents: transferMoneySchema,
});
export const transferSchema = planTransferSchema.extend({
  id: uuidSchema,
  status: z.enum(['PENDING', 'PAID']),
  registeredByMemberId: uuidSchema.nullable(),
  registeredAt: instantSchema.nullable(),
  registrationNote: z.string().nullable(),
});
export const progressSchema = z.object({
  paidCount: z.number().int().nonnegative(),
  totalCount: z.number().int().max(11),
  remainingCents: nonnegativeMoneySchema,
});
export const settlementPreviewSchema = z.object({
  ledgerId: uuidSchema,
  ledgerVersion: versionSchema,
  expenseTotalCents: nonnegativeMoneySchema,
  transferTotalCents: nonnegativeMoneySchema,
  transferCount: z.number().int().min(0).max(11),
  members: z.array(memberBalanceSchema).max(12),
  transfers: z.array(planTransferSchema).max(11),
  algorithmVersion: z.string(),
});
export const settlementSchema = z.object({
  id: uuidSchema,
  ledgerId: uuidSchema,
  sourceVersion: versionSchema,
  expenseTotalCents: nonnegativeMoneySchema,
  transferTotalCents: nonnegativeMoneySchema,
  transferCount: z.number().int().min(0).max(11),
  algorithmVersion: z.string(),
  createdAt: instantSchema,
  ledgerStatus: ledgerStatusSchema,
  transfers: z.array(transferSchema),
  progress: progressSchema,
});
/** A24 exposes the frozen net snapshot; A23 keeps its existing idempotent response shape. */
export const settlementDetailsSchema = settlementSchema.extend({
  netSnapshot: z.array(z.object({ memberId: uuidSchema, netCents: moneySchema })).max(12),
});
export const startSettlementBodySchema = z.strictObject({ expectedVersion: versionSchema });
export const markPaidBodySchema = z.strictObject({ note: z.string().max(200).optional() });
