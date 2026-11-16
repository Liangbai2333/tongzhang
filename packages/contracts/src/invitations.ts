import { z } from 'zod';
import { uuidSchema, instantSchema, inviteCodeSchema } from './scalars.js';

export const INVITE_QR_PREFIX = 'tongzhang:invite:v1:';
export const inviteQrPayloadSchema = z
  .string()
  .regex(/^tongzhang:invite:v1:[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/, '不是有效的同账邀请二维码');
export const inviteCodeFromQrPayloadSchema = inviteQrPayloadSchema.transform((payload) =>
  payload.slice(INVITE_QR_PREFIX.length),
);
export const formatInviteQrPayload = (code: string): string =>
  `${INVITE_QR_PREFIX}${inviteCodeSchema.parse(code)}`;
export const parseInviteQrPayload = (payload: unknown): string =>
  inviteCodeFromQrPayloadSchema.parse(payload);

export const invitationBodySchema = z.strictObject({ code: inviteCodeSchema });
export const invitationSchema = z
  .object({
    id: uuidSchema,
    code: inviteCodeSchema,
    expiresAt: instantSchema,
    expired: z.boolean(),
    qrPayload: inviteQrPayloadSchema,
  })
  .refine((v) => v.qrPayload === `${INVITE_QR_PREFIX}${v.code}`, {
    path: ['qrPayload'],
    message: '邀请二维码载荷与邀请码不一致',
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
