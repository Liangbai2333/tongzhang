import { z } from 'zod';
import { MAX_LEDGER_MEMBERS, MONEY_SCALE } from '@tongzhang/domain';

export const healthResponseSchema = z.object({
  data: z.object({ status: z.literal('ok'), service: z.literal('tongzhang-server') }),
});
export const readyResponseSchema = z.object({
  data: z.object({ status: z.literal('ok'), database: z.literal('connected') }),
});
export const systemInfoResponseSchema = z.object({
  data: z.object({
    name: z.literal('同账'),
    currency: z.literal('CNY'),
    minorUnit: z.literal(MONEY_SCALE),
    maxLedgerMembers: z.literal(MAX_LEDGER_MEMBERS),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
