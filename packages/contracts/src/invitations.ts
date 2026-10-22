import { z } from 'zod';
import { uuidSchema, instantSchema, inviteCodeSchema } from './scalars.js';
export const invitationBodySchema = z.strictObject({ code: inviteCodeSchema });
export const invitationSchema = z.object({
  id: uuidSchema,
  code: inviteCodeSchema,
  expiresAt: instantSchema,
  expired: z.boolean(),
  qrPayload: z.string(),
});
export const joinPreviewSchema = z.object({
  ledgerId: uuidSchema,
  name: z.string(),
  creatorName: z.string(),
  memberCount: z.number().int().max(12),
  alreadyMember: z.boolean(),
  canJoin: z.boolean(),
});
export const joinResultSchema = z.object({
  ledgerId: uuidSchema,
  memberId: uuidSchema,
  alreadyMember: z.boolean(),
});
