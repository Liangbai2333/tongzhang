import { describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { EndpointOutput, NotificationItem } from '@tongzhang/contracts';
import { InviteCodeField } from '../src/features/invitations/components/InviteCodeField';
import { NotificationsSheet } from '../src/features/profile/components/NotificationsSheet';
import { formatNotificationTime } from '../src/features/profile/notifications';
import { ExpenseForm } from '../src/features/expenses/components/ExpenseForm';
import { profileApi } from '../src/features/profile/api';
import { expensesApi } from '../src/features/expenses/api';
import { createQueryClient } from '../src/lib/query-client';

const userId = '00000000-0000-4000-8000-0000000000a1';
const memberBId = '00000000-0000-4000-8000-0000000000b2';
const ledgerId = '00000000-0000-4000-8000-0000000000c1';
const transferId = '00000000-0000-4000-8000-0000000000d1';
const notifId = '00000000-0000-4000-8000-0000000000f1';

jest.mock('../src/features/profile/api', () => ({
  profileApi: {
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
  },
}));

jest.mock('../src/features/expenses/api', () => ({
  expensesApi: {
    createExpense: jest.fn(),
    parseExpenseDraft: jest.fn(),
    updateExpense: jest.fn(),
  },
}));

jest.mock('../src/features/images/api', () => ({
  imagesApi: { upload: jest.fn(), read: jest.fn() },
}));

jest.mock('../src/features/images/receipt-files', () => ({
  selectReceipt: jest.fn(),
  removeReceiptFile: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
  },
  Stack: { Screen: () => null },
}));

jest.mock('../src/icons/FigmaAsset', () => {
  const asset = { source: 1, width: 20, height: 20 };
  const group = new Proxy({}, { get: () => asset });
  return { FigmaAsset: () => null, figmaAssets: new Proxy({}, { get: () => group }) };
});

function makeActiveLedger(): EndpointOutput<'getLedger'>['data'] {
  return {
    id: ledgerId,
    name: '鼓山一日',
    coverKey: 'mountain',
    coverImageId: null,
    status: 'ACTIVE',
    version: 1,
    memberCount: 2,
    expenseTotalCents: '0',
    myRemainingNetCents: '0',
    archivedAt: null,
    createdAt: '2026-11-21T06:00:00.000Z',
    creatorUserId: userId,
    myMemberId: userId,
    myPaidCents: '0',
    mySharedCents: '0',
    myNetCents: '0',
    members: [
      {
        id: userId,
        userId,
        username: '小安',
        role: 'CREATOR',
        joinedAt: '2026-11-21T06:00:00.000Z',
        netCents: '0',
        remainingNetCents: '0',
      },
      {
        id: memberBId,
        userId: memberBId,
        username: '小白',
        role: 'MEMBER',
        joinedAt: '2026-11-21T06:00:00.000Z',
        netCents: '0',
        remainingNetCents: '0',
      },
    ],
  };
}

describe('B20 mobile UI defect fixes (#169: D-142-01, D-158-01, D-158-02)', () => {
  it('D-142-01: hides underlying TextInput while join preview or scanner overlay is open and restores on close', async () => {
    const onChangeText = jest.fn();
    const { rerender } = await render(
      <InviteCodeField
        value="XD3EHF"
        disabled={false}
        overlayOpen={false}
        onChangeText={onChangeText}
        error={null}
      />,
    );
    expect(screen.getByLabelText('6 位邀请码')).toBeOnTheScreen();

    await rerender(
      <InviteCodeField
        value="XD3EHF"
        disabled={false}
        overlayOpen={true}
        onChangeText={onChangeText}
        error={null}
      />,
    );
    expect(screen.queryByLabelText('6 位邀请码')).toBeNull();
    expect(screen.getByText('X', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('F', { includeHiddenElements: true })).toBeOnTheScreen();

    await rerender(
      <InviteCodeField
        value="XD3EHF"
        disabled={false}
        overlayOpen={false}
        onChangeText={onChangeText}
        error={null}
      />,
    );
    expect(screen.getByLabelText('6 位邀请码')).toBeOnTheScreen();
  });

  it('D-158-01: formats notification timestamps deterministically as YYYY-MM-DD HH:mm without AM/PM locale drift', async () => {
    const iso = '2026-11-21T06:19:21.000Z';
    const formatted = formatNotificationTime(iso);
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatted).not.toMatch(/AM|PM|\//i);
    expect(formatNotificationTime('not-a-date')).toBe('not-a-date');

    const item: NotificationItem = {
      id: notifId,
      type: 'SETTLEMENT_REMINDER',
      ledgerId,
      ledgerName: '鼓山一日',
      transferId,
      actorUserId: memberBId,
      actorName: '小安',
      amountCents: '6000',
      note: null,
      readAt: null,
      createdAt: iso,
    };
    jest.mocked(profileApi.listNotifications).mockResolvedValue({
      data: [item],
      page: { nextCursor: null },
    });

    await render(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationsSheet visible={true} userId={userId} onClose={() => undefined} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(`${formatted} · 点击查看结算页`)).toBeOnTheScreen();
  });

  it('D-158-02: renders AI draft prefill notice title with single-line constraint', async () => {
    jest.mocked(expensesApi.parseExpenseDraft).mockResolvedValue({
      data: {
        title: '鼓山门票',
        amountCents: '12000',
        category: 'TICKET',
        occurredOn: '2026-11-21',
        payerMemberId: userId,
        note: null,
        receiptImageId: null,
        splitMode: 'EQUAL',
        splits: [{ memberId: userId }, { memberId: memberBId }],
        warnings: ['已按文本推断消费日期为今天，请核对实际消费日期后再保存。'],
      },
    });

    await render(
      <QueryClientProvider client={createQueryClient()}>
        <ExpenseForm ledger={makeActiveLedger()} userId={userId} />
      </QueryClientProvider>,
    );

    await userEvent.press(screen.getByRole('button', { name: 'AI 生成草稿' }));
    await userEvent.type(screen.getByLabelText('消费描述'), '鼓山门票 120');
    await userEvent.press(screen.getByRole('button', { name: '生成消费草稿' }));

    const bannerTitle = await screen.findByText('AI 草稿已回填，请核对后手动点击「保存消费」');
    expect(bannerTitle.props.numberOfLines).toBe(1);
  });
});
