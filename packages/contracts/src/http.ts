import { z } from 'zod';
/** Transport-level envelopes shared by every JSON endpoint. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
  requestId: z.string(),
});
export const envelope = <T extends z.ZodType>(data: T) => z.object({ data });
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), page: z.object({ nextCursor: z.string().nullable() }) });
export const pageQueryShape = {
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
