import type { Handler } from '../../http/context.js';
import { appendAudit } from '../../db/audit.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { notReady } from '../../http/not-ready.js';
import { findUser, lockUser, updateNotificationPreference, updateUsername } from './repository.js';
import { toUserSelf } from './mapper.js';

export interface ProfileService {
  getMe: Handler<'getMe'>;
  updateProfile: Handler<'updateProfile'>;
  updatePreferences: Handler<'updatePreferences'>;
  listNotifications: Handler<'listNotifications'>;
  markNotificationRead: Handler<'markNotificationRead'>;
}

/** Match PostgreSQL `ck_users_username` (`char_length(username) BETWEEN 2 AND 30`) and UTF-8 rules. */
function assertValidUsernameCodePoints(username: string) {
  const length = Array.from(username).length;
  if (length < 2 || length > 30 || username.includes('\0')) {
    throw new AppError('VALIDATION_ERROR', '用户名长度需为 2～30 个字符', 400);
  }
}

export function createProfileService(db: Orm): ProfileService {
  return {
    getMe: async (_input, { principal }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const user = await findUser(db, principal.userId);
      if (!user) throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
      return { data: toUserSelf(user) };
    },
    updateProfile: async ({ body }, { principal, requestId }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      assertValidUsernameCodePoints(body.username);
      const updated = await withTransaction(db, async (tx) => {
        const current = await lockUser(tx, principal.userId);
        if (!current) throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
        const now = new Date();
        const next =
          current.username === body.username
            ? current
            : (await updateUsername(tx, current.id, body.username, now))!;
        await appendAudit(tx, {
          actorUserId: current.id,
          action: 'PROFILE_UPDATED',
          targetType: 'USER',
          targetId: current.id,
          requestId,
          details: { previousUsername: current.username, username: next.username },
        });
        return next;
      });
      return { data: toUserSelf(updated) };
    },
    updatePreferences: async ({ body }, { principal, requestId }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const updated = await withTransaction(db, async (tx) => {
        const current = await lockUser(tx, principal.userId);
        if (!current) throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
        const now = new Date();
        const next =
          current.notificationEnabled === body.notificationEnabled
            ? current
            : (await updateNotificationPreference(tx, current.id, body.notificationEnabled, now))!;
        await appendAudit(tx, {
          actorUserId: current.id,
          action: 'PREFERENCES_UPDATED',
          targetType: 'USER',
          targetId: current.id,
          requestId,
          details: {
            previousNotificationEnabled: current.notificationEnabled,
            notificationEnabled: next.notificationEnabled,
          },
        });
        return next;
      });
      return { data: { notificationEnabled: updated.notificationEnabled } };
    },
    listNotifications: notReady('listNotifications'),
    markNotificationRead: notReady('markNotificationRead'),
  };
}
