import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { EndpointOutput } from '@tongzhang/contracts';
import StatisticsScreen from '../src/features/balances/screens/StatisticsScreen';
import { centsRatio } from '../src/features/balances/components/StatisticsCharts';
import { balancesApi } from '../src/features/balances/api';
import { ledgersApi } from '../src/features/ledgers/api';
import { createQueryClient } from '../src/lib/query-client';

const userId = '00000000-0000-4000-8000-000000000001';
const ledgerId = '00000000-0000-4000-8000-000000000002';
const m1 = '00000000-0000-4000-8000-000000000011';
const m2 = '00000000-0000-4000-8000-000000000012';
const m3 = '00000000-0000-4000-8000-000000000013';
const m4 = '00000000-0000-4000-8000-000000000014';
const e1 = '00000000-0000-4000-8000-000000000021';
const e2 = '00000000-0000-4000-8000-000000000022';
const e3 = '00000000-0000-4000-8000-000000000023';

jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: userId } }) }));
jest.mock('../src/features/ledgers/api', () => ({ ledgersApi: { getLedger: jest.fn() } }));
jest.mock('../src/features/balances/api', () => ({
  balancesApi: { getBalances: jest.fn(), getStatistics: jest.fn() },
}));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ ledgerId }),
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

const timestamp = '2026-11-18T00:00:00.000Z';
const ledger: EndpointOutput<'getLedger'>['data'] = {
  id: ledgerId,
  name: '鼓山一日',
  coverKey: 'mountain',
  coverImageId: null,
  status: 'ACTIVE',
  version: 4,
  memberCount: 4,
  expenseTotalCents: '30000',
  myRemainingNetCents: '3000',
  archivedAt: null,
  createdAt: timestamp,
  creatorUserId: userId,
  myMemberId: m1,
  myPaidCents: '12000',
  mySharedCents: '9000',
  myNetCents: '3000',
  members: [],
};

const gushanStatistics: EndpointOutput<'getStatistics'>['data'] = {
  expenseTotalCents: '30000',
  expenseCount: 3,
  categories: [
    { category: 'DINING', amountCents: '12000', expenseCount: 1, percentage: '40.0' },
    { category: 'TICKET', amountCents: '12000', expenseCount: 1, percentage: '40.0' },
    { category: 'TRANSPORT', amountCents: '6000', expenseCount: 1, percentage: '20.0' },
  ],
  dailyTrend: [
    { date: '2026-11-17', amountCents: '12000', expenseCount: 1 },
    { date: '2026-11-18', amountCents: '18000', expenseCount: 2 },
  ],
  dailyTrendTruncated: false,
  topExpenses: [
    {
      id: e1,
      title: '食堂午餐',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-17',
      payerMemberId: m1,
      payerName: '小安',
    },
    {
      id: e2,
      title: '景区门票',
      amountCents: '12000',
      category: 'TICKET',
      occurredOn: '2026-11-18',
      payerMemberId: m2,
      payerName: '小白',
    },
    {
      id: e3,
      title: '往返车费',
      amountCents: '6000',
      category: 'TRANSPORT',
      occurredOn: '2026-11-18',
      payerMemberId: m3,
      payerName: '小陈',
    },
  ],
  members: [
    { memberId: m1, username: '小安', paidCents: '12000', sharedCents: '9000', netCents: '3000' },
    { memberId: m2, username: '小白', paidCents: '12000', sharedCents: '6000', netCents: '6000' },
    { memberId: m3, username: '小陈', paidCents: '6000', sharedCents: '9000', netCents: '-3000' },
    { memberId: m4, username: '小丁', paidCents: '0', sharedCents: '6000', netCents: '-6000' },
  ],
};

const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <StatisticsScreen />
    </QueryClientProvider>,
  );

describe('StatisticsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: ledger });
    jest.mocked(balancesApi.getStatistics).mockResolvedValue({ data: gushanStatistics });
  });

  it('computes safe integer ratios without division by zero or NaN', () => {
    expect(centsRatio('0', 0n)).toBe(0);
    expect(centsRatio('12000', 0n)).toBe(0);
    expect(centsRatio('12000', 30000n)).toBe(0.4);
    expect(centsRatio('30000', 30000n)).toBe(1);
    expect(Number.isNaN(centsRatio('0', 0n))).toBe(false);
  });

  it('renders empty state cleanly for zero-expense ledger', async () => {
    jest.mocked(balancesApi.getStatistics).mockResolvedValueOnce({
      data: {
        expenseTotalCents: '0',
        expenseCount: 0,
        categories: [],
        dailyTrend: [],
        dailyTrendTruncated: false,
        topExpenses: [],
        members: [],
      },
    });
    await show();
    await screen.findByText('暂无消费统计');
    expect(screen.queryByTestId('category-donut-svg')).toBeNull();
    expect(screen.queryByTestId('daily-trend-svg')).toBeNull();
  });

  it('renders multi-category donut, daily trend, top expenses and member comparison for Gushan benchmark', async () => {
    await show();
    await screen.findByTestId('category-donut-svg');
    expect(screen.getByTestId('daily-trend-svg')).toBeOnTheScreen();
    expect(screen.getByTestId(`member-bar-svg-${m1}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`member-bar-svg-${m4}`)).toBeOnTheScreen();
    expect(screen.getByText('鼓山一日 · 3 笔有效消费')).toBeOnTheScreen();
    expect(screen.getByText('餐饮')).toBeOnTheScreen();
    expect(screen.getByText('门票')).toBeOnTheScreen();
    expect(screen.getByText('交通')).toBeOnTheScreen();
    expect(screen.getByText('小丁')).toBeOnTheScreen();
    expect(screen.queryByText(/账本消费天数超过上限/)).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: '第 1 名 食堂午餐 ¥120.00' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/expenses/[expenseId]',
      params: { ledgerId, expenseId: e1 },
    });
  });

  it('renders truncation banner when dailyTrendTruncated is true', async () => {
    jest.mocked(balancesApi.getStatistics).mockResolvedValueOnce({
      data: {
        ...gushanStatistics,
        dailyTrendTruncated: true,
      },
    });
    await show();
    await screen.findByText('账本消费天数超过上限，当前仅展示最近 2 天的按日趋势。');
  });

  it('shows explicit error state on statistics failure and recovers on manual retry', async () => {
    jest
      .mocked(balancesApi.getStatistics)
      .mockRejectedValueOnce(new Error('网络连接失败'))
      .mockResolvedValueOnce({ data: gushanStatistics });
    await show();
    await screen.findByText('暂时无法读取支出统计');
    expect(screen.queryByTestId('category-donut-svg')).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: '重试' }));
    await screen.findByTestId('category-donut-svg');
    expect(screen.getByTestId('daily-trend-svg')).toBeOnTheScreen();
    expect(balancesApi.getStatistics).toHaveBeenCalledTimes(2);
  });

  it('renders single-category and settled read-only statistics with zero-paid member without NaN', async () => {
    jest.mocked(ledgersApi.getLedger).mockResolvedValueOnce({
      data: { ...ledger, status: 'SETTLED' },
    });
    jest.mocked(balancesApi.getStatistics).mockResolvedValueOnce({
      data: {
        expenseTotalCents: '10001',
        expenseCount: 1,
        categories: [
          { category: 'DINING', amountCents: '10001', expenseCount: 1, percentage: '100.0' },
        ],
        dailyTrend: [{ date: '2026-11-18', amountCents: '10001', expenseCount: 1 }],
        dailyTrendTruncated: false,
        topExpenses: [
          {
            id: e1,
            title: '聚餐',
            amountCents: '10001',
            category: 'DINING',
            occurredOn: '2026-11-18',
            payerMemberId: m1,
            payerName: '小安',
          },
        ],
        members: [
          {
            memberId: m1,
            username: '小安',
            paidCents: '10001',
            sharedCents: '10001',
            netCents: '0',
          },
          { memberId: m2, username: '小白', paidCents: '0', sharedCents: '0', netCents: '0' },
        ],
      },
    });
    await show();
    await screen.findByTestId('category-donut-svg');
    expect(screen.getByTestId('daily-trend-svg')).toBeOnTheScreen();
    expect(screen.getByTestId(`member-bar-svg-${m2}`)).toBeOnTheScreen();
    expect(screen.getByText('已结清')).toBeOnTheScreen();
    expect(screen.getByText('鼓山一日 · 1 笔有效消费')).toBeOnTheScreen();
  });
});
