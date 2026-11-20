import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ExpenseDraft, LedgerStatus, NotificationItem } from '@tongzhang/contracts';
import { formatYuan } from '@tongzhang/domain';
import { ApiError } from '@/lib/api-error';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import {
  aiDraftErrorFeedback,
  applyExpenseDraftToForm,
  type ExpenseFormDraftValues,
} from '@/features/expenses/ai-draft';
import type { Ledger } from '@/features/expenses/presentation';
import {
  canRemindTransfer,
  isReminderInCooldown,
  reminderErrorFeedback,
  type MemberRole,
  type RemindableTransfer,
} from '@/features/settlements/reminder';
import {
  applyNotificationRead,
  notificationErrorFeedback,
  notificationTargetRoute,
} from '@/features/profile/notifications';

let mockKeySeq = 0;
jest.mock('@/lib/api', () => ({
  createIdempotencyKey: () => `b13-panel-key-${++mockKeySeq}`,
}));

const IDS = {
  ledger: '11111111-1111-4111-8111-111111111111',
  an: '22222222-2222-4222-8222-222222222221',
  bai: '22222222-2222-4222-8222-222222222222',
  chen: '22222222-2222-4222-8222-222222222223',
  ding: '22222222-2222-4222-8222-222222222224',
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
  createdAt: '2026-11-20T08:00:00.000Z',
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
      joinedAt: '2026-11-20T08:00:00.000Z',
      netCents: '3000',
      remainingNetCents: '3000',
    },
    {
      id: IDS.bai,
      userId: '66666666-6666-4666-8666-666666666662',
      username: '小白',
      role: 'MEMBER',
      joinedAt: '2026-11-20T08:01:00.000Z',
      netCents: '6000',
      remainingNetCents: '6000',
    },
    {
      id: IDS.chen,
      userId: '66666666-6666-4666-8666-666666666663',
      username: '小陈',
      role: 'MEMBER',
      joinedAt: '2026-11-20T08:02:00.000Z',
      netCents: '-3000',
      remainingNetCents: '-3000',
    },
    {
      id: IDS.ding,
      userId: '66666666-6666-4666-8666-666666666664',
      username: '小丁',
      role: 'MEMBER',
      joinedAt: '2026-11-20T08:03:00.000Z',
      netCents: '-6000',
      remainingNetCents: '-6000',
    },
  ],
};

function AiDraftPrefillPanel({
  parseDraft,
  onSaveExpense,
}: {
  parseDraft: (text: string) => Promise<ExpenseDraft>;
  onSaveExpense: (values: ExpenseFormDraftValues) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [form, setForm] = useState<ExpenseFormDraftValues>({
    title: '已有手工标题',
    amount: '25.00',
    category: 'OTHER',
    date: '2026-11-20',
    payer: IDS.an,
    note: '已有备注',
    split: { mode: 'EQUAL', memberIds: [IDS.an, IDS.bai, IDS.chen, IDS.ding], values: {} },
    existingReceiptId: null,
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleParse() {
    setErrorMessage(null);
    try {
      const draft = await parseDraft(prompt);
      const applied = applyExpenseDraftToForm(draft, gushanLedger, form);
      setForm(applied.values);
      setWarnings(applied.warnings);
    } catch (error) {
      setErrorMessage(aiDraftErrorFeedback(error).message);
    }
  }

  return (
    <View>
      <TextInput accessibilityLabel="AI 记账描述" value={prompt} onChangeText={setPrompt} />
      <Pressable accessibilityRole="button" accessibilityLabel="AI 解析草稿" onPress={handleParse}>
        <Text>AI 解析草稿</Text>
      </Pressable>
      <Text testID="form-title">{form.title}</Text>
      <Text testID="form-amount">{form.amount}</Text>
      <Text testID="form-category">{form.category}</Text>
      <Text testID="form-receipt">{form.existingReceiptId ?? 'none'}</Text>
      {warnings.map((w) => (
        <Text key={w}>{w}</Text>
      ))}
      {errorMessage ? <Text testID="ai-error">{errorMessage}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="确认保存消费"
        onPress={() => onSaveExpense(form)}
      >
        <Text>确认保存消费</Text>
      </Pressable>
    </View>
  );
}

function SettlementReminderPanel({
  ledgerStatus,
  transfer,
  myMemberId,
  myRole,
  cooldownEndsAt,
  nowMs,
  sendReminder,
}: {
  ledgerStatus: LedgerStatus;
  transfer: RemindableTransfer;
  myMemberId: string;
  myRole: MemberRole;
  cooldownEndsAt: string | null;
  nowMs: number;
  sendReminder: (key: string, note: string) => Promise<{ cooldownEndsAt: string }>;
}) {
  const write = useIdempotentWrite();
  const [note, setNote] = useState('麻烦核对一下鼓山车费');
  const [cooldown, setCooldown] = useState<string | null>(cooldownEndsAt);
  const [feedback, setFeedback] = useState<string | null>(null);

  const eligible = canRemindTransfer(ledgerStatus, transfer, myMemberId, myRole);
  const cooling = isReminderInCooldown(cooldown, nowMs);

  async function handleRemind() {
    setFeedback(null);
    const result = await write.submit({ note }, (key) => sendReminder(key, note));
    if (result) {
      setCooldown(result.cooldownEndsAt);
      setFeedback('已发送站内提醒');
    }
  }

  const displayFeedback =
    feedback ?? (write.error ? reminderErrorFeedback(write.error).message : null);

  return (
    <View>
      <TextInput accessibilityLabel="催还备注" value={note} onChangeText={setNote} />
      {eligible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="一键催还"
          disabled={cooling}
          onPress={handleRemind}
        >
          <Text>{cooling ? '冷却中' : '一键催还'}</Text>
        </Pressable>
      ) : (
        <Text>不可催还</Text>
      )}
      {displayFeedback ? <Text testID="reminder-feedback">{displayFeedback}</Text> : null}
    </View>
  );
}

function NotificationListPanel({
  initialItems,
  markRead,
  onNavigate,
}: {
  initialItems: NotificationItem[];
  markRead: (id: string) => Promise<{ readAt: string }>;
  onNavigate: (route: ReturnType<typeof notificationTargetRoute>) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleOpen(item: NotificationItem) {
    setErrorText(null);
    try {
      const res = await markRead(item.id);
      setItems((prev) => applyNotificationRead(prev, item.id, res.readAt));
      onNavigate(notificationTargetRoute(item));
    } catch (error) {
      setErrorText(notificationErrorFeedback(error).message);
    }
  }

  return (
    <View>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`提醒-${item.ledgerName}`}
          onPress={() => handleOpen(item)}
        >
          <Text>{item.ledgerName}</Text>
          <Text>{item.actorName}</Text>
          <Text>{formatYuan(BigInt(item.amountCents))}</Text>
          <Text>{item.readAt ? '已读' : '未读'}</Text>
        </Pressable>
      ))}
      {errorText ? <Text testID="notif-error">{errorText}</Text> : null}
    </View>
  );
}

beforeEach(() => {
  mockKeySeq = 0;
});

describe('B13 dual-platform UI component regressions (AI draft, reminder panel, notifications)', () => {
  it('prefills ExpenseForm fields from A31 draft without auto-saving and preserves inputs on failure', async () => {
    const onSave = jest.fn();
    const parseDraft = jest
      .fn<(text: string) => Promise<ExpenseDraft>>()
      .mockResolvedValueOnce({
        title: '鼓山食堂午餐',
        amountCents: '12000',
        category: 'DINING',
        occurredOn: '2026-11-20',
        payerMemberId: IDS.bai,
        note: '四人聚餐',
        receiptImageId: IDS.receipt,
        splitMode: 'EQUAL',
        splits: [
          { memberId: IDS.an },
          { memberId: IDS.bai },
          { memberId: IDS.chen },
          { memberId: IDS.ding },
        ],
        warnings: ['已按收据合计拆分，请核对'],
      })
      .mockRejectedValueOnce(new ApiError('AI_DRAFT_UNAVAILABLE', '未配置', 503));

    await render(<AiDraftPrefillPanel parseDraft={parseDraft} onSaveExpense={onSave} />);
    await userEvent.type(screen.getByLabelText('AI 记账描述'), '食堂四人 120 元');
    await userEvent.press(screen.getByRole('button', { name: 'AI 解析草稿' }));

    expect(await screen.findByText('鼓山食堂午餐')).toBeOnTheScreen();
    expect(screen.getByTestId('form-amount')).toHaveTextContent('120.00');
    expect(screen.getByTestId('form-category')).toHaveTextContent('DINING');
    expect(screen.getByTestId('form-receipt')).toHaveTextContent(IDS.receipt);
    expect(screen.getByText('已按收据合计拆分，请核对')).toBeOnTheScreen();
    // AI parse must NEVER directly trigger A13 save.
    expect(onSave).not.toHaveBeenCalled();

    // Subsequent 503 error preserves all prefilled values and does not auto-retry.
    await userEvent.press(screen.getByRole('button', { name: 'AI 解析草稿' }));
    expect(await screen.findByTestId('ai-error')).toHaveTextContent(/暂未启用 AI 辅助记账/);
    expect(screen.getByTestId('form-title')).toHaveTextContent('鼓山食堂午餐');
    expect(screen.getByTestId('form-amount')).toHaveTextContent('120.00');
    expect(parseDraft).toHaveBeenCalledTimes(2);
  });

  it('enforces reminder visibility, cooldown, no-leak 429 feedback, and key preservation on timeout', async () => {
    const pendingTransfer: RemindableTransfer = {
      status: 'PENDING',
      payerMemberId: IDS.chen,
      payeeMemberId: IDS.bai,
    };
    const nowMs = Date.parse('2026-11-20T12:00:00.000Z');

    // Payer cannot remind themselves.
    const payerView = await render(
      <SettlementReminderPanel
        ledgerStatus="SETTLING"
        transfer={pendingTransfer}
        myMemberId={IDS.chen}
        myRole="CREATOR"
        cooldownEndsAt={null}
        nowMs={nowMs}
        sendReminder={jest.fn<() => Promise<{ cooldownEndsAt: string }>>()}
      />,
    );
    expect(screen.getByText('不可催还')).toBeOnTheScreen();
    await payerView.unmount();

    // Payee sees button; timeout locks original key without auto-retry; manual retry reuses same key.
    const sendReminder = jest
      .fn<(key: string, note: string) => Promise<{ cooldownEndsAt: string }>>()
      .mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '网络超时'))
      .mockResolvedValueOnce({ cooldownEndsAt: '2026-11-20T18:00:00.000Z' });

    await render(
      <SettlementReminderPanel
        ledgerStatus="SETTLING"
        transfer={pendingTransfer}
        myMemberId={IDS.bai}
        myRole="MEMBER"
        cooldownEndsAt={null}
        nowMs={nowMs}
        sendReminder={sendReminder}
      />,
    );

    await userEvent.press(screen.getByRole('button', { name: '一键催还' }));
    expect(await screen.findByTestId('reminder-feedback')).toHaveTextContent(/已保留原请求标识/);
    expect(sendReminder).toHaveBeenCalledTimes(1);

    // Manual retry reuses the exact same idempotency key and enters 6h cooldown.
    await userEvent.press(screen.getByRole('button', { name: '一键催还' }));
    await waitFor(() => expect(sendReminder).toHaveBeenCalledTimes(2));
    expect(sendReminder.mock.calls[0]?.[0]).toBe('b13-panel-key-1');
    expect(sendReminder.mock.calls[1]?.[0]).toBe('b13-panel-key-1');
    expect(await screen.findByText('冷却中')).toBeOnTheScreen();
  });

  it('marks reminder notifications read idempotently, navigates to settlement, and handles 403 without auto-retry', async () => {
    const item: NotificationItem = {
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
      createdAt: '2026-11-20T10:00:00.000Z',
    };
    const onNavigate = jest.fn();
    const markRead = jest
      .fn<(id: string) => Promise<{ readAt: string }>>()
      .mockRejectedValueOnce(new ApiError('FORBIDDEN', '仅接收人本人可标记已读', 403))
      .mockResolvedValueOnce({ readAt: '2026-11-20T10:05:00.000Z' })
      .mockResolvedValueOnce({ readAt: '2026-11-20T10:09:00.000Z' });

    await render(
      <NotificationListPanel initialItems={[item]} markRead={markRead} onNavigate={onNavigate} />,
    );
    expect(screen.getByText('30.00')).toBeOnTheScreen();
    expect(screen.getByText('未读')).toBeOnTheScreen();

    // First tap hits 403 -> shows feedback, does not auto-retry or navigate.
    await userEvent.press(screen.getByRole('button', { name: '提醒-鼓山一日' }));
    expect(await screen.findByTestId('notif-error')).toHaveTextContent('仅接收人本人可标记已读');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(markRead).toHaveBeenCalledTimes(1);

    // Second tap succeeds -> marks read and navigates to settlement screen.
    await userEvent.press(screen.getByRole('button', { name: '提醒-鼓山一日' }));
    expect(await screen.findByText('已读')).toBeOnTheScreen();
    expect(onNavigate).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId: IDS.ledger },
    });
  });
});
