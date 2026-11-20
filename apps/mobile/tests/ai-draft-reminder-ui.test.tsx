import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { EndpointOutput, NotificationItem } from '@tongzhang/contracts';
import CreateExpenseScreen from '../src/features/expenses/screens/CreateExpenseScreen';
import { ExpenseForm } from '../src/features/expenses/components/ExpenseForm';
import SettlementRecordScreen from '../src/features/settlements/screens/SettlementRecordScreen';
import AccountScreen from '../src/features/profile/screens/AccountScreen';
import LedgerListScreen from '../src/features/ledgers/screens/LedgerListScreen';
import { ledgersApi } from '../src/features/ledgers/api';
import { expensesApi } from '../src/features/expenses/api';
import { imagesApi } from '../src/features/images/api';
import { selectReceipt } from '../src/features/images/receipt-files';
import { settlementsApi } from '../src/features/settlements/api';
import { profileApi } from '../src/features/profile/api';
import { ApiError } from '../src/lib/api-error';
import { createQueryClient } from '../src/lib/query-client';

const creatorId = '00000000-0000-4000-8000-000000000001';
const ledgerId = '00000000-0000-4000-8000-000000000002';
const memberId = '00000000-0000-4000-8000-000000000003';
const transferId = '00000000-0000-4000-8000-000000000004';
const batchId = '00000000-0000-4000-8000-000000000005';
const notificationId1 = '00000000-0000-4000-8000-000000000006';
const notificationId2 = '00000000-0000-4000-8000-000000000007';
const expenseId = '00000000-0000-4000-8000-000000000008';
const receiptImageId = '00000000-0000-4000-8000-000000000009';

let mockUserId = creatorId;
let mockKeyNumber = 0;

jest.mock('../src/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: mockUserId,
      username: mockUserId === creatorId ? '小安' : '小白',
      email: 'user@example.test',
      notificationEnabled: true,
    },
    operation: null,
    logout: jest.fn(),
    restore: jest.fn(),
    syncUser: jest.fn(),
  }),
}));

jest.mock('../src/features/ledgers/api', () => ({
  ledgersApi: {
    getLedger: jest.fn(),
    listLedgers: jest.fn(),
    archiveLedger: jest.fn(),
  },
}));

jest.mock('../src/features/expenses/api', () => ({
  expensesApi: {
    createExpense: jest.fn(),
    parseExpenseDraft: jest.fn(),
    updateExpense: jest.fn(),
  },
}));

jest.mock('../src/features/settlements/api', () => ({
  settlementsApi: {
    getSettlement: jest.fn(),
    markTransferPaid: jest.fn(),
    remindTransfer: jest.fn(),
    settleLedger: jest.fn(),
  },
}));

jest.mock('../src/features/profile/api', () => ({
  profileApi: {
    updateProfile: jest.fn(),
    updatePreferences: jest.fn(),
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
  },
}));

jest.mock('../src/features/images/api', () => ({
  imagesApi: { upload: jest.fn(), read: jest.fn() },
}));

jest.mock('../src/features/images/receipt-files', () => ({
  selectReceipt: jest.fn(),
  removeReceiptFile: jest.fn(),
}));

jest.mock('../src/lib/api', () => ({
  createIdempotencyKey: () => `b13-key-${++mockKeyNumber}`,
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

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
  useLocalSearchParams: () => ({ ledgerId }),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));

jest.mock('../src/icons/FigmaAsset', () => {
  const asset = { source: 1, width: 20, height: 20 };
  const group = new Proxy({}, { get: () => asset });
  return { FigmaAsset: () => null, figmaAssets: new Proxy({}, { get: () => group }) };
});

const timestamp = '2026-11-20T08:00:00.000Z';

function makeLedger(
  status: 'ACTIVE' | 'SETTLING' | 'SETTLED' = 'ACTIVE',
  myMemberId = creatorId,
): EndpointOutput<'getLedger'>['data'] {
  return {
    id: ledgerId,
    name: '鼓山一日',
    coverKey: 'mountain',
    coverImageId: null,
    status,
    version: 3,
    memberCount: 2,
    expenseTotalCents: '12000',
    myRemainingNetCents: myMemberId === creatorId ? '6000' : '-6000',
    archivedAt: null,
    createdAt: timestamp,
    creatorUserId: creatorId,
    myMemberId,
    myPaidCents: myMemberId === creatorId ? '12000' : '0',
    mySharedCents: '6000',
    myNetCents: myMemberId === creatorId ? '6000' : '-6000',
    members: [
      {
        id: creatorId,
        userId: creatorId,
        username: '小安',
        role: 'CREATOR',
        joinedAt: timestamp,
        netCents: '6000',
        remainingNetCents: '6000',
      },
      {
        id: memberId,
        userId: memberId,
        username: '小白',
        role: 'MEMBER',
        joinedAt: timestamp,
        netCents: '-6000',
        remainingNetCents: '-6000',
      },
    ],
  };
}

function makeSettlement(
  ledgerStatus: 'SETTLING' | 'SETTLED' = 'SETTLING',
  transferStatus: 'PENDING' | 'PAID' = 'PENDING',
): EndpointOutput<'getSettlement'>['data'] {
  return {
    id: batchId,
    ledgerId,
    sourceVersion: 3,
    expenseTotalCents: '12000',
    transferTotalCents: '6000',
    transferCount: 1,
    algorithmVersion: 'exact-min-transfers-v1',
    createdAt: timestamp,
    ledgerStatus,
    transfers: [
      {
        id: transferId,
        sequence: 1,
        payerMemberId: memberId,
        payeeMemberId: creatorId,
        amountCents: '6000',
        status: transferStatus,
        registeredByMemberId: transferStatus === 'PAID' ? creatorId : null,
        registeredAt: transferStatus === 'PAID' ? timestamp : null,
        registrationNote: null,
      },
    ],
    progress: {
      paidCount: transferStatus === 'PAID' ? 1 : 0,
      totalCount: 1,
      remainingCents: transferStatus === 'PAID' ? '0' : '6000',
    },
    netSnapshot: [
      { memberId: creatorId, netCents: '6000' },
      { memberId, netCents: '-6000' },
    ],
  };
}

async function renderWithQuery(node: React.ReactElement) {
  return render(<QueryClientProvider client={createQueryClient()}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = creatorId;
  mockKeyNumber = 0;
  jest.mocked(ledgersApi.listLedgers).mockResolvedValue({
    data: [],
    page: { nextCursor: null },
  });
});

describe('B13 ExpenseForm AI draft helper (A31 -> ExpenseForm -> manual A13)', () => {
  it('prefills editable form with integer-cent conversion and warnings without auto-saving', async () => {
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: makeLedger('ACTIVE') });
    jest.mocked(expensesApi.parseExpenseDraft).mockResolvedValue({
      data: {
        title: '食堂午餐',
        amountCents: '12050',
        category: 'DINING',
        occurredOn: '2026-11-20',
        payerMemberId: memberId,
        note: '小安与小白聚餐',
        receiptImageId: null,
        splitMode: 'EQUAL',
        splits: [{ memberId: creatorId }, { memberId }],
        warnings: ['日期已按参考日期推断，请核对'],
      },
    });
    jest.mocked(expensesApi.createExpense).mockResolvedValue({
      data: {
        id: expenseId,
        ledgerId,
        title: '食堂午餐',
        amountCents: '12050',
        category: 'DINING',
        occurredOn: '2026-11-20',
        payerMemberId: memberId,
        payerName: '小白',
        version: 1,
        recorderMemberId: creatorId,
        recorderName: '小安',
        splitMode: 'EQUAL',
        splits: [
          { memberId: creatorId, username: '小安', shares: null, amountCents: '6025' },
          { memberId, username: '小白', shares: null, amountCents: '6025' },
        ],
        note: '小安与小白聚餐',
        receiptImageId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        canEdit: true,
      },
    });

    await renderWithQuery(<CreateExpenseScreen />);
    await screen.findByText('AI 辅助填写');

    await userEvent.press(screen.getByRole('button', { name: 'AI 生成草稿' }));
    await userEvent.type(screen.getByLabelText('消费描述'), '小白付了食堂午餐 120.5 元两人均分');
    await userEvent.press(screen.getByRole('button', { name: '生成消费草稿' }));

    expect(
      await screen.findByText(/AI 草稿已回填，请核对后手动点击「保存消费」/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/日期已按参考日期推断，请核对/)).toBeOnTheScreen();
    expect(screen.getByLabelText('消费金额')).toHaveDisplayValue('120.50');
    expect(screen.getByLabelText('消费名称')).toHaveDisplayValue('食堂午餐');
    // Must NEVER auto-persist via A13
    expect(expensesApi.createExpense).not.toHaveBeenCalled();

    // User manually confirms and saves via A13
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    await waitFor(() => expect(expensesApi.createExpense).toHaveBeenCalledTimes(1));
    expect(expensesApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { ledgerId },
        body: expect.objectContaining({
          title: '食堂午餐',
          amountCents: '12050',
          payerMemberId: memberId,
        }),
      }),
      { idempotencyKey: 'b13-key-1' },
    );
  });

  it('preserves manual inputs on 503 AI_DRAFT_UNAVAILABLE and 502 AI_DRAFT_UPSTREAM_ERROR without auto-retry', async () => {
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: makeLedger('ACTIVE') });
    jest
      .mocked(expensesApi.parseExpenseDraft)
      .mockRejectedValueOnce(new ApiError('AI_DRAFT_UPSTREAM_ERROR', 'upstream failed', 502))
      .mockRejectedValueOnce(new ApiError('AI_DRAFT_UNAVAILABLE', 'disabled', 503));

    await renderWithQuery(<CreateExpenseScreen />);
    await screen.findByText('AI 辅助填写');

    await userEvent.type(screen.getByLabelText('消费金额'), '88.00');
    await userEvent.type(screen.getByLabelText('消费名称'), '手工消费');

    await userEvent.press(screen.getByRole('button', { name: 'AI 生成草稿' }));
    await userEvent.type(screen.getByLabelText('消费描述'), '午餐 88 元');
    await userEvent.press(screen.getByRole('button', { name: '生成消费草稿' }));

    expect(await screen.findByText(/AI 解析服务暂时不可用/)).toBeOnTheScreen();
    expect(expensesApi.parseExpenseDraft).toHaveBeenCalledTimes(1);

    // Manual retry allowed on 502; second call returns 503 unavailable
    await userEvent.press(screen.getByRole('button', { name: '手动重试解析' }));
    expect(await screen.findByText(/服务端暂未启用 AI 辅助记账/)).toBeOnTheScreen();
    expect(expensesApi.parseExpenseDraft).toHaveBeenCalledTimes(2);

    await userEvent.press(screen.getByRole('button', { name: '改用手填' }));
    // Existing form inputs stay intact
    expect(screen.getByLabelText('消费金额')).toHaveDisplayValue('88.00');
    expect(screen.getByLabelText('消费名称')).toHaveDisplayValue('手工消费');
    expect(expensesApi.createExpense).not.toHaveBeenCalled();
  });

  it('refreshes ledger state when A31 returns 409 LEDGER_FROZEN', async () => {
    jest
      .mocked(ledgersApi.getLedger)
      .mockResolvedValueOnce({ data: makeLedger('ACTIVE') })
      .mockResolvedValueOnce({ data: makeLedger('SETTLING') });
    jest
      .mocked(expensesApi.parseExpenseDraft)
      .mockRejectedValueOnce(new ApiError('LEDGER_FROZEN', 'ledger frozen', 409));

    await renderWithQuery(<CreateExpenseScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'AI 生成草稿' }));
    await userEvent.type(screen.getByLabelText('消费描述'), '晚饭 50 元');
    await userEvent.press(screen.getByRole('button', { name: '生成消费草稿' }));

    expect(await screen.findByText(/账本已进入结算或结清状态/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '刷新账本状态' }));
    expect(await screen.findByText('账本已冻结，无法新增消费。')).toBeOnTheScreen();
  });

  it('reuses a single uploaded receipt across A31 AMOUNT draft prefill and manual A13 createExpense', async () => {
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: makeLedger('ACTIVE') });
    jest.mocked(selectReceipt).mockResolvedValue({
      uri: 'file:///cache/receipt-1.jpg',
      byteSize: 4096,
    });
    jest.mocked(imagesApi.upload).mockResolvedValue({
      data: {
        imageId: receiptImageId,
        mimeType: 'image/jpeg',
        byteSize: 4096,
        width: 100,
        height: 100,
      },
    });
    jest.mocked(expensesApi.parseExpenseDraft).mockResolvedValue({
      data: {
        title: '收据识别消费',
        amountCents: '12000',
        category: 'DINING',
        occurredOn: '2026-11-20',
        payerMemberId: creatorId,
        note: '扫码账单',
        receiptImageId,
        splitMode: 'AMOUNT',
        splits: [
          { memberId: creatorId, amountCents: '12000' },
          { memberId, amountCents: '0' },
        ],
        warnings: ['按收据金额拆分，请核对'],
      },
    });
    jest.mocked(expensesApi.createExpense).mockResolvedValue({
      data: {
        id: expenseId,
        ledgerId,
        title: '收据识别消费',
        amountCents: '12000',
        category: 'DINING',
        occurredOn: '2026-11-20',
        payerMemberId: creatorId,
        payerName: '小安',
        version: 1,
        recorderMemberId: creatorId,
        recorderName: '小安',
        splitMode: 'AMOUNT',
        splits: [
          { memberId: creatorId, username: '小安', shares: null, amountCents: '12000' },
          { memberId, username: '小白', shares: null, amountCents: '0' },
        ],
        note: '扫码账单',
        receiptImageId,
        createdAt: timestamp,
        updatedAt: timestamp,
        canEdit: true,
      },
    });

    await renderWithQuery(<CreateExpenseScreen />);
    await screen.findByText('AI 辅助填写');

    await userEvent.press(screen.getByRole('button', { name: '从相册选择' }));
    expect(await screen.findByText('已添加收据')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'AI 生成草稿' }));
    await userEvent.press(screen.getByRole('button', { name: '生成消费草稿' }));

    expect(
      await screen.findByText(/AI 草稿已回填，请核对后手动点击「保存消费」/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/按收据金额拆分，请核对/)).toBeOnTheScreen();
    expect(screen.getByLabelText('消费金额')).toHaveDisplayValue('120.00');
    expect(screen.getByLabelText('消费名称')).toHaveDisplayValue('收据识别消费');
    expect(imagesApi.upload).toHaveBeenCalledTimes(1);
    expect(imagesApi.upload).toHaveBeenCalledWith(
      { kind: 'RECEIPT', ledgerId },
      expect.objectContaining({ uri: 'file:///cache/receipt-1.jpg', type: 'image/jpeg' }),
    );
    expect(expensesApi.parseExpenseDraft).toHaveBeenCalledTimes(1);
    const parseCall = jest.mocked(expensesApi.parseExpenseDraft).mock.calls[0]![0];
    expect(parseCall.params).toEqual({ ledgerId });
    expect(parseCall.body.receiptImageId).toBe(receiptImageId);
    expect(parseCall.body.text).toBeUndefined();
    expect(expensesApi.createExpense).not.toHaveBeenCalled();

    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    await waitFor(() => expect(expensesApi.createExpense).toHaveBeenCalledTimes(1));
    expect(expensesApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { ledgerId },
        body: expect.objectContaining({
          amountCents: '12000',
          splitMode: 'AMOUNT',
          splits: [
            { memberId: creatorId, amountCents: '12000' },
            { memberId, amountCents: '0' },
          ],
          receiptImageId,
        }),
      }),
      { idempotencyKey: 'b13-key-1' },
    );
    expect(imagesApi.upload).toHaveBeenCalledTimes(1);
  });

  it('preserves existing ExpenseForm inputs when draft returns null fields alongside warnings', async () => {
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: makeLedger('ACTIVE') });
    jest.mocked(expensesApi.parseExpenseDraft).mockResolvedValue({
      data: {
        title: null,
        amountCents: null,
        category: 'DINING',
        occurredOn: null,
        payerMemberId: null,
        note: null,
        receiptImageId: null,
        splitMode: 'EQUAL',
        splits: [],
        warnings: ['未能识别有效金额，请手动填写'],
      },
    });

    await renderWithQuery(<CreateExpenseScreen />);
    await screen.findByText('AI 辅助填写');

    await userEvent.type(screen.getByLabelText('消费金额'), '66.50');
    await userEvent.type(screen.getByLabelText('消费名称'), '手工标题');
    await userEvent.type(screen.getByLabelText('备注（选填）'), '保留的手工备注');

    await userEvent.press(screen.getByRole('button', { name: 'AI 生成草稿' }));
    await userEvent.type(screen.getByLabelText('消费描述'), '不太清楚金额');
    await userEvent.press(screen.getByRole('button', { name: '生成消费草稿' }));

    expect(
      await screen.findByText(/AI 草稿已回填，请核对后手动点击「保存消费」/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/未能识别有效金额，请手动填写/)).toBeOnTheScreen();
    expect(screen.getByLabelText('消费金额')).toHaveDisplayValue('66.50');
    expect(screen.getByLabelText('消费名称')).toHaveDisplayValue('手工标题');
    expect(screen.getByLabelText('备注（选填）')).toHaveDisplayValue('保留的手工备注');
    expect(expensesApi.createExpense).not.toHaveBeenCalled();
  });

  it('hides the AI draft entry when ExpenseForm is in edit mode', async () => {
    const editableExpense: EndpointOutput<'getExpense'>['data'] = {
      id: expenseId,
      ledgerId,
      title: '已保存消费',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-20',
      payerMemberId: creatorId,
      payerName: '小安',
      version: 1,
      recorderMemberId: creatorId,
      recorderName: '小安',
      splitMode: 'EQUAL',
      splits: [
        { memberId: creatorId, username: '小安', shares: null, amountCents: '6000' },
        { memberId, username: '小白', shares: null, amountCents: '6000' },
      ],
      note: '原备注',
      receiptImageId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      canEdit: true,
    };

    await renderWithQuery(
      <ExpenseForm ledger={makeLedger('ACTIVE')} userId={creatorId} expense={editableExpense} />,
    );
    expect(await screen.findByLabelText('消费名称')).toHaveDisplayValue('已保存消费');
    expect(screen.queryByText('AI 辅助填写')).toBeNull();
    expect(screen.queryByRole('button', { name: 'AI 生成草稿' })).toBeNull();
  });
});

describe('B13 SettlementRecordScreen remind-confirm sheet (A32)', () => {
  it('allows payee/creator to send reminder, enters 6h cooldown, and never leaks notification preference', async () => {
    const settlingLedger = makeLedger('SETTLING', creatorId);
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: settlingLedger });
    jest.mocked(settlementsApi.getSettlement).mockResolvedValue({
      data: makeSettlement('SETTLING', 'PENDING'),
    });
    jest.mocked(settlementsApi.remindTransfer).mockResolvedValue({
      data: {
        ledgerId,
        transferId,
        remindedAt: '2026-11-20T08:00:00.000Z',
        cooldownEndsAt: '2099-11-20T14:00:00.000Z',
      },
    });

    await renderWithQuery(<SettlementRecordScreen ledger={settlingLedger} />);
    const remindButton = await screen.findByRole('button', { name: '提醒对方' });

    await userEvent.press(remindButton);
    expect(screen.getByText('发送待还提醒')).toBeOnTheScreen();
    await userEvent.type(screen.getByLabelText('催还备注（选填）'), '方便时确认一下');
    await userEvent.press(screen.getByRole('button', { name: '确认发送提醒' }));

    await waitFor(() => expect(settlementsApi.remindTransfer).toHaveBeenCalledTimes(1));
    expect(settlementsApi.remindTransfer).toHaveBeenCalledWith(
      {
        params: { ledgerId, transferId },
        query: {},
        body: { note: '方便时确认一下' },
      },
      { idempotencyKey: 'b13-key-1' },
    );
    expect(await screen.findByText('已发送站内催还提醒，6 小时内不可重复催还。')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '已催还（冷却中）' })).toBeDisabled();
  });

  it('hides remind button for the payer of the transfer', async () => {
    mockUserId = memberId;
    const settlingLedger = makeLedger('SETTLING', memberId);
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: settlingLedger });
    jest.mocked(settlementsApi.getSettlement).mockResolvedValue({
      data: makeSettlement('SETTLING', 'PENDING'),
    });

    await renderWithQuery(<SettlementRecordScreen ledger={settlingLedger} />);
    await screen.findByText('待完成转账');
    expect(screen.queryByRole('button', { name: '提醒对方' })).toBeNull();
  });

  it('preserves note and Idempotency-Key across uncertain timeout and forbids auto-retry', async () => {
    const settlingLedger = makeLedger('SETTLING', creatorId);
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: settlingLedger });
    jest.mocked(settlementsApi.getSettlement).mockResolvedValue({
      data: makeSettlement('SETTLING', 'PENDING'),
    });
    jest
      .mocked(settlementsApi.remindTransfer)
      .mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', 'timeout'))
      .mockResolvedValueOnce({
        data: {
          ledgerId,
          transferId,
          remindedAt: '2026-11-20T08:00:00.000Z',
          cooldownEndsAt: '2099-11-20T14:00:00.000Z',
        },
      });

    await renderWithQuery(<SettlementRecordScreen ledger={settlingLedger} />);
    await userEvent.press(await screen.findByRole('button', { name: '提醒对方' }));
    await userEvent.type(screen.getByLabelText('催还备注（选填）'), '请核对转账');
    await userEvent.press(screen.getByRole('button', { name: '确认发送提醒' }));

    expect(await screen.findByText(/网络或服务响应不确定，已保留原请求标识/)).toBeOnTheScreen();
    expect(settlementsApi.remindTransfer).toHaveBeenCalledTimes(1);

    // Reconciling while transfer is still SETTLING + PENDING keeps sheet mounted to preserve key/note
    await userEvent.press(screen.getByRole('button', { name: '刷新结算页核对' }));
    expect(await screen.findByText(/该笔转账仍为待还状态；为保留原请求标识/)).toBeOnTheScreen();
    expect(settlementsApi.remindTransfer).toHaveBeenCalledTimes(1);

    // Manual retry reuses the exact same Idempotency-Key
    await userEvent.press(screen.getByRole('button', { name: '手动重试催还' }));
    await waitFor(() => expect(settlementsApi.remindTransfer).toHaveBeenCalledTimes(2));
    expect(settlementsApi.remindTransfer).toHaveBeenNthCalledWith(
      2,
      {
        params: { ledgerId, transferId },
        query: {},
        body: { note: '请核对转账' },
      },
      { idempotencyKey: 'b13-key-1' },
    );
  });

  it('shows 6h cooldown feedback on 429 REMINDER_COOLDOWN without leaking notification preference', async () => {
    const settlingLedger = makeLedger('SETTLING', creatorId);
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: settlingLedger });
    jest.mocked(settlementsApi.getSettlement).mockResolvedValue({
      data: makeSettlement('SETTLING', 'PENDING'),
    });
    jest
      .mocked(settlementsApi.remindTransfer)
      .mockRejectedValueOnce(new ApiError('REMINDER_COOLDOWN', 'cooldown', 429));

    await renderWithQuery(<SettlementRecordScreen ledger={settlingLedger} />);
    await userEvent.press(await screen.findByRole('button', { name: '提醒对方' }));
    await userEvent.press(screen.getByRole('button', { name: '确认发送提醒' }));

    expect(await screen.findByText(/6 小时催还冷却期内/)).toBeOnTheScreen();
    expect(screen.queryByText(/关闭通知|notificationEnabled/)).toBeNull();
    expect(settlementsApi.remindTransfer).toHaveBeenCalledTimes(1);
  });
});

describe('B13 In-app notifications list, unreadOnly filter, mark read & deep link (A33/A34)', () => {
  const unreadItem: NotificationItem = {
    id: notificationId1,
    type: 'SETTLEMENT_REMINDER',
    ledgerId,
    ledgerName: '鼓山一日',
    transferId,
    actorUserId: creatorId,
    actorName: '小安',
    amountCents: '6000',
    note: '请核对这笔还款',
    readAt: null,
    createdAt: timestamp,
  };
  const readItem: NotificationItem = {
    id: notificationId2,
    type: 'SETTLEMENT_REMINDER',
    ledgerId,
    ledgerName: '周末露营',
    transferId,
    actorUserId: creatorId,
    actorName: '小安',
    amountCents: '3000',
    note: null,
    readAt: timestamp,
    createdAt: timestamp,
  };

  it('opens notifications from AccountScreen, filters unreadOnly, marks read via A34 and navigates to settlement', async () => {
    jest.mocked(profileApi.listNotifications).mockImplementation(async ({ query }) => ({
      data: query.unreadOnly === 'true' ? [unreadItem] : [unreadItem, readItem],
      page: { nextCursor: null },
    }));
    jest.mocked(profileApi.markNotificationRead).mockResolvedValue({
      data: { notificationId: notificationId1, readAt: '2026-11-20T09:00:00.000Z' },
    });

    await renderWithQuery(<AccountScreen />);
    await userEvent.press(await screen.findByRole('button', { name: '站内提醒' }));

    expect(await screen.findByText('鼓山一日')).toBeOnTheScreen();
    expect(screen.getByText('周末露营')).toBeOnTheScreen();
    expect(screen.getByText(/小安 提醒你处理待还转账 ¥60\.00/)).toBeOnTheScreen();

    // Switch to unreadOnly filter
    await userEvent.press(screen.getByRole('button', { name: '仅看未读' }));
    await waitFor(() =>
      expect(profileApi.listNotifications).toHaveBeenCalledWith({
        params: {},
        query: { unreadOnly: 'true', limit: 20, cursor: undefined },
        body: undefined,
      }),
    );
    expect(screen.queryByText('周末露营')).toBeNull();

    // Tap unread notification -> A34 markNotificationRead -> navigate to ledger settlement
    await userEvent.press(screen.getByRole('button', { name: /鼓山一日.*未读/ }));
    await waitFor(() =>
      expect(profileApi.markNotificationRead).toHaveBeenCalledWith({
        params: { notificationId: notificationId1 },
        query: {},
        body: undefined,
      }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId },
    });
  });

  it('exposes notifications entry on LedgerListScreen and navigates directly for already-read items', async () => {
    jest.mocked(profileApi.listNotifications).mockResolvedValue({
      data: [readItem],
      page: { nextCursor: null },
    });

    await renderWithQuery(<LedgerListScreen />);
    await userEvent.press(await screen.findByRole('button', { name: '站内提醒' }));

    expect(await screen.findByText('周末露营')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: /周末露营.*已读/ }));
    expect(profileApi.markNotificationRead).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId },
    });
  });

  it('shows inline error without navigating or auto-retrying when A34 markNotificationRead fails', async () => {
    jest.mocked(profileApi.listNotifications).mockResolvedValue({
      data: [unreadItem],
      page: { nextCursor: null },
    });
    jest
      .mocked(profileApi.markNotificationRead)
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline'));

    await renderWithQuery(<AccountScreen />);
    await userEvent.press(await screen.findByRole('button', { name: '站内提醒' }));
    await userEvent.press(await screen.findByRole('button', { name: /鼓山一日.*未读/ }));

    expect(await screen.findByText(/网络异常，请检查连接后手动重试/)).toBeOnTheScreen();
    expect(profileApi.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });
});
