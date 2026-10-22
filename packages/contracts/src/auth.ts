import { z } from 'zod';
import { uuidSchema, instantSchema } from './scalars.js';
const utf8Bytes = (value: string) =>
  Array.from(value).reduce((sum, char) => {
    const cp = char.codePointAt(0)!;
    return sum + (cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4);
  }, 0);
export const usernameSchema = z.string().trim().min(2).max(30);
const passwordSchema = z
  .string()
  .max(72)
  .refine((s) => utf8Bytes(s) <= 256);
export const registerBodySchema = z.strictObject({
  username: usernameSchema,
  email: z.email().max(254).trim().toLowerCase(),
  password: passwordSchema.min(8),
  acceptTerms: z.literal(true),
});
export const loginBodySchema = z.strictObject({
  account: z.string().trim().min(1).max(254),
  password: z
    .string()
    .min(1)
    .max(256)
    .refine((s) => utf8Bytes(s) <= 256),
});
export const userSelfSchema = z.object({
  id: uuidSchema,
  username: usernameSchema,
  email: z.email(),
  notificationEnabled: z.boolean(),
});
export const authResultSchema = z.object({
  user: userSelfSchema,
  token: z.string().min(1),
  expiresAt: instantSchema,
});
export type UserSelf = z.infer<typeof userSelfSchema>;
