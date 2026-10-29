import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { setStringAsync } from 'expo-clipboard';
import type { EndpointOutput } from '@tongzhang/contracts';
import SettlementPreviewScreen from '../src/features/settlements/screens/SettlementPreviewScreen';
import { ledgersApi } from '../src/features/ledgers/api';
import { settlementsApi } from '../src/features/settlements/api';
import { ApiError } from '../src/lib/api-error';
import { createQueryClient } from '../src/lib/query-client';
const userId = '00000000-0000-4000-8000-000000000001';
const ledgerId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
let mockUserId = userId;
let mockKeyNumber = 0;
let mockLedgerId = ledgerId;
jest.mock('../src/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: mockUserId } }),
}));
jest.mock('../src/features/ledgers/api', () => ({
  ledgersApi: { getLedger: jest.fn(), archiveLedger: jest.fn() },
}));
jest.mock('../src/features/settlements/api', () => ({
  settlementsApi: {
    previewSettlement: jest.fn(),
    startSettlement: jest.fn(),
    getSettlement: jest.fn(),
    markTransferPaid: jest.fn(),
    settleLedger: jest.fn(),
  },
}));
jest.mock('../src/lib/api', () => ({
  createIdempotencyKey: () => `settlement-key-${++mockKeyNumber}`,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ ledgerId: mockLedgerId }),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));
jest.mock('../src/icons/FigmaAsset', () => ({
  FigmaAsset: () => null,
  figmaAssets: new Proxy(
    {},
    { get: () => new Proxy({}, { get: () => ({ source: 1, width: 20, height: 20 }) }) },
  ),
}));
const timestamp = '2026-10-25T00:00:00.000Z';
const ledger: EndpointOutput<'getLedger'>['data'] = {
  id: ledgerId,
  name: '山野同行',
  coverKey: 'mountain',
  coverImageId: null,
  status: 'ACTIVE',
  version: 2,
  memberCount: 2,
  expenseTotalCents: '12000',
  myRemainingNetCents: '6000',
  archivedAt: null,
  createdAt: timestamp,
  creatorUserId: userId,
  myMemberId: userId,
  myPaidCents: '12000',
  mySharedCents: '6000',
  myNetCents: '6000',
  members: [
    {
      id: userId,
      userId,
      username: '小安',
      role: 'CREATOR',
      joinedAt: timestamp,
      netCents: '6000',
      remainingNetCents: '6000',
    },
    {
      id: otherId,
      userId: otherId,
      username: '小白',
      role: 'MEMBER',
      joinedAt: timestamp,
      netCents: '-6000',
      remainingNetCents: '-6000',
    },
  ],
};
const balances: EndpointOutput<'getBalances'>['data'] = {
  expenseTotalCents: '12000',
  members: [
    {
      memberId: userId,
      username: '小安',
      paidCents: '12000',
      sharedCents: '6000',
      netCents: '6000',
      remainingNetCents: '6000',
    },
    {
      memberId: otherId,
      username: '小白',
      paidCents: '0',
      sharedCents: '6000',
      netCents: '-6000',
      remainingNetCents: '-6000',
    },
  ],
};
const plan: EndpointOutput<'previewSettlement'>['data'] = {
  ledgerId,
  ledgerVersion: 2,
  expenseTotalCents: '12000',
  transferTotalCents: '6000',
  transferCount: 1,
  members: balances.members,
  transfers: [{ sequence: 1, payerMemberId: otherId, payeeMemberId: userId, amountCents: '6000' }],
  algorithmVersion: 'zero-sum-dp-v1',
};

const record: EndpointOutput<'getSettlement'>['data'] = {
  id: '00000000-0000-4000-8000-000000000004',
  ledgerId,
  sourceVersion: 2,
  expenseTotalCents: '12000',
  transferTotalCents: '6000',
  transferCount: 1,
  algorithmVersion: 'zero-sum-dp-v1',
  createdAt: timestamp,
  ledgerStatus: 'SETTLING',
  transfers: [
    {
      ...plan.transfers[0]!,
      id: otherId,
      status: 'PENDING',
      registeredByMemberId: null,
      registeredAt: null,
      registrationNote: null,
    },
  ],
  progress: { paidCount: 0, totalCount: 1, remainingCents: '6000' },
  netSnapshot: [
    { memberId: userId, netCents: '6000' },
    { memberId: otherId, netCents: '-6000' },
  ],
};
const get = jest.mocked(ledgersApi.getLedger);
const start = jest.mocked(settlementsApi.startSettlement);
const read = jest.mocked(settlementsApi.getSettlement);
const preview = jest.mocked(settlementsApi.previewSettlement);
async function show() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SettlementPreviewScreen />
    </QueryClientProvider>,
  );
}
async function pullToRefresh() {
  await act(async () => screen.getByTestId('screen-scroll').props.refreshControl.props.onRefresh());
}
async function confirm() {
  await screen.findByRole('button', { name: '正式发起结算' });
  await userEvent.press(screen.getByRole('button', { name: '正式发起结算' }));
}
beforeEach(() => {
  jest.clearAllMocks();
  for (const callback of [get, start, read, preview]) callback.mockReset();
  mockUserId = userId;
  mockKeyNumber = 0;
  jest.mocked(settlementsApi.markTransferPaid).mockReset();
  jest.mocked(settlementsApi.settleLedger).mockReset();
  mockLedgerId = ledgerId;
  jest.mocked(setStringAsync).mockResolvedValue(true);
  get.mockResolvedValue({ data: ledger });
  preview.mockResolvedValue({ data: plan });
  start.mockResolvedValue({ data: { batch: record, ledgerStatus: 'SETTLING' } });
  read.mockResolvedValue({ data: record });
});
describe('formal settlement UI with isolated API callbacks', () => {
  it('requires explicit confirmation, cancels without writing and uses the preview version', async () => {
    await show();
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '返回检查' }));
    expect(start).not.toHaveBeenCalled();
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    await screen.findByText('收付款记录');
    expect(start).toHaveBeenCalledWith(
      { params: { ledgerId }, query: {}, body: { expectedVersion: 2 } },
      { idempotencyKey: 'settlement-key-1' },
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByText('待完成转账')).toBeOnTheScreen();
    expect(screen.getByLabelText('付款人：小白')).toBeOnTheScreen();
    expect(screen.getByLabelText('收款人：小安')).toBeOnTheScreen();
  });
  it('does not expose freezing to an ordinary member', async () => {
    get.mockResolvedValue({ data: { ...ledger, creatorUserId: otherId } });
    await show();
    await screen.findByText('转账明细');
    expect(screen.queryByRole('button', { name: '正式发起结算' })).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });
  it('blocks duplicate presses and preserves the payload and key after an unknown result', async () => {
    let reject!: (cause: unknown) => void;
    start.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await show();
    await confirm();
    const button = screen.getByRole('button', { name: '确认冻结并结算' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '返回检查' })).toBeDisabled();
    await act(async () => reject(new ApiError('REQUEST_TIMEOUT', '提交超时')));
    await screen.findByText('提交超时');
    await userEvent.press(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('收付款记录');
    expect(start.mock.calls[0]).toEqual(start.mock.calls[1]);
  });
  it('checks an unknown result online without resubmitting and retains the key after a missing batch', async () => {
    start.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '网络中断'));
    await show();
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    read.mockRejectedValueOnce(new ApiError('SETTLEMENT_NOT_FOUND', '没有批次', 404));
    await userEvent.press(screen.getByRole('button', { name: '查询结算记录' }));
    await screen.findByText('还没有查到结算记录，可以重试提交。');
    expect(start).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '查询结算记录' }));
    await screen.findByText('收付款记录');
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('requires fresh online preview after a version conflict and confirms the new version only', async () => {
    start.mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', '版本已变化', 409));
    await show();
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    await screen.findByText('版本已变化');
    expect(screen.queryByRole('button', { name: '确认冻结并结算' })).toBeNull();
    get.mockResolvedValue({ data: { ...ledger, version: 3 } });
    preview.mockResolvedValue({ data: { ...plan, ledgerVersion: 3 } });
    await userEvent.press(screen.getAllByRole('button', { name: '刷新预览' })[0]!);
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    await screen.findByText('收付款记录');
    expect(start.mock.calls[1]?.[0].body).toEqual({ expectedVersion: 3 });
    expect(start.mock.calls[1]?.[1]?.idempotencyKey).not.toBe(
      start.mock.calls[0]?.[1]?.idempotencyKey,
    );
  });
  it.each(['FORBIDDEN', 'LEDGER_FROZEN'])('requires a state refresh for %s', async (code) => {
    start.mockRejectedValueOnce(new ApiError(code, '操作已不可用', 409));
    await show();
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    await screen.findByText('操作已不可用');
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '确认冻结并结算' })).toBeNull();
  });
  it('reopens the saved batch for a frozen ledger and hides stale data after a failed refresh', async () => {
    get.mockResolvedValue({ data: { ...ledger, status: 'SETTLING' } });
    const view = await show();
    await screen.findByText('收付款记录');
    await view.unmount();
    await show();
    await screen.findByText('收付款记录');
    expect(read).toHaveBeenCalledTimes(2);
    expect(preview).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    read.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '刷新中断'));
    await pullToRefresh();
    await screen.findByText('刷新中断');
    expect(screen.queryByText('收付款记录')).toBeNull();
  });
  it('shows a zero-transfer batch directly settled and renders registered metadata from A24', async () => {
    get.mockResolvedValue({ data: { ...ledger, status: 'SETTLED' } });
    read.mockResolvedValueOnce({
      data: {
        ...record,
        ledgerStatus: 'SETTLED',
        transfers: [],
        transferCount: 0,
        transferTotalCents: '0',
        progress: { paidCount: 0, totalCount: 0, remainingCents: '0' },
      },
    });
    await show();
    await screen.findByText('无需转账，账本已直接结清。');
    read.mockResolvedValueOnce({
      data: {
        ...record,
        transfers: [
          {
            ...record.transfers[0]!,
            status: 'PAID',
            registeredByMemberId: userId,
            registeredAt: timestamp,
            registrationNote: '线下收到',
          },
        ],
        progress: { paidCount: 1, totalCount: 1, remainingCents: '0' },
      },
    });
    await pullToRefresh();
    await screen.findByText(/^小安 登记于 /);
    expect(screen.getByText('备注：线下收到')).toBeOnTheScreen();
  });
  it('retains the known successful batch identifier when the subsequent online read fails', async () => {
    read.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '查询中断'));
    await show();
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    await screen.findByText('查询中断');
    expect(screen.getByText('结算已发起，不会重复提交。')).toBeOnTheScreen();
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('copies the saved transfer and full batch, and reports clipboard failures', async () => {
    get.mockResolvedValue({ data: { ...ledger, status: 'SETTLING' } });
    await show();
    await screen.findByText('收付款记录');
    await userEvent.press(screen.getByRole('button', { name: '复制第 1 笔转账信息' }));
    expect(setStringAsync).toHaveBeenLastCalledWith('小白 → 小安 ¥60.00 · 待登记');
    jest.mocked(setStringAsync).mockResolvedValueOnce(false);
    await userEvent.press(screen.getByRole('button', { name: '复制完整方案' }));
    await screen.findByText('复制失败，请稍后重试');
    expect(screen.queryByText('结算方案已复制')).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: '复制完整方案' }));
    await screen.findByText('结算方案已复制');
    expect(setStringAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('同账结算方案 · 山野同行'),
    );
    expect(start).not.toHaveBeenCalled();
  });
  it('never carries a successful batch into another ledger opened in the same route instance', async () => {
    const client = createQueryClient();
    const node = () => (
      <QueryClientProvider client={client}>
        <SettlementPreviewScreen />
      </QueryClientProvider>
    );
    const view = await render(node());
    await confirm();
    await userEvent.press(screen.getByRole('button', { name: '确认冻结并结算' }));
    await screen.findByText('收付款记录');
    mockLedgerId = otherId;
    get.mockResolvedValue({ data: { ...ledger, id: otherId } });
    await view.rerender(node());
    await screen.findByRole('button', { name: '正式发起结算' });
    expect(screen.queryByText('收付款记录')).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

const paidRecord = {
  ...record,
  transfers: record.transfers.map((t) => ({
    ...t,
    status: 'PAID' as const,
    registeredByMemberId: otherId,
    registeredAt: timestamp,
    registrationNote: '已核实',
  })),
  progress: { paidCount: 1, totalCount: 1, remainingCents: '0' },
};
const zeroLedger = {
  ...ledger,
  status: 'SETTLING' as const,
  myRemainingNetCents: '0',
  members: ledger.members.map((m) => ({ ...m, remainingNetCents: '0' })),
};
async function openRecord() {
  get.mockResolvedValue({ data: { ...ledger, status: 'SETTLING' } });
  await show();
  await screen.findByText('收付款记录');
}
describe('repayment and completion interactions (API replacements)', () => {
  it('requires confirmation and a whole-transfer registration; retains note/key, blocks duplicate clicks and cancellation on timeout', async () => {
    const mark = jest.mocked(settlementsApi.markTransferPaid);
    let reject!: (error: unknown) => void;
    mark.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await openRecord();
    expect(screen.getByRole('button', { name: '确认整本结清' })).toBeDisabled();
    await userEvent.press(screen.getByRole('button', { name: '登记已还' }));
    expect(mark).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '取消' }));
    await userEvent.press(screen.getByRole('button', { name: '登记已还' }));
    await fireEvent.changeText(screen.getByLabelText('登记说明（选填）'), ' 已核实 ');
    const confirm = screen.getByRole('button', { name: '确认登记已还' });
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    expect(mark).toHaveBeenCalledTimes(1);
    reject(new ApiError('REQUEST_TIMEOUT', '登记超时'));
    await screen.findByText('登记超时');
    expect(screen.getByLabelText('登记说明（选填）')).toHaveDisplayValue(' 已核实 ');
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(screen.getByLabelText('登记说明（选填）')).toBeDisabled();
    read.mockResolvedValue({ data: paidRecord });
    get.mockResolvedValue({ data: zeroLedger });
    mark.mockResolvedValue({
      data: { transfer: paidRecord.transfers[0]!, progress: paidRecord.progress },
    });
    await userEvent.press(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('全部转账已登记');
    expect(mark.mock.calls[0]).toEqual(mark.mock.calls[1]);
    expect(mark.mock.calls[1]?.[0]).toEqual({
      params: { ledgerId, transferId: otherId },
      query: {},
      body: { note: '已核实' },
    });
    expect(screen.getByRole('button', { name: '确认整本结清' })).toBeEnabled();
  });
  it('keeps an unconfirmed read in the panel, then resolves a committed registration online without another write', async () => {
    const mark = jest.mocked(settlementsApi.markTransferPaid);
    mark.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '登记超时'));
    await openRecord();
    await userEvent.press(screen.getByRole('button', { name: '登记已还' }));
    await userEvent.press(screen.getByRole('button', { name: '确认登记已还' }));
    await screen.findByText('登记超时');
    await userEvent.press(screen.getByRole('button', { name: '查询结果' }));
    await screen.findByText('还没有查到结果，可以重试。');
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    read.mockResolvedValue({ data: paidRecord });
    get.mockResolvedValue({ data: zeroLedger });
    await userEvent.press(screen.getByRole('button', { name: '查询结果' }));
    await screen.findByText('全部转账已登记');
    expect(mark).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'permits a payer and rejects a payee who is not creator (payer=%s)',
    async (payer) => {
      mockUserId = payer ? otherId : userId;
      get.mockResolvedValue({
        data: { ...ledger, status: 'SETTLING', creatorUserId: ledgerId, myMemberId: mockUserId },
      });
      await show();
      await screen.findByText('收付款记录');
      if (payer) expect(screen.getByRole('button', { name: '登记已还' })).toBeEnabled();
      else expect(screen.queryByRole('button', { name: '登记已还' })).toBeNull();
      expect(screen.queryByRole('button', { name: '确认整本结清' })).toBeNull();
    },
  );
  it('retains server permission errors in the repayment panel without changing progress', async () => {
    jest
      .mocked(settlementsApi.markTransferPaid)
      .mockRejectedValueOnce(new ApiError('FORBIDDEN', '仅付款人或创建者可登记', 403));
    await openRecord();
    await userEvent.press(screen.getByRole('button', { name: '登记已还' }));
    await userEvent.press(screen.getByRole('button', { name: '确认登记已还' }));
    await screen.findByText('仅付款人或创建者可登记');
    await userEvent.press(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByText('0 / 1 笔已登记')).toBeOnTheScreen();
  });
  it('requires every member balance to be zero before allowing creator completion', async () => {
    read.mockResolvedValue({ data: paidRecord });
    await openRecord();
    expect(screen.getByRole('button', { name: '确认整本结清' })).toBeDisabled();
  });
  it('confirms completion, resolves an unknown result online, then exposes the read-only history and archive entry', async () => {
    const settle = jest.mocked(settlementsApi.settleLedger);
    settle.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '结清结果未知'));
    get.mockResolvedValue({ data: zeroLedger });
    read.mockResolvedValue({ data: paidRecord });
    await show();
    await screen.findByText('全部转账已登记');
    await userEvent.press(screen.getByRole('button', { name: '确认整本结清' }));
    expect(settle).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '返回核对' }));
    await userEvent.press(screen.getByRole('button', { name: '确认整本结清' }));
    await userEvent.press(screen.getByRole('button', { name: '确认结清' }));
    await screen.findByText('结清结果未知');
    read.mockResolvedValue({ data: { ...paidRecord, ledgerStatus: 'SETTLED' } });
    get.mockResolvedValue({ data: { ...zeroLedger, status: 'SETTLED' } });
    await userEvent.press(screen.getByRole('button', { name: '查询结果' }));
    await screen.findByText('账本已结清');
    expect(screen.getByRole('button', { name: '归档账本' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '历史账单' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '登记已还' })).toBeNull();
    expect(settle).toHaveBeenCalledTimes(1);
  });
});

it('uses membership IDs rather than user IDs to authorize a non-creator payer', async () => {
  mockUserId = '00000000-0000-4000-8000-000000000009';
  get.mockResolvedValue({
    data: {
      ...ledger,
      status: 'SETTLING',
      myMemberId: otherId,
      members: ledger.members.map((member) =>
        member.id === otherId ? { ...member, userId: mockUserId } : member,
      ),
    },
  });
  await show();
  await screen.findByText('收付款记录');
  expect(screen.getByRole('button', { name: '登记已还' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '确认整本结清' })).toBeNull();
});
