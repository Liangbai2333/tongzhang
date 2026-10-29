import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { EndpointOutput } from '@tongzhang/contracts';
import CreateLedgerScreen from '../src/features/ledgers/screens/CreateLedgerScreen';
import LedgerListScreen from '../src/features/ledgers/screens/LedgerListScreen';
import LedgerDetailScreen from '../src/features/ledgers/screens/LedgerDetailScreen';
import JoinLedgerScreen from '../src/features/invitations/screens/JoinLedgerScreen';
import InvitationScreen from '../src/features/invitations/screens/InvitationScreen';
import { ledgersApi } from '../src/features/ledgers/api';
import { expensesApi } from '../src/features/expenses/api';
import { invitationsApi } from '../src/features/invitations/api';
import { ApiError } from '../src/lib/api-error';
import { createQueryClient } from '../src/lib/query-client';
import { imagesApi } from '../src/features/images/api';
import { selectReceipt } from '../src/features/images/receipt-files';
import { setStringAsync } from 'expo-clipboard';

const userId = '00000000-0000-4000-8000-000000000001';
const ledgerId = '00000000-0000-4000-8000-000000000002';
const mockParams = { ledgerId };
let mockKeyNumber = 0;
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: userId } }) }));
jest.mock('../src/features/ledgers/api', () => ({
  ledgersApi: {
    createLedger: jest.fn(),
    listLedgers: jest.fn(),
    getLedger: jest.fn(),
    archiveLedger: jest.fn(),
  },
}));
jest.mock('../src/features/expenses/api', () => ({
  expensesApi: { listExpenses: jest.fn(async () => ({ data: [], page: { nextCursor: null } })) },
}));
jest.mock('../src/features/invitations/api', () => ({
  invitationsApi: {
    previewJoin: jest.fn(),
    joinLedger: jest.fn(),
    getInvitation: jest.fn(),
    resetInvitation: jest.fn(),
  },
}));
jest.mock('../src/features/images/api', () => ({
  imagesApi: { upload: jest.fn(), read: jest.fn() },
}));
jest.mock('../src/features/images/receipt-files', () => ({
  selectReceipt: jest.fn(),
  removeReceiptFile: jest.fn(),
}));
jest.mock('../src/lib/api', () => ({ createIdempotencyKey: () => `key-${++mockKeyNumber}` }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-qrcode-svg', () => () => null);
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));
jest.mock('../src/icons/FigmaAsset', () => {
  const asset = { source: 1, width: 20, height: 20 };
  return {
    FigmaAsset: () => null,
    figmaAssets: new Proxy({}, { get: () => new Proxy({}, { get: () => asset }) }),
  };
});
const summary: EndpointOutput<'createLedger'>['data']['ledger'] = {
  id: ledgerId,
  name: '鼓山一日',
  coverKey: 'mountain',
  coverImageId: null,
  status: 'ACTIVE',
  version: 1,
  memberCount: 1,
  expenseTotalCents: '0',
  myRemainingNetCents: '0',
  archivedAt: null,
  createdAt: '2026-10-25T00:00:00.000Z',
};
const invitation = {
  id: '00000000-0000-4000-8000-000000000003',
  code: 'ABC234',
  expiresAt: '2099-10-25T00:00:00.000Z',
  expired: false,
  qrPayload: 'tongzhang:invite:v1:ABC234',
};
const detail: EndpointOutput<'getLedger'>['data'] = {
  ...summary,
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
      joinedAt: summary.createdAt,
      netCents: '0',
      remainingNetCents: '0',
    },
  ],
};
const preview = {
  ledgerId,
  name: '鼓山一日',
  creatorName: '小安',
  memberCount: 1,
  canJoin: true,
  alreadyMember: false,
};
const create = jest.mocked(ledgersApi.createLedger);
const list = jest.mocked(ledgersApi.listLedgers);
const get = jest.mocked(ledgersApi.getLedger);
const check = jest.mocked(invitationsApi.previewJoin);
const join = jest.mocked(invitationsApi.joinLedger);
const readInvitation = jest.mocked(invitationsApi.getInvitation);
const reset = jest.mocked(invitationsApi.resetInvitation);

async function pullToRefresh() {
  await act(async () => screen.getByTestId('screen-scroll').props.refreshControl.props.onRefresh());
}
async function show(node: React.ReactElement) {
  const client = createQueryClient();
  await render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
async function previewCode() {
  await fireEvent.changeText(screen.getByLabelText('6 位邀请码'), 'abc234');
  await userEvent.press(screen.getByRole('button', { name: '查看账本' }));
  await screen.findByRole('header', { name: '确认加入这个账本？' });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockParams.ledgerId = ledgerId;
  mockKeyNumber = 0;
  jest.mocked(imagesApi.upload).mockReset();
  jest.mocked(selectReceipt).mockReset();
  jest.mocked(ledgersApi.archiveLedger).mockReset();
  create.mockResolvedValue({ data: { ledger: summary, invitation } });
  list.mockResolvedValue({ data: [], page: { nextCursor: null } });
  get.mockResolvedValue({ data: detail });
  check.mockResolvedValue({ data: preview });
  join.mockResolvedValue({ data: { ledgerId, memberId: userId, alreadyMember: false } });
  readInvitation.mockResolvedValue({ data: invitation });
  reset.mockResolvedValue({ data: { ...invitation, code: 'DEF567' } });
  jest.mocked(setStringAsync).mockResolvedValue(true);
});

describe('ledger pages with isolated API callbacks (no database/native claim)', () => {
  it('opens the Figma add menu and routes to the existing create and join pages', async () => {
    await show(<LedgerListScreen />);
    await screen.findByText('还没有账本');
    expect(screen.queryByRole('button', { name: '创建新账本' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: '创建或加入账本' }));
    expect(screen.getByRole('header', { name: '添加账本' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '创建新账本' }));
    expect(router.push).toHaveBeenLastCalledWith('/ledgers/create');
    await userEvent.press(screen.getByRole('button', { name: '创建或加入账本' }));
    await userEvent.press(screen.getByRole('button', { name: '有邀请码？加入账本' }));
    expect(router.push).toHaveBeenLastCalledWith('/invitations/join');
    expect(screen.getByRole('tab', { name: '账本', selected: true })).toBeOnTheScreen();
  });
  it('queries archived ledgers online and switches back to the active list', async () => {
    await show(<LedgerListScreen />);
    await screen.findByText('还没有账本');
    list.mockResolvedValueOnce({
      data: [{ ...summary, status: 'SETTLED', archivedAt: summary.createdAt }],
      page: { nextCursor: null },
    });
    await userEvent.press(screen.getByRole('button', { name: '已归档账本' }));
    await screen.findByText('鼓山一日');
    expect(list.mock.calls.at(-1)?.[0].query.archived).toBe('true');
    await userEvent.press(screen.getByRole('button', { name: '返回当前账本' }));
    await screen.findByText('还没有账本');
    expect(list.mock.calls.at(-1)?.[0].query.archived).toBe('false');
  });
  it('keeps archive filtering when fetching the next history page', async () => {
    await show(<LedgerListScreen />);
    await screen.findByText('还没有账本');
    list.mockResolvedValueOnce({
      data: [{ ...summary, status: 'SETTLED', archivedAt: summary.createdAt }],
      page: { nextCursor: 'history-cursor' },
    });
    await userEvent.press(screen.getByRole('button', { name: '已归档账本' }));
    await screen.findByText('鼓山一日');
    list.mockResolvedValueOnce({
      data: [
        {
          ...summary,
          id: userId,
          name: '历史第二本',
          status: 'SETTLED',
          archivedAt: summary.createdAt,
        },
      ],
      page: { nextCursor: null },
    });
    await userEvent.press(screen.getByRole('button', { name: '加载更多' }));
    await screen.findByText('历史第二本');
    expect(list.mock.calls.at(-1)?.[0].query).toMatchObject({
      archived: 'true',
      cursor: 'history-cursor',
    });
    expect(screen.getByText('鼓山一日')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull();
  });
  it('shows an online empty history instead of the current-list empty copy', async () => {
    await show(<LedgerListScreen />);
    await screen.findByText('还没有账本');
    await userEvent.press(screen.getByRole('button', { name: '已归档账本' }));
    await screen.findByText('还没有已归档账本');
    expect(screen.queryByText('还没有账本')).toBeNull();
    expect(list.mock.calls.at(-1)?.[0].query.archived).toBe('true');
  });
  it('shows the empty-ledger design only after reading a real zero total and opens expense creation for ACTIVE ledgers', async () => {
    await show(<LedgerDetailScreen />);
    await screen.findByText('你们的故事，从第一笔开始。');
    await userEvent.press(screen.getByRole('button', { name: '记第一笔' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/ledgers/[ledgerId]/expenses/create',
      params: { ledgerId },
    });
    await userEvent.press(screen.getByRole('button', { name: '查看成员 · 1 / 12' }));
    expect(screen.getByText('小安（我）')).toBeOnTheScreen();
  });
  it('validates name and submits the selected preset with a stable idempotency key', async () => {
    await show(<CreateLedgerScreen />);
    await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
    expect(screen.getByText('请输入 1–40 个字符的账本名称')).toBeOnTheScreen();
    expect(create).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('账本名称'), ' 鼓山一日 ');
    expect(screen.queryByText('请输入 1–40 个字符的账本名称')).toBeNull();
    expect(create).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('radio', { name: '好友聚餐' }));
    await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
    expect(create).toHaveBeenCalledWith(
      { params: {}, query: {}, body: { name: '鼓山一日', coverKey: 'dining' } },
      { idempotencyKey: 'key-1' },
    );
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/invitation',
      params: { ledgerId },
    });
  });
  it('preserves input, blocks double presses, and retries an unknown result only on explicit press with the same key', async () => {
    let reject!: (error: Error) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await show(<CreateLedgerScreen />);
    await fireEvent.changeText(screen.getByLabelText('账本名称'), '鼓山一日');
    const button = screen.getByRole('button', { name: '创建并邀请成员' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('账本名称')).toBeDisabled();
    reject(new ApiError('REQUEST_TIMEOUT', '提交结果尚未确认，请核对后重试'));
    await screen.findByText('提交结果尚未确认，请核对后重试');
    expect(screen.getByLabelText('账本名称')).toHaveDisplayValue('鼓山一日');
    expect(screen.getByLabelText('账本名称')).toBeDisabled();
    expect(create).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '重试创建' }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[1]).toEqual(create.mock.calls[1]?.[1]);
  });
  it('blocks retries after 24 hours until the user checks the original result', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    create.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '结果未知'));
    await show(<CreateLedgerScreen />);
    await fireEvent.changeText(screen.getByLabelText('账本名称'), '鼓山一日');
    await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
    await screen.findByText('结果未知');
    now.mockReturnValue(1_000_000 + 24 * 60 * 60 * 1000);
    await userEvent.press(screen.getByRole('button', { name: '重试创建' }));
    expect(screen.getByText('这次提交已超过 24 小时，请回到账本列表查看结果')).toBeOnTheScreen();
    expect(create).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });
  it('shows online empty state, paginates with the server cursor, and hides old data after a failed refresh', async () => {
    await show(<LedgerListScreen />);
    await screen.findByText('还没有账本');
    list.mockResolvedValueOnce({ data: [summary], page: { nextCursor: 'server-cursor' } });
    await pullToRefresh();
    await screen.findByText('鼓山一日');
    list.mockResolvedValueOnce({
      data: [{ ...summary, id: userId, name: '第二本' }],
      page: { nextCursor: null },
    });
    await userEvent.press(screen.getByRole('button', { name: '加载更多' }));
    await screen.findByText('第二本');
    expect(list.mock.calls.at(-1)?.[0].query.cursor).toBe('server-cursor');
    list.mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', '网络未连接，请联网后重试'));
    await pullToRefresh();
    await screen.findByText('网络未连接，请联网后重试');
    expect(screen.queryByText('鼓山一日')).toBeNull();
    expect(screen.queryByText('还没有账本')).toBeNull();
  });
  it('keeps the expense list mounted during pull-to-refresh and rereads it', async () => {
    const listExpenses = jest.mocked(expensesApi.listExpenses);
    get.mockResolvedValueOnce({ data: { ...detail, expenseTotalCents: '12000' } });
    await show(<LedgerDetailScreen />);
    await screen.findByText('还没有消费记录');
    const reads = listExpenses.mock.calls.length;
    let resolve!: (value: { data: typeof detail }) => void;
    get.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    await pullToRefresh();
    // The filter-bearing list stays on screen while the ledger refetches.
    expect(screen.getByText('还没有消费记录')).toBeOnTheScreen();
    expect(listExpenses).toHaveBeenCalledTimes(reads + 1);
    await act(async () => resolve({ data: { ...detail, expenseTotalCents: '12000' } }));
    expect(listExpenses).toHaveBeenCalledTimes(reads + 1);
  });
  it('reads member names and real integer amounts, then hides data on permission rejection', async () => {
    get.mockResolvedValueOnce({
      data: { ...detail, expenseTotalCents: '900719925474099300', myPaidCents: '12000' },
    });
    await show(<LedgerDetailScreen />);
    await screen.findByText('¥9007199254740993.00');
    expect(screen.getByText('¥120.00')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '查看成员 · 1 / 12' }));
    expect(screen.getByText('小安（我）')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    get.mockRejectedValueOnce(new ApiError('FORBIDDEN', '无权访问该账本', 403));
    await pullToRefresh();
    await screen.findByText('无权访问该账本');
    expect(screen.queryByText('¥120.00')).toBeNull();
    expect(screen.queryByText('小安（我）')).toBeNull();
  });
  it.each([
    { creatorUserId: ledgerId, status: 'ACTIVE' as const },
    { creatorUserId: userId, status: 'SETTLING' as const },
    { creatorUserId: userId, status: 'SETTLED' as const },
  ])('hides member management without creator/ACTIVE permission: %s', async (state) => {
    get.mockResolvedValueOnce({ data: { ...detail, ...state } });
    await show(<LedgerDetailScreen />);
    await screen.findByRole('button', { name: '查看成员 · 1 / 12' });
    await userEvent.press(screen.getByRole('button', { name: '查看成员 · 1 / 12' }));
    expect(screen.getByText('小安（我）')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '邀请成员' })).toBeNull();
    expect(screen.queryByRole('button', { name: '重置邀请码' })).toBeNull();
    expect(reset).not.toHaveBeenCalled();
  });
  it('confirms member-panel reset, blocks duplicate writes and dismissal, and preserves the retry key after an unknown result', async () => {
    let reject!: (error: Error) => void;
    reset.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await show(<LedgerDetailScreen />);
    await screen.findByRole('button', { name: '查看成员 · 1 / 12' });
    await userEvent.press(screen.getByRole('button', { name: '查看成员 · 1 / 12' }));
    await userEvent.press(screen.getByRole('button', { name: '重置邀请码' }));
    expect(reset).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('button', { name: '邀请成员' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '重置邀请码' }));
    const confirm = screen.getByRole('button', { name: '确认重置' });
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    await fireEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: '重置邀请码？' })).toBeOnTheScreen();
    reject(new ApiError('REQUEST_TIMEOUT', '重置结果尚未确认'));
    await screen.findByText('重置结果尚未确认');
    await fireEvent.press(screen.getByLabelText('关闭面板遮罩', { includeHiddenElements: true }));
    expect(screen.getByRole('header', { name: '重置邀请码？' })).toBeOnTheScreen();
    expect(reset).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '重试重置' }));
    expect(reset.mock.calls[0]?.[1]).toEqual(reset.mock.calls[1]?.[1]);
    expect(reset.mock.calls[0]?.[0].params.ledgerId).toBe(ledgerId);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/invitation',
      params: { ledgerId },
    });
  });
  it('keeps member reset permission errors in the confirmation panel until explicitly cancelled', async () => {
    reset.mockRejectedValueOnce(new ApiError('FORBIDDEN', '仅创建者可重置邀请', 403));
    await show(<LedgerDetailScreen />);
    await screen.findByRole('button', { name: '查看成员 · 1 / 12' });
    await userEvent.press(screen.getByRole('button', { name: '查看成员 · 1 / 12' }));
    await userEvent.press(screen.getByRole('button', { name: '重置邀请码' }));
    await userEvent.press(screen.getByRole('button', { name: '确认重置' }));
    await screen.findByText('仅创建者可重置邀请');
    expect(router.push).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByText('小安（我）')).toBeOnTheScreen();
  });
  it('validates invite format without a request', async () => {
    await show(<JoinLedgerScreen />);
    await fireEvent.changeText(screen.getByLabelText('6 位邀请码'), 'IO0011');
    await userEvent.press(screen.getByRole('button', { name: '查看账本' }));
    expect(screen.getByText('请输入 6 位邀请码（不含 0、1、I、O）')).toBeOnTheScreen();
    expect(check).not.toHaveBeenCalled();
  });
  it.each([
    ['INVITE_INVALID', '邀请码无效，请核对后重试'],
    ['INVITE_EXPIRED', '邀请码已过期，请联系创建者重新生成'],
    ['NETWORK_UNAVAILABLE', '网络未连接，请联网后重试'],
  ])('keeps invite input on %s and never automatically retries', async (code, message) => {
    check.mockRejectedValueOnce(new ApiError(code, message));
    await show(<JoinLedgerScreen />);
    await fireEvent.changeText(screen.getByLabelText('6 位邀请码'), 'abc234');
    await userEvent.press(screen.getByRole('button', { name: '查看账本' }));
    await screen.findByText(message);
    expect(screen.getByLabelText('6 位邀请码')).toHaveDisplayValue('ABC234');
    expect(check).toHaveBeenCalledTimes(1);
    expect(join).not.toHaveBeenCalled();
  });
  it('previews without joining, permits cancellation, and rechecks a race on confirm while retaining the same key', async () => {
    await show(<JoinLedgerScreen />);
    await previewCode();
    expect(screen.getByText('创建者：小安')).toBeOnTheScreen();
    expect(join).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '暂不加入' }));
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: '确认加入这个账本？' })).toBeNull(),
    );
    expect(screen.getByLabelText('6 位邀请码')).toHaveDisplayValue('ABC234');
    await userEvent.press(screen.getByRole('button', { name: '查看账本' }));
    await screen.findByRole('header', { name: '确认加入这个账本？' });
    join.mockRejectedValueOnce(new ApiError('MEMBER_LIMIT_REACHED', '账本成员已满', 409));
    await userEvent.press(screen.getByRole('button', { name: '加入鼓山一日' }));
    await screen.findByText('账本成员已满');
    expect(router.replace).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '加入鼓山一日' }));
    expect(join.mock.calls[0]?.[1]).toEqual(join.mock.calls[1]?.[1]);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]',
      params: { ledgerId },
    });
  });
  it('clears an abandoned definitive join error before a fresh preview and keeps the new preview read-only', async () => {
    join.mockRejectedValueOnce(
      new ApiError('INVITE_EXPIRED', '邀请码已过期，请联系创建者重新生成', 409),
    );
    await show(<JoinLedgerScreen />);
    await previewCode();
    await userEvent.press(screen.getByRole('button', { name: '加入鼓山一日' }));
    await screen.findByText('邀请码已过期，请联系创建者重新生成');
    await userEvent.press(screen.getByRole('button', { name: '暂不加入' }));
    await userEvent.press(screen.getByRole('button', { name: '查看账本' }));
    await screen.findByRole('header', { name: '确认加入这个账本？' });
    expect(screen.queryByText('邀请码已过期，请联系创建者重新生成')).toBeNull();
    expect(join).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '加入鼓山一日' }));
    expect(join.mock.calls[0]?.[1]).not.toEqual(join.mock.calls[1]?.[1]);
  });
  it('keeps unknown join results in the original panel and reuses the key on explicit retry', async () => {
    join.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '加入结果尚未确认'));
    await show(<JoinLedgerScreen />);
    await previewCode();
    await userEvent.press(screen.getByRole('button', { name: '加入鼓山一日' }));
    await screen.findByText('加入结果尚未确认');
    await fireEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    expect(screen.getByRole('header', { name: '确认加入这个账本？' })).toBeOnTheScreen();
    expect(join).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '重试加入' }));
    expect(join.mock.calls[0]).toEqual(join.mock.calls[1]);
  });
  it('blocks duplicate join presses and dismissal while writing', async () => {
    let finish!: (result: EndpointOutput<'joinLedger'>) => void;
    join.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await show(<JoinLedgerScreen />);
    await previewCode();
    const button = screen.getByRole('button', { name: '加入鼓山一日' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    expect(join).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: '确认加入这个账本？' })).toBeOnTheScreen();
    finish({ data: { ledgerId, memberId: userId, alreadyMember: false } });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });
  it.each([false, true])(
    'handles full groups and existing members (alreadyMember=%s)',
    async (alreadyMember) => {
      check.mockResolvedValueOnce({
        data: { ...preview, memberCount: 12, canJoin: false, alreadyMember },
      });
      await show(<JoinLedgerScreen />);
      await previewCode();
      if (alreadyMember) {
        await userEvent.press(screen.getByRole('button', { name: '进入账本' }));
        expect(router.replace).toHaveBeenCalled();
      } else {
        expect(screen.getByRole('button', { name: '加入鼓山一日' })).toBeDisabled();
        expect(screen.getByText('成员已满，暂时无法加入。')).toBeOnTheScreen();
      }
      expect(join).not.toHaveBeenCalled();
    },
  );
  it('only reports clipboard success after it succeeds; reset confirmation creates a new attempt each time', async () => {
    await show(<InvitationScreen />);
    await screen.findByLabelText('邀请码 ABC234');
    jest.mocked(setStringAsync).mockResolvedValueOnce(false);
    await userEvent.press(screen.getByRole('button', { name: '复制邀请码' }));
    expect(screen.getByText('复制失败，请稍后重试')).toBeOnTheScreen();
    expect(screen.queryByText('邀请码已复制')).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: '复制邀请码' }));
    expect(screen.getByText('邀请码已复制')).toBeOnTheScreen();
    expect(setStringAsync).toHaveBeenLastCalledWith('ABC234');
    for (let i = 0; i < 2; i++) {
      await userEvent.press(screen.getByRole('button', { name: '重置邀请码' }));
      expect(reset).toHaveBeenCalledTimes(i);
      await userEvent.press(screen.getByRole('button', { name: '确认重置' }));
      await waitFor(() =>
        expect(screen.queryByRole('header', { name: '重置邀请码？' })).toBeNull(),
      );
    }
    expect(reset).toHaveBeenCalledTimes(2);
    expect(reset.mock.calls[0]?.[1]).not.toEqual(reset.mock.calls[1]?.[1]);
  });
  it('disables sharing an expired invitation and displays the recovery action', async () => {
    readInvitation.mockResolvedValueOnce({ data: { ...invitation, expired: true } });
    await show(<InvitationScreen />);
    await screen.findByText('邀请码已过期，请重置后再邀请');
    expect(screen.getByRole('button', { name: '复制邀请码' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '分享邀请' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重置邀请码' })).toBeEnabled();
  });
});

describe('custom covers and personal archive (API/native replacements)', () => {
  it('keeps name and uploaded COVER reference after a failed create; retries without uploading again', async () => {
    const pick = jest.mocked(selectReceipt);
    const upload = jest.mocked(imagesApi.upload);
    pick.mockResolvedValueOnce({ uri: 'file:///cache/cover.jpg', byteSize: 8000 });
    upload.mockResolvedValue({
      data: { imageId: userId, mimeType: 'image/jpeg', byteSize: 8000, width: 800, height: 1000 },
    });
    create.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '建账结果未知'));
    await show(<CreateLedgerScreen />);
    await fireEvent.changeText(screen.getByLabelText('账本名称'), '自定义封面');
    await userEvent.press(screen.getByRole('button', { name: '从相册选择自定义封面' }));
    await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
    await screen.findByText('建账结果未知');
    expect(screen.getByRole('button', { name: '从相册选择自定义封面' })).toBeDisabled();
    expect(screen.getByLabelText('账本名称')).toHaveDisplayValue('自定义封面');
    expect(upload).toHaveBeenCalledWith(
      { kind: 'COVER', ledgerId: undefined },
      { uri: 'file:///cache/cover.jpg', name: 'cover.jpg', type: 'image/jpeg' },
    );
    expect(create.mock.calls[0]?.[0].body).toEqual({ name: '自定义封面', coverImageId: userId });
    await userEvent.press(screen.getByRole('button', { name: '重试创建' }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });
  it('preserves cover selection on picker cancellation and upload error, and permits a preset after a definite failure', async () => {
    const pick = jest.mocked(selectReceipt);
    const upload = jest.mocked(imagesApi.upload);
    pick
      .mockResolvedValueOnce({ uri: 'file:///cache/cover.jpg', byteSize: 8000 })
      .mockResolvedValueOnce(null);
    upload.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '封面上传失败'));
    await show(<CreateLedgerScreen />);
    await fireEvent.changeText(screen.getByLabelText('账本名称'), '保留封面');
    await userEvent.press(screen.getByRole('button', { name: '从相册选择自定义封面' }));
    await userEvent.press(screen.getByRole('button', { name: '从相册选择自定义封面' }));
    await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
    await screen.findByText('封面上传失败');
    expect(screen.getByLabelText('自定义封面预览')).toBeOnTheScreen();
    expect(create).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('radio', { name: '好友聚餐' }));
    await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
    expect(create.mock.calls[0]?.[0].body).toEqual({ name: '保留封面', coverKey: 'dining' });
  });
  it('confirms personal archive only for SETTLED; resolves an unknown result through online membership read', async () => {
    const archive = jest.mocked(ledgersApi.archiveLedger);
    archive.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '归档结果未知'));
    get.mockResolvedValue({ data: { ...detail, status: 'SETTLED' } });
    await show(<LedgerDetailScreen />);
    await userEvent.press(await screen.findByRole('button', { name: '归档' }));
    expect(archive).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '暂不归档' }));
    await userEvent.press(screen.getByRole('button', { name: '归档' }));
    await userEvent.press(screen.getByRole('button', { name: '确认归档' }));
    await screen.findByText('归档结果未知');
    expect(screen.getByRole('button', { name: '暂不归档' })).toBeDisabled();
    get.mockResolvedValue({ data: { ...detail, status: 'SETTLED', archivedAt: detail.createdAt } });
    await userEvent.press(screen.getByRole('button', { name: '查询结果' }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/ledgers',
        params: { archivedNotice: ledgerId },
      }),
    );
    expect(archive).toHaveBeenCalledTimes(1);
  });
  it.each(['ACTIVE', 'SETTLING'] as const)('cannot archive a %s ledger', async (status) => {
    get.mockResolvedValue({ data: { ...detail, status } });
    await show(<LedgerDetailScreen />);
    await screen.findByRole('button', { name: '查看成员 · 1 / 12' });
    expect(screen.queryByRole('button', { name: '归档' })).toBeNull();
  });
});

it('retains unknown create locks across an offline retry and offers an explicit online check instead of ordinary back navigation', async () => {
  create
    .mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '创建超时'))
    .mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', '当前断网'));
  await show(<CreateLedgerScreen />);
  await fireEvent.changeText(screen.getByLabelText('账本名称'), '原账本');
  await userEvent.press(screen.getByRole('button', { name: '创建并邀请成员' }));
  await screen.findByText('创建超时');
  await userEvent.press(screen.getByRole('button', { name: '重试创建' }));
  await screen.findByText('当前断网');
  expect(screen.getByLabelText('账本名称')).toBeDisabled();
  expect(screen.getByRole('button', { name: '返回' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '从相册选择自定义封面' })).toBeDisabled();
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  expect(create).toHaveBeenCalledTimes(2);
  await userEvent.press(screen.getByRole('button', { name: '回到账本列表查看' }));
  expect(router.replace).toHaveBeenCalledWith('/ledgers');
  expect(create).toHaveBeenCalledTimes(2);
});

it('does not carry an unresolved archive confirmation into another ledger in the same route instance', async () => {
  get.mockResolvedValue({ data: { ...detail, status: 'SETTLED' } });
  const archive = jest.mocked(ledgersApi.archiveLedger);
  archive.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '归档仍未知'));
  const client = createQueryClient();
  const node = () => (
    <QueryClientProvider client={client}>
      <LedgerDetailScreen />
    </QueryClientProvider>
  );
  const view = await render(node());
  await userEvent.press(await screen.findByRole('button', { name: '归档' }));
  await userEvent.press(screen.getByRole('button', { name: '确认归档' }));
  await screen.findByText('归档仍未知');
  const nextId = '00000000-0000-4000-8000-000000000009';
  mockParams.ledgerId = nextId;
  get.mockResolvedValue({ data: { ...detail, id: nextId, name: '另一账本', status: 'SETTLED' } });
  await view.rerender(node());
  await waitFor(() => expect(get.mock.calls.at(-1)?.[0].params.ledgerId).toBe(nextId));
  await screen.findByRole('header', { name: '另一账本', includeHiddenElements: true });
  expect(screen.queryByRole('header', { name: '确认归档账本？' })).toBeNull();
  expect(archive).toHaveBeenCalledTimes(1);
});

it('keeps the unresolved archive attempt mounted while its ledger is refetched', async () => {
  const settled = { data: { ...detail, status: 'SETTLED' as const } };
  get.mockResolvedValue(settled);
  const archive = jest.mocked(ledgersApi.archiveLedger);
  archive.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '归档仍未知'));
  const client = createQueryClient();
  const view = await render(
    <QueryClientProvider client={client}>
      <LedgerDetailScreen />
    </QueryClientProvider>,
  );
  await userEvent.press(await screen.findByRole('button', { name: '归档' }));
  await userEvent.press(screen.getByRole('button', { name: '确认归档' }));
  await screen.findByText('归档仍未知');
  let resolve!: (value: typeof settled) => void;
  get.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let refetch!: Promise<typeof settled>;
  await act(async () => {
    refetch = client.fetchQuery({
      queryKey: ['user', userId, 'ledgers', ledgerId],
      staleTime: 0,
      queryFn: () => get({ params: { ledgerId }, query: {}, body: undefined }),
    });
  });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(screen.getByText('归档仍未知')).toBeOnTheScreen();
  await act(async () => {
    resolve(settled);
    await refetch;
  });
  await userEvent.press(await screen.findByRole('button', { name: '重试' }));
  expect(archive.mock.calls[0]).toEqual(archive.mock.calls[1]);
  await view.unmount();
  client.clear();
});
