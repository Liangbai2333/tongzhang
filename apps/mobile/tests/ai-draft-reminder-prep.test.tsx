import { describe, expect, it } from '@jest/globals';
import type { ExpenseDraft, NotificationItem } from '@tongzhang/contracts';
import { ApiError } from '@/lib/api-error';
import { expensesApi } from '@/features/expenses/api';
import {
  aiDraftErrorFeedback,
  applyExpenseDraftToForm,
  type ExpenseFormDraftValues,
} from '@/features/expenses/ai-draft';
import type { Ledger } from '@/features/expenses/presentation';
import { settlementsApi } from '@/features/settlements/api';
import {
  canRemindTransfer,
  isReminderInCooldown,
  reminderErrorFeedback,
} from '@/features/settlements/reminder';
import { profileApi } from '@/features/profile/api';
import { profileKeys } from '@/features/profile/query-keys';
import {
  applyNotificationRead,
  notificationErrorFeedback,
  notificationTargetRoute,
} from '@/features/profile/notifications';

const IDS = {
  ledger: '11111111-1111-4111-8111-111111111111',
  an: '22222222-2222-4222-8222-222222222221',
  bai: '22222222-2222-4222-8222-222222222222',
  chen: '22222222-2222-4222-8222-222222222223',
  ding: '22222222-2222-4222-8222-222222222224',
  outsider: '22222222-2222-4222-8222-222222222299',
  receipt: '33333333-3333-4333-8333-333333333333',
  transfer: '44444444-4444-4444-8444-444444444444',
  notification: '55555555-5555-4555-8555-555555555555',
  actorUser: '66666666-6666-4666-8666-666666666666',
};

const gushanLedger: Ledger = {
  id: IDS.ledger,
  name: '鼓山一日',
  coverKey: 'mountain',
  coverImageId: null,
  status: 'ACTIVE',
  version: 1,
  memberCount: 4,
  expenseTotalCents: '30000',
  myRemainingNetCents: '3000',
  archivedAt: null,
  createdAt: '2026-11-19T08:00:00.000Z',
  creatorUserId: IDS.actorUser,
  myMemberId: IDS.an,
  myPaidCents: '12000',
  mySharedCents: '9000',
  myNetCents: '3000',
  members: [
    {
      id: IDS.an,
      userId: IDS.actorUser,
      username: '小安',
      role: 'CREATOR',
      joinedAt: '2026-11-19T08:00:00.000Z',
      netCents: '3000',
      remainingNetCents: '3000',
    },
    {
      id: IDS.bai,
      userId: '66666666-6666-4666-8666-666666666662',
      username: '小白',
      role: 'MEMBER',
      joinedAt: '2026-11-19T08:01:00.000Z',
      netCents: '6000',
      remainingNetCents: '6000',
    },
    {
      id: IDS.chen,
      userId: '66666666-6666-4666-8666-666666666663',
      username: '小陈',
      role: 'MEMBER',
      joinedAt: '2026-11-19T08:02:00.000Z',
      netCents: '-3000',
      remainingNetCents: '-3000',
    },
    {
      id: IDS.ding,
      userId: '66666666-6666-4666-8666-666666666664',
      username: '小丁',
      role: 'MEMBER',
      joinedAt: '2026-11-19T08:03:00.000Z',
      netCents: '-6000',
      remainingNetCents: '-6000',
    },
  ],
};

const baseForm: ExpenseFormDraftValues = {
  title: '已有草稿标题',
  amount: '10.00',
  category: 'OTHER',
  date: '2026-11-19',
  payer: IDS.an,
  note: '已有备注',
  split: { mode: 'EQUAL', memberIds: [IDS.an, IDS.bai, IDS.chen, IDS.ding], values: {} },
  existingReceiptId: null,
};

describe('B13 client prep: API bindings', () => {
  it('exposes A31, A32, A33, and A34 operation clients and notification query keys', () => {
    expect(typeof expensesApi.parseExpenseDraft).toBe('function');
    expect(typeof settlementsApi.remindTransfer).toBe('function');
    expect(typeof profileApi.listNotifications).toBe('function');
    expect(typeof profileApi.markNotificationRead).toBe('function');
    expect(profileKeys.notifications('u1', false)).toEqual(['user', 'u1', 'notifications', 'all']);
    expect(profileKeys.notifications('u1', true)).toEqual([
      'user',
      'u1',
      'notifications',
      'unread',
    ]);
  });
});

describe('B13 client prep: A31 AI draft prefill & error mapping', () => {
  it('prefills ExpenseForm values from integer cents without touching server writes', () => {
    const draft: ExpenseDraft = {
      title: '鼓山食堂午餐',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-19',
      payerMemberId: IDS.bai,
      note: '四人聚餐',
      receiptImageId: IDS.receipt,
      splitMode: 'AMOUNT',
      splits: [
        { memberId: IDS.an, amountCents: '3000' },
        { memberId: IDS.bai, amountCents: '3000' },
        { memberId: IDS.chen, amountCents: '3000' },
        { memberId: IDS.ding, amountCents: '3000' },
      ],
      warnings: ['已按收据合计拆分'],
    };

    const applied = applyExpenseDraftToForm(draft, gushanLedger, baseForm);

    expect(applied.values).toEqual({
      title: '鼓山食堂午餐',
      amount: '120.00',
      category: 'DINING',
      date: '2026-11-19',
      payer: IDS.bai,
      note: '四人聚餐',
      existingReceiptId: IDS.receipt,
      split: {
        mode: 'AMOUNT',
        memberIds: [IDS.an, IDS.bai, IDS.chen, IDS.ding],
        values: {
          [IDS.an]: '30.00',
          [IDS.bai]: '30.00',
          [IDS.chen]: '30.00',
          [IDS.ding]: '30.00',
        },
      },
    });
    expect(applied.warnings).toEqual(['已按收据合计拆分']);
    expect(applied.appliedFields).toContain('amount');
  });

  it('preserves existing form inputs when draft fields are null and guards against unknown members', () => {
    const draft: ExpenseDraft = {
      title: null,
      amountCents: null,
      category: 'TRANSPORT',
      occurredOn: null,
      payerMemberId: IDS.outsider,
      note: null,
      receiptImageId: null,
      splitMode: 'SHARES',
      splits: [
        { memberId: IDS.an, shares: 1 },
        { memberId: IDS.outsider, shares: 2 },
      ],
      warnings: [],
    };

    const applied = applyExpenseDraftToForm(draft, gushanLedger, baseForm);

    expect(applied.values.title).toBe('已有草稿标题');
    expect(applied.values.amount).toBe('10.00');
    expect(applied.values.payer).toBe(IDS.an);
    expect(applied.values.note).toBe('已有备注');
    expect(applied.values.split).toEqual({
      mode: 'EQUAL',
      memberIds: [IDS.an, IDS.bai, IDS.chen, IDS.ding],
      values: {},
    });
    expect(applied.warnings.some((w) => w.includes('非当前账本成员'))).toBe(true);
  });

  it('maps 503/502/409/401/network AI draft errors with preservesForm=true and autoRetry=false', () => {
    const unavailable = aiDraftErrorFeedback(new ApiError('AI_DRAFT_UNAVAILABLE', '未配置', 503));
    expect(unavailable).toMatchObject({
      kind: 'unavailable',
      preservesForm: true,
      autoRetry: false,
      manualRetryAllowed: false,
    });

    const upstream = aiDraftErrorFeedback(new ApiError('AI_DRAFT_UPSTREAM_ERROR', '上游异常', 502));
    expect(upstream).toMatchObject({
      kind: 'upstream_error',
      preservesForm: true,
      autoRetry: false,
      manualRetryAllowed: true,
    });

    const frozen = aiDraftErrorFeedback(new ApiError('LEDGER_FROZEN', '已冻结', 409));
    expect(frozen).toMatchObject({
      kind: 'frozen',
      actionLabel: '刷新账本状态',
      preservesForm: true,
      autoRetry: false,
    });

    const unauth = aiDraftErrorFeedback(new ApiError('UNAUTHENTICATED', '请重新登录', 401));
    expect(unauth).toMatchObject({
      kind: 'unauthenticated',
      preservesForm: true,
      autoRetry: false,
    });

    const network = aiDraftErrorFeedback(new ApiError('NETWORK_ERROR', '网络异常'));
    expect(network).toMatchObject({
      kind: 'network',
      preservesForm: true,
      autoRetry: false,
      manualRetryAllowed: true,
    });

    const offline = aiDraftErrorFeedback(
      new ApiError('NETWORK_UNAVAILABLE', '网络未连接，请联网后重试'),
    );
    expect(offline).toMatchObject({
      kind: 'network',
      actionLabel: '手动重试解析',
      preservesForm: true,
      autoRetry: false,
      manualRetryAllowed: true,
    });
  });
});

describe('B13 client prep: A32 settlement reminder permissions & error mapping', () => {
  const pendingTransfer = {
    status: 'PENDING' as const,
    payerMemberId: IDS.chen,
    payeeMemberId: IDS.bai,
  };

  it('enforces SETTLING + PENDING + (payee or non-payer creator) eligibility', () => {
    expect(canRemindTransfer('SETTLING', pendingTransfer, IDS.bai, 'MEMBER')).toBe(true);
    expect(canRemindTransfer('SETTLING', pendingTransfer, IDS.an, 'CREATOR')).toBe(true);
    expect(canRemindTransfer('SETTLING', pendingTransfer, IDS.chen, 'CREATOR')).toBe(false);
    expect(canRemindTransfer('SETTLING', pendingTransfer, IDS.ding, 'MEMBER')).toBe(false);
    expect(canRemindTransfer('ACTIVE', pendingTransfer, IDS.bai, 'MEMBER')).toBe(false);
    expect(canRemindTransfer('SETTLED', pendingTransfer, IDS.bai, 'MEMBER')).toBe(false);
    expect(
      canRemindTransfer('SETTLING', { ...pendingTransfer, status: 'PAID' }, IDS.bai, 'MEMBER'),
    ).toBe(false);
  });

  it('evaluates cooldown timestamps accurately', () => {
    const now = Date.parse('2026-11-19T12:00:00.000Z');
    expect(isReminderInCooldown('2026-11-19T18:00:00.000Z', now)).toBe(true);
    expect(isReminderInCooldown('2026-11-19T12:00:00.000Z', now)).toBe(false);
    expect(isReminderInCooldown(null, now)).toBe(false);
  });

  it('maps 429 REMINDER_COOLDOWN without leaking notification preference and preserves key on 401/network', () => {
    const cooldown = reminderErrorFeedback(new ApiError('REMINDER_COOLDOWN', '冷却中', 429));
    expect(cooldown).toMatchObject({
      kind: 'cooldown',
      preservesIdempotencyKey: false,
      autoRetry: false,
    });
    expect(cooldown.message).not.toContain('通知');
    expect(cooldown.message).not.toContain('开关');

    const unauth = reminderErrorFeedback(new ApiError('UNAUTHENTICATED', '失效', 401));
    expect(unauth).toMatchObject({
      kind: 'unauthenticated',
      preservesIdempotencyKey: true,
      autoRetry: false,
    });

    const timeout = reminderErrorFeedback(new ApiError('REQUEST_TIMEOUT', '超时'));
    expect(timeout).toMatchObject({
      kind: 'uncertain',
      preservesIdempotencyKey: true,
      autoRetry: false,
    });

    const conflict = reminderErrorFeedback(new ApiError('IDEMPOTENCY_CONFLICT', '冲突', 409));
    expect(conflict).toMatchObject({
      kind: 'idempotency_conflict',
      preservesIdempotencyKey: false,
      autoRetry: false,
    });

    const validation = reminderErrorFeedback(new ApiError('VALIDATION_ERROR', '', 400));
    expect(validation).toMatchObject({
      kind: 'validation',
      preservesIdempotencyKey: false,
      autoRetry: false,
    });
    expect(validation.message).toContain('120');
  });
});

describe('B13 client prep: A33/A34 notification state & error mapping', () => {
  const sampleItem: NotificationItem = {
    id: IDS.notification,
    type: 'SETTLEMENT_REMINDER',
    ledgerId: IDS.ledger,
    ledgerName: '鼓山一日',
    transferId: IDS.transfer,
    actorUserId: IDS.actorUser,
    actorName: '小安',
    amountCents: '3000',
    note: '方便时核对一下',
    readAt: null,
    createdAt: '2026-11-19T12:00:00.000Z',
  };

  it('routes reminders to settlement screen and marks read idempotently', () => {
    expect(notificationTargetRoute(sampleItem)).toEqual({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId: IDS.ledger },
    });

    const first = applyNotificationRead([sampleItem], IDS.notification, '2026-11-19T12:05:00.000Z');
    expect(first[0]?.readAt).toBe('2026-11-19T12:05:00.000Z');

    const second = applyNotificationRead(first, IDS.notification, '2026-11-19T12:10:00.000Z');
    expect(second[0]?.readAt).toBe('2026-11-19T12:05:00.000Z');
  });

  it('maps A33/A34 errors with autoRetry=false', () => {
    expect(notificationErrorFeedback(new ApiError('FORBIDDEN', '无权', 403))).toMatchObject({
      kind: 'forbidden',
      autoRetry: false,
    });
    expect(notificationErrorFeedback(new ApiError('NOT_FOUND', '不存在', 404))).toMatchObject({
      kind: 'not_found',
      actionLabel: '刷新提醒',
      autoRetry: false,
    });
    expect(notificationErrorFeedback(new ApiError('NETWORK_ERROR', '断网'))).toMatchObject({
      kind: 'network',
      autoRetry: false,
    });
  });
});
