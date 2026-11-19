import { z } from 'zod';
import { uuidSchema } from '@tongzhang/contracts';
import type { Handler } from '../../http/context.js';
import { decodeCursor, encodeCursor } from '../../http/cursor.js';
import { appendAudit } from '../../db/audit.js';
import { withTransaction, type Orm, type Transaction } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import {
  findNotifications,
  findUser,
  insertNotification,
  lockNotification,
  lockUser,
  markNotificationReadAt,
  updateNotificationPreference,
  updateUsername,
} from './repository.js';
import { toNotificationItem, toNotificationReadResult, toUserSelf } from './mapper.js';

export interface ProfileService {
  getMe: Handler<'getMe'>;
  updateProfile: Handler<'updateProfile'>;
  updatePreferences: Handler<'updatePreferences'>;
  listNotifications: Handler<'listNotifications'>;
  markNotificationRead: Handler<'markNotificationRead'>;
}

const READ_ONLY = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

/** Reject impossible dates (month 99, Feb 30, year zero) that PostgreSQL would fail to cast. */
const instantCursor = z
  .string()
  .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/)
  .refine((at) => {
    if (at.startsWith('0000-')) return false;
    const seconds = at.slice(0, 19);
    const date = new Date(`${seconds}Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(seconds);
  });
const notificationCursorSchema = z.tuple([instantCursor, uuidSchema]);

/** Match PostgreSQL `ck_users_username` (`char_length(username) BETWEEN 2 AND 30`) and UTF-8 rules. */
function assertValidUsernameCodePoints(username: string) {
  const length = Array.from(username).length;
  if (length < 2 || length > 30 || username.includes('\0')) {
    throw new AppError('VALIDATION_ERROR', '用户名长度需为 2～30 个字符', 400);
  }
}

export interface DeliverSettlementReminderInput {
  recipientUserId: string;
  actorUserId: string;
  ledgerId: string;
  transferId: string;
  amountCents: bigint;
  note?: string | null;
  createdAt?: Date;
}

/**
 * Deliver an in-app settlement reminder respecting the recipient's A29 `notification_enabled` flag.
 * When disabled, stay silent (no unread row inserted) without exposing the preference to callers.
 */
export async function deliverSettlementReminderNotification(
  tx: Transaction,
  input: DeliverSettlementReminderInput,
): Promise<{ delivered: boolean; notificationId: string | null }> {
  const recipient = await findUser(tx, input.recipientUserId);
  if (!recipient || !recipient.notificationEnabled) {
    return { delivered: false, notificationId: null };
  }
  const trimmedNote = input.note?.trim();
  const normalizedNote = trimmedNote && trimmedNote.length > 0 ? trimmedNote : null;
  const created = await insertNotification(tx, {
    recipientUserId: input.recipientUserId,
    actorUserId: input.actorUserId,
    type: 'SETTLEMENT_REMINDER',
    ledgerId: input.ledgerId,
    transferId: input.transferId,
    amountCents: input.amountCents,
    note: normalizedNote,
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
  });
  return { delivered: true, notificationId: created.id };
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
    listNotifications: async ({ query }, { principal }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const after = query.cursor ? decodeCursor(query.cursor, notificationCursorSchema) : null;
      return db.transaction(async (tx) => {
        const rows = await findNotifications(tx, {
          recipientUserId: principal.userId,
          unreadOnly: query.unreadOnly,
          limit: query.limit,
          after,
        });
        const page = rows.slice(0, query.limit);
        const last = page.at(-1);
        return {
          data: page.map(toNotificationItem),
          page: {
            nextCursor:
              rows.length > query.limit && last
                ? encodeCursor([last.createdText, last.notification.id])
                : null,
          },
        };
      }, READ_ONLY);
    },
    markNotificationRead: async ({ params }, { principal, requestId }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const result = await withTransaction(db, async (tx) => {
        const existing = await lockNotification(tx, params.notificationId);
        if (!existing) throw new AppError('NOT_FOUND', '提醒不存在', 404);
        if (existing.recipientUserId !== principal.userId) {
          throw new AppError('FORBIDDEN', '仅提醒接收人本人可标记已读', 403);
        }
        const alreadyRead = existing.readAt !== null;
        const next = alreadyRead
          ? existing
          : (await markNotificationReadAt(
              tx,
              existing.id,
              new Date(Math.max(Date.now(), existing.createdAt.getTime())),
            ))!;
        await appendAudit(tx, {
          actorUserId: principal.userId,
          ledgerId: existing.ledgerId,
          action: 'NOTIFICATION_READ',
          targetType: 'NOTIFICATION',
          targetId: existing.id,
          requestId,
          details: { alreadyRead, readAt: next.readAt!.toISOString() },
        });
        return toNotificationReadResult(next);
      });
      return { data: result };
    },
  };
}
