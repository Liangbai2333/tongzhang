import type { NotificationItem } from '@tongzhang/contracts';
import { ApiError } from '@/lib/api-error';

export type NotificationErrorKind =
  'forbidden' | 'not_found' | 'unauthenticated' | 'network' | 'unknown';

export type NotificationErrorFeedback = {
  kind: NotificationErrorKind;
  message: string;
  actionLabel?: string;
  autoRetry: false;
};

/** Deep link target for an in-app settlement reminder item (A33 -> settlement screen). */
export function notificationTargetRoute(item: Pick<NotificationItem, 'ledgerId'>) {
  return {
    pathname: '/ledgers/[ledgerId]/settlement' as const,
    params: { ledgerId: item.ledgerId },
  };
}

/**
 * Idempotently mark a notification as read in memory after A34 succeeds,
 * preserving the original readAt timestamp if already read.
 */
export function applyNotificationRead(
  items: readonly NotificationItem[],
  notificationId: string,
  readAt: string,
): NotificationItem[] {
  return items.map((item) =>
    item.id === notificationId ? { ...item, readAt: item.readAt ?? readAt } : item,
  );
}

/** Map A33/A34 errors without automatic retries. */
export function notificationErrorFeedback(error: unknown): NotificationErrorFeedback {
  if (!(error instanceof ApiError)) {
    return {
      kind: 'unknown',
      message: '提醒操作暂时失败，请手动刷新或稍后重试。',
      actionLabel: '刷新提醒',
      autoRetry: false,
    };
  }
  switch (error.code) {
    case 'FORBIDDEN':
      return {
        kind: 'forbidden',
        message: error.message || '仅提醒接收人本人可标记已读。',
        autoRetry: false,
      };
    case 'NOT_FOUND':
      return {
        kind: 'not_found',
        message: '该条提醒不存在或已更新，请刷新提醒列表。',
        actionLabel: '刷新提醒',
        autoRetry: false,
      };
    case 'UNAUTHENTICATED':
      return {
        kind: 'unauthenticated',
        message: '登录状态已失效，请重新核验会话后查看提醒。',
        autoRetry: false,
      };
    case 'REQUEST_TIMEOUT':
    case 'NETWORK_ERROR':
      return {
        kind: 'network',
        message: '网络异常，请检查连接后手动重试。',
        actionLabel: '手动重试',
        autoRetry: false,
      };
    default:
      return {
        kind: 'unknown',
        message: error.message || '提醒操作暂时失败，请手动刷新或稍后重试。',
        actionLabel: '刷新提醒',
        autoRetry: false,
      };
  }
}
