import { z } from 'zod';

export const healthResponseSchema = z.object({
  data: z.object({ status: z.literal('ok'), service: z.literal('tongzhang-api') }),
});
export const readyResponseSchema = z.object({
  data: z.object({ status: z.literal('ok'), database: z.literal('connected') }),
});
export const systemInfoResponseSchema = z.object({
  data: z.object({
    name: z.literal('同账'),
    currency: z.literal('CNY'),
    minorUnit: z.literal(2),
    maxLedgerMembers: z.literal(12),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
