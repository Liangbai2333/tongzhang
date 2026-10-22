import type { UserSelf } from '@tongzhang/contracts';
import type { users } from '../../db/schema/index.js';

export function toUserSelf(user: typeof users.$inferSelect): UserSelf {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    notificationEnabled: user.notificationEnabled,
  };
}
