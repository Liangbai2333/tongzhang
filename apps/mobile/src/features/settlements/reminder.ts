import { MAX_REMINDER_NOTE_LENGTH, type LedgerStatus } from '@tongzhang/contracts';
import { ApiError } from '@/lib/api-error';

export type MemberRole = 'CREATOR' | 'MEMBER';

export type RemindableTransfer = {
  status: 'PENDING' | 'PAID';
  payerMemberId: string;
  payeeMemberId: string;
};

export type ReminderErrorKind =
  | 'cooldown'
  | 'state_invalid'
  | 'idempotency_conflict'
  | 'not_found'
  | 'forbidden'
  | 'validation'
  | 'unauthenticated'
  | 'uncertain'
  | 'unknown';

export type ReminderErrorFeedback = {
  kind: ReminderErrorKind;
  message: string;
  actionLabel?: string;
  preservesIdempotencyKey: boolean;
  autoRetry: false;
};

/**
 * Matches server A32 rules: only SETTLING + PENDING transfers may be reminded,
 * and only by the transfer's payee or a non-payer ledger creator.
 */
export function canRemindTransfer(
  ledgerStatus: LedgerStatus,
  transfer: RemindableTransfer,
  myMemberId: string,
  myRole: MemberRole,
): boolean {
  if (ledgerStatus !== 'SETTLING' || transfer.status !== 'PENDING') return false;
  if (transfer.payerMemberId === myMemberId) return false;
  return transfer.payeeMemberId === myMemberId || myRole === 'CREATOR';
}

export function isReminderInCooldown(cooldownEndsAt: string | null, nowMs = Date.now()): boolean {
  if (!cooldownEndsAt) return false;
  const endsMs = Date.parse(cooldownEndsAt);
  return Number.isFinite(endsMs) && nowMs < endsMs;
}

/**
 * Map A32 remindTransfer errors for settlement UI.
 * Never leaks the payer's notification_enabled preference and never auto-retries.
 */
export function reminderErrorFeedback(error: unknown): ReminderErrorFeedback {
  if (!(error instanceof ApiError)) {
    return {
      kind: 'uncertain',
      message: '催还请求结果尚未确认，已保留原请求标识，请手动重试或刷新结算页核对。',
      actionLabel: '手动重试催还',
      preservesIdempotencyKey: true,
      autoRetry: false,
    };
  }
  switch (error.code) {
    case 'REMINDER_COOLDOWN':
      return {
        kind: 'cooldown',
        message: '该笔待还转账仍在 6 小时催还冷却期内，请冷却结束后再手动发起。',
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
    case 'LEDGER_STATE_INVALID':
      return {
        kind: 'state_invalid',
        message: '账本或转账状态已变更，请刷新结算页查看最新进度。',
        actionLabel: '刷新结算页',
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
    case 'IDEMPOTENCY_CONFLICT':
      return {
        kind: 'idempotency_conflict',
        message: '本次催还内容与先前提交不一致，请刷新结算页后重新操作。',
        actionLabel: '刷新结算页',
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
    case 'TRANSFER_NOT_FOUND':
      return {
        kind: 'not_found',
        message: '未找到该笔待还转账，请刷新结算页。',
        actionLabel: '刷新结算页',
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
    case 'FORBIDDEN':
      return {
        kind: 'forbidden',
        message: error.message || '只有该笔收款人或非付款人创建者可发起催还。',
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
    case 'VALIDATION_ERROR':
      return {
        kind: 'validation',
        message:
          error.message ||
          `请检查催还备注内容（非纯空白且不超过 ${MAX_REMINDER_NOTE_LENGTH} 字）。`,
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
    case 'UNAUTHENTICATED':
      return {
        kind: 'unauthenticated',
        message: '登录状态已失效，同账号重新核验后将保留当前备注与原请求标识，需手动再次确认发送。',
        preservesIdempotencyKey: true,
        autoRetry: false,
      };
    case 'REQUEST_TIMEOUT':
    case 'NETWORK_ERROR':
    case 'INVALID_RESPONSE':
    case 'HTTP_ERROR':
      return {
        kind: 'uncertain',
        message: '网络或服务响应不确定，已保留原请求标识，请手动重试或刷新结算页核对。',
        actionLabel: '手动重试催还',
        preservesIdempotencyKey: true,
        autoRetry: false,
      };
    default:
      if ((error.status ?? 0) >= 500) {
        return {
          kind: 'uncertain',
          message: '服务端响应异常，已保留原请求标识，请手动重试或刷新结算页核对。',
          actionLabel: '手动重试催还',
          preservesIdempotencyKey: true,
          autoRetry: false,
        };
      }
      return {
        kind: 'unknown',
        message: error.message || '催还请求暂时失败，请稍后手动重试。',
        preservesIdempotencyKey: false,
        autoRetry: false,
      };
  }
}
