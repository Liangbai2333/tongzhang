import type { NotificationItem, NotificationType, UserSelf } from '@tongzhang/contracts';
import type { notifications, users } from '../../db/schema/index.js';

export function toUserSelf(user: typeof users.$inferSelect): UserSelf {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    notificationEnabled: user.notificationEnabled,
  };
}

export interface NotificationRow {
  notification: typeof notifications.$inferSelect;
  ledgerName: string;
  actorName: string;
}

export function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: row.notification.id,
    type: row.notification.type as NotificationType,
    ledgerId: row.notification.ledgerId,
    ledgerName: row.ledgerName,
    transferId: row.notification.transferId,
    actorUserId: row.notification.actorUserId,
    actorName: row.actorName,
    amountCents: row.notification.amountCents.toString(),
    note: row.notification.note,
    readAt: row.notification.readAt ? row.notification.readAt.toISOString() : null,
    createdAt: row.notification.createdAt.toISOString(),
  };
}

export function toNotificationReadResult(notification: typeof notifications.$inferSelect) {
  return {
    notificationId: notification.id,
    readAt: notification.readAt!.toISOString(),
  };
}
