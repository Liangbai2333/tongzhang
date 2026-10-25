import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { setStringAsync } from 'expo-clipboard';
import type { EndpointOutput } from '@tongzhang/contracts';
import CreateExpenseScreen from '../src/features/expenses/screens/CreateExpenseScreen';
import ExpenseDetailScreen from '../src/features/expenses/screens/ExpenseDetailScreen';
import BalancesScreen from '../src/features/balances/screens/BalancesScreen';
import SettlementPreviewScreen from '../src/features/settlements/screens/SettlementPreviewScreen';
import { ExpenseList } from '../src/features/expenses/components/ExpenseList';
import { ReceiptImage, imageDataUri } from '../src/features/images/components/ReceiptImage';
import { ledgersApi } from '../src/features/ledgers/api';
import { expensesApi } from '../src/features/expenses/api';
import { imagesApi } from '../src/features/images/api';
import { balancesApi } from '../src/features/balances/api';
import { settlementsApi } from '../src/features/settlements/api';
import { removeReceiptFile, selectReceipt } from '../src/features/images/receipt-files';
import { ApiError } from '../src/lib/api-error';
import { createQueryClient } from '../src/lib/query-client';
import { splitPreview } from '../src/features/expenses/presentation';
const userId = '00000000-0000-4000-8000-000000000001';
const ledgerId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const expenseId = '00000000-0000-4000-8000-000000000004';
const imageId = '00000000-0000-4000-8000-000000000005';
let mockKeyNumber = 0;
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: userId } }) }));
jest.mock('../src/features/ledgers/api', () => ({ ledgersApi: { getLedger: jest.fn() } }));
jest.mock('../src/features/expenses/api', () => ({
  expensesApi: { createExpense: jest.fn(), listExpenses: jest.fn(), getExpense: jest.fn() },
}));
jest.mock('../src/features/images/api', () => ({
  imagesApi: { upload: jest.fn(), read: jest.fn() },
}));
jest.mock('../src/features/images/receipt-files', () => ({
  selectReceipt: jest.fn(),
  removeReceiptFile: jest.fn(),
}));
jest.mock('../src/features/balances/api', () => ({ balancesApi: { getBalances: jest.fn() } }));
jest.mock('../src/features/settlements/api', () => ({
  settlementsApi: { previewSettlement: jest.fn(), startSettlement: jest.fn() },
}));
jest.mock('../src/lib/api', () => ({
  createIdempotencyKey: () => `expense-key-${++mockKeyNumber}`,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ ledgerId, expenseId }),
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
const expense: EndpointOutput<'getExpense'>['data'] = {
  id: expenseId,
  ledgerId,
  title: '食堂午餐',
  amountCents: '12000',
  category: 'DINING',
  occurredOn: '2026-10-25',
  payerMemberId: userId,
  payerName: '小安',
  version: 1,
  recorderMemberId: userId,
  recorderName: '小安',
  splitMode: 'EQUAL',
  splits: [
    { memberId: userId, username: '小安', shares: null, amountCents: '6000' },
    { memberId: otherId, username: '小白', shares: null, amountCents: '6000' },
  ],
  note: '两人午餐',
  receiptImageId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  canEdit: true,
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
const get = jest.mocked(ledgersApi.getLedger);
const create = jest.mocked(expensesApi.createExpense);
const list = jest.mocked(expensesApi.listExpenses);
const detail = jest.mocked(expensesApi.getExpense);
const upload = jest.mocked(imagesApi.upload);
const read = jest.mocked(imagesApi.read);
const select = jest.mocked(selectReceipt);
const balance = jest.mocked(balancesApi.getBalances);
const preview = jest.mocked(settlementsApi.previewSettlement);
async function show(node: React.ReactElement) {
  const client = createQueryClient();
  await render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
async function form() {
  await show(<CreateExpenseScreen />);
  await screen.findByLabelText('消费名称');
  await fireEvent.changeText(screen.getByLabelText('消费名称'), ' 食堂午餐 ');
  await fireEvent.changeText(screen.getByLabelText('消费金额'), '120.00');
}
beforeEach(() => {
  jest.clearAllMocks();
  mockKeyNumber = 0;
  get.mockResolvedValue({ data: ledger });
  create.mockResolvedValue({ data: expense });
  list.mockResolvedValue({ data: [expense], page: { nextCursor: null } });
  detail.mockResolvedValue({ data: expense });
  upload.mockResolvedValue({
    data: { imageId, mimeType: 'image/jpeg', byteSize: 3, width: 1, height: 1 },
  });
  read.mockResolvedValue({ content: new Uint8Array([77, 97, 110]), mimeType: 'image/jpeg' });
  select.mockResolvedValue({ uri: 'file:///cache/receipt.jpg', byteSize: 3 });
  balance.mockResolvedValue({ data: balances });
  preview.mockResolvedValue({ data: plan });
  jest.mocked(setStringAsync).mockResolvedValue(true);
});
describe('expense flow with isolated API callbacks, not native/database proof', () => {
  it('rejects invalid amounts before writing and sends exact integer cents with actual member IDs', async () => {
    await form();
    await fireEvent.changeText(screen.getByLabelText('消费金额'), '1.001');
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    expect(create).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('消费金额'), '0.01');
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { ledgerId },
        body: expect.objectContaining({
          title: '食堂午餐',
          amountCents: '1',
          payerMemberId: userId,
          splitMode: 'EQUAL',
          splits: [{ memberId: userId }, { memberId: otherId }],
          receiptImageId: null,
        }),
      }),
      { idempotencyKey: 'expense-key-1' },
    );
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/expenses/[expenseId]',
      params: { ledgerId, expenseId },
    });
  });
  it('retains form, blocks duplicate submission and navigation, and explicitly retries an unknown result with the original key', async () => {
    let reject!: (error: Error) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await form();
    const submit = screen.getByRole('button', { name: '保存消费' });
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    await fireEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    reject(new ApiError('REQUEST_TIMEOUT', '保存结果尚未确认'));
    await screen.findByText('保存结果尚未确认');
    expect(screen.getByLabelText('消费名称')).toHaveDisplayValue(' 食堂午餐 ');
    expect(screen.getByLabelText('消费金额')).toBeDisabled();
    expect(create).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '重试原消费提交' }));
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });
  it('keeps permission/frozen errors without clearing editable input or retrying automatically', async () => {
    create.mockRejectedValueOnce(new ApiError('LEDGER_FROZEN', '账本已冻结，无法新增消费', 409));
    await form();
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    await screen.findByText('账本已冻结，无法新增消费');
    expect(screen.getByLabelText('消费名称')).toHaveDisplayValue(' 食堂午餐 ');
    expect(screen.getByLabelText('消费金额')).toBeEnabled();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('keeps creation unavailable for a frozen ledger', async () => {
    get.mockResolvedValueOnce({ data: { ...ledger, status: 'SETTLING' } });
    await show(<CreateExpenseScreen />);
    await screen.findByText('账本已冻结，无法新增消费。');
    expect(screen.queryByLabelText('消费金额')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('cancels a split draft and requires confirmation before discarding unsaved form input', async () => {
    await form();
    await userEvent.press(screen.getByRole('button', { name: '参与分摊' }));
    await userEvent.press(screen.getByRole('checkbox', { name: '参与分摊 小白' }));
    await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    await userEvent.press(screen.getByRole('button', { name: '参与分摊' }));
    expect(screen.getByRole('checkbox', { name: '参与分摊 小白' })).toBeChecked();
    await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    await userEvent.press(screen.getByRole('button', { name: '返回' }));
    expect(router.back).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '继续填写' }));
    expect(screen.getByLabelText('消费金额')).toHaveDisplayValue('120.00');
  });
  it('supports payer outside the split and integer shares without turning preview into a write', async () => {
    await form();
    await userEvent.press(screen.getByRole('button', { name: '付款人' }));
    await userEvent.press(screen.getByRole('radio', { name: '小白' }));
    await userEvent.press(screen.getByRole('button', { name: '分摊方式' }));
    await userEvent.press(screen.getByRole('radio', { name: '按份' }));
    await fireEvent.changeText(screen.getByLabelText('小安份数'), '2');
    await userEvent.press(screen.getByRole('checkbox', { name: '参与分摊 小白' }));
    expect(create).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '完成分摊设置' }));
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    expect(create.mock.calls[0]?.[0].body).toEqual(
      expect.objectContaining({
        payerMemberId: otherId,
        splitMode: 'SHARES',
        splits: [{ memberId: userId, shares: 2 }],
      }),
    );
  });
  it('blocks a mismatched custom total, then applies exact custom amounts and a validated date', async () => {
    await form();
    await userEvent.press(screen.getByRole('button', { name: '分摊方式' }));
    await userEvent.press(screen.getByRole('radio', { name: '按金额' }));
    await fireEvent.changeText(screen.getByLabelText('小安分摊金额'), '50');
    await fireEvent.changeText(screen.getByLabelText('小白分摊金额'), '40');
    await userEvent.press(screen.getByRole('button', { name: '完成分摊设置' }));
    expect(screen.getByText('分摊合计必须等于消费金额')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('小白分摊金额'), '70');
    await userEvent.press(screen.getByRole('button', { name: '完成分摊设置' }));
    await userEvent.press(screen.getByRole('button', { name: '日期' }));
    await fireEvent.changeText(screen.getByLabelText('日期 YYYY-MM-DD'), '2026-02-30');
    await userEvent.press(screen.getByRole('button', { name: '完成日期选择' }));
    expect(screen.getByText('请输入有效日期 YYYY-MM-DD')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('日期 YYYY-MM-DD'), '2026-10-24');
    await userEvent.press(screen.getByRole('button', { name: '完成日期选择' }));
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    expect(create.mock.calls[0]?.[0].body).toEqual(
      expect.objectContaining({
        occurredOn: '2026-10-24',
        splitMode: 'AMOUNT',
        splits: [
          { memberId: userId, amountCents: '5000' },
          { memberId: otherId, amountCents: '7000' },
        ],
      }),
    );
  });
  it('keeps an uploaded receipt ID after expense failure and never uploads it again on retry', async () => {
    create.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '连接中断'));
    await form();
    await userEvent.press(screen.getByRole('button', { name: '从相册选择' }));
    await screen.findByRole('button', { name: '移除收据' });
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    await screen.findByText('连接中断');
    expect(upload).toHaveBeenCalledWith(
      { kind: 'RECEIPT', ledgerId },
      { uri: 'file:///cache/receipt.jpg', name: 'receipt.jpg', type: 'image/jpeg' },
    );
    expect(create.mock.calls[0]?.[0].body.receiptImageId).toBe(imageId);
    await userEvent.press(screen.getByRole('button', { name: '重试原消费提交' }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });
  it('stops before expense creation when receipt upload fails and retries only on another save press', async () => {
    upload.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '上传失败'));
    await form();
    await userEvent.press(screen.getByRole('button', { name: '从相册选择' }));
    await screen.findByRole('button', { name: '移除收据' });
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    await screen.findByText('上传失败');
    expect(create).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('消费金额')).toHaveDisplayValue('120.00');
    await userEvent.press(screen.getByRole('button', { name: '保存消费' }));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('preserves receipt on cancelled selection and removes only its temporary file on explicit removal', async () => {
    await form();
    await userEvent.press(screen.getByRole('button', { name: '从相册选择' }));
    await screen.findByRole('button', { name: '移除收据' });
    select.mockResolvedValueOnce(null);
    await userEvent.press(screen.getByRole('button', { name: '从相册选择' }));
    expect(screen.getByRole('button', { name: '移除收据' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '移除收据' }));
    expect(removeReceiptFile).toHaveBeenCalledWith('file:///cache/receipt.jpg');
    expect(upload).not.toHaveBeenCalled();
  });
  it('filters through server queries, paginates with its cursor and hides stale rows after refresh failure', async () => {
    list.mockResolvedValueOnce({ data: [expense], page: { nextCursor: 'real-cursor' } });
    await show(<ExpenseList ledger={ledger} userId={userId} />);
    await screen.findByRole('button', { name: '查看消费 食堂午餐' });
    list.mockResolvedValueOnce({
      data: [{ ...expense, id: otherId, title: '车费' }],
      page: { nextCursor: null },
    });
    await userEvent.press(screen.getByRole('button', { name: '加载更多消费' }));
    await screen.findByRole('button', { name: '查看消费 车费' });
    expect(list.mock.calls[1]?.[0].query.cursor).toBe('real-cursor');
    await userEvent.press(screen.getByRole('button', { name: '筛选' }));
    await userEvent.press(screen.getByRole('radio', { name: '交通' }));
    await userEvent.press(screen.getByRole('button', { name: '应用筛选' }));
    await screen.findByRole('button', { name: '查看消费 食堂午餐' });
    expect(list.mock.calls.at(-1)?.[0].query.category).toBe('TRANSPORT');
    list.mockRejectedValueOnce(new ApiError('FORBIDDEN', '无权访问消费', 403));
    await userEvent.press(screen.getByRole('button', { name: '刷新流水' }));
    await screen.findByText('无权访问消费');
    expect(screen.queryByRole('button', { name: '查看消费 食堂午餐' })).toBeNull();
  });
  it('keeps filter drafts local, rejects invalid dates and cancels without changing the active query', async () => {
    await show(<ExpenseList ledger={ledger} userId={userId} />);
    await screen.findByRole('button', { name: '查看消费 食堂午餐' });
    await userEvent.press(screen.getByRole('button', { name: '筛选' }));
    await userEvent.press(screen.getByRole('radio', { name: '选择日期范围' }));
    await userEvent.press(screen.getByRole('button', { name: '应用筛选' }));
    expect(screen.getByText('请填写开始或结束日期')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('开始日期 YYYY-MM-DD'), '2026-11-01');
    await fireEvent.changeText(screen.getByLabelText('结束日期 YYYY-MM-DD'), '2026-10-01');
    await userEvent.press(screen.getByRole('radio', { name: '小白' }));
    expect(screen.getByRole('radio', { name: '小白', selected: true })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '应用筛选' }));
    expect(screen.getByText('请填写有效日期，开始日期不能晚于结束日期')).toBeOnTheScreen();
    expect(list).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    expect(screen.getByRole('button', { name: '查看消费 食堂午餐' })).toBeOnTheScreen();
    expect(list).toHaveBeenCalledTimes(1);
  });
  it('reads actual split details and authorized receipt bytes only on demand', async () => {
    detail.mockResolvedValueOnce({ data: { ...expense, receiptImageId: imageId } });
    await show(<ExpenseDetailScreen />);
    await screen.findByText('食堂午餐');
    expect(read).not.toHaveBeenCalled();
    expect(screen.getAllByText('¥60.00')).toHaveLength(2);
    await userEvent.press(screen.getByRole('button', { name: '查看收据' }));
    await screen.findByLabelText('收据图片');
    expect(read).toHaveBeenCalledWith(imageId);
    await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
  });
  it('never shows expense contents when the server rejects membership', async () => {
    detail.mockRejectedValueOnce(new ApiError('FORBIDDEN', '无权访问该消费', 403));
    await show(<ExpenseDetailScreen />);
    await screen.findByText('无权访问该消费');
    expect(screen.queryByText('食堂午餐')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it('does not fall back to a cached receipt after a failed authorized read', async () => {
    read.mockRejectedValueOnce(new ApiError('FORBIDDEN', '无权读取图片', 403));
    await show(<ReceiptImage imageId={imageId} />);
    await screen.findByText('无权读取图片');
    expect(screen.queryByLabelText('收据图片')).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '重试' }));
    await screen.findByLabelText('收据图片');
    expect(read).toHaveBeenCalledTimes(2);
    expect(imageDataUri(new Uint8Array([77, 97, 110]), 'image/jpeg')).toBe(
      'data:image/jpeg;base64,TWFu',
    );
  });
  it('shows real balances and copies only the server preview without starting settlement', async () => {
    await show(<BalancesScreen />);
    await screen.findByText('+¥60.00');
    expect(screen.getByText('−¥60.00')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '预览结算' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement-preview',
      params: { ledgerId },
    });
  });
  it('reports clipboard failures honestly and never writes from settlement preview', async () => {
    await show(<SettlementPreviewScreen />);
    await screen.findByText('转账明细');
    jest.mocked(setStringAsync).mockResolvedValueOnce(false);
    await userEvent.press(screen.getByRole('button', { name: '复制完整方案' }));
    await screen.findByText('复制失败，请稍后手动重试');
    expect(screen.queryByText('结算方案已复制')).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: '复制完整方案' }));
    await screen.findByText('结算方案已复制');
    expect(setStringAsync).toHaveBeenLastCalledWith(expect.stringContaining('小白 → 小安 ¥60.00'));
    expect(settlementsApi.startSettlement).not.toHaveBeenCalled();
  });
  it('allocates cent remainders by stable member ID and conserves custom/share totals', () => {
    const settings = { mode: 'EQUAL' as const, memberIds: [otherId, userId], values: {} };
    expect(splitPreview(1n, settings)).toEqual([
      { memberId: userId, amountCents: 1n },
      { memberId: otherId, amountCents: 0n },
    ]);
    expect(
      splitPreview(10000n, {
        mode: 'SHARES',
        memberIds: [userId, otherId],
        values: { [userId]: '2', [otherId]: '1' },
      }).map((s) => s.amountCents),
    ).toEqual([6667n, 3333n]);
  });
});
