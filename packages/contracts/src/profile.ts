import { z } from 'zod';
import { usernameSchema } from './auth.js';
import { uuidSchema, instantSchema, transferMoneySchema } from './scalars.js';
import { pageQueryShape } from './http.js';
import { MAX_REMINDER_NOTE_LENGTH } from './limits.js';

export const updateProfileBodySchema = z.strictObject({ username: usernameSchema });
export const updatePreferencesBodySchema = z.strictObject({ notificationEnabled: z.boolean() });

export const notificationTypeSchema = z.enum(['SETTLEMENT_REMINDER', 'SETTLEMENT_STARTED']);
export const notificationListQuerySchema = z.object({
  ...pageQueryShape,
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((s) => s === 'true'),
});
export const notificationSchema = z.object({
  id: uuidSchema,
  type: notificationTypeSchema,
  ledgerId: uuidSchema,
  ledgerName: z.string().trim().min(1).max(40),
  transferId: uuidSchema,
  actorUserId: uuidSchema,
  actorName: z.string(),
  amountCents: transferMoneySchema,
  note: z.string().max(MAX_REMINDER_NOTE_LENGTH).nullable(),
  readAt: instantSchema.nullable(),
  createdAt: instantSchema,
});
export const notificationReadResultSchema = z.object({
  notificationId: uuidSchema,
  readAt: instantSchema,
});
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationItem = z.infer<typeof notificationSchema>;
