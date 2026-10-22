import { z } from 'zod';
import { usernameSchema } from './auth.js';
export const updateProfileBodySchema = z.strictObject({ username: usernameSchema });
export const updatePreferencesBodySchema = z.strictObject({ notificationEnabled: z.boolean() });
