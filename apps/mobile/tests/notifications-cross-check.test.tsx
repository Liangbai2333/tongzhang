import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { EndpointOutput, NotificationItem, UserSelf } from '@tongzhang/contracts';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { NotificationsSheet } from '../src/features/profile/components/NotificationsSheet';
import AccountScreen from '../src/features/profile/screens/AccountScreen';
import SettlementRecordScreen from '../src/features/settlements/screens/SettlementRecordScreen';
import { profileApi } from '../src/features/profile/api';
import { profileKeys } from '../src/features/profile/query-keys';
import { ledgersApi } from '../src/features/ledgers/api';
import { settlementsApi } from '../src/features/settlements/api';
import { ApiError } from '../src/lib/api-error';
import { createQueryClient } from '../src/lib/query-client';

const userA: UserSelf = {
  id: '00000000-0000-4000-8000-0000000000a1',
  username: '小安',
  email: 'an@example.test',
  notificationEnabled: true,
};
const userB: UserSelf = {
  id: '00000000-0000-4000-8000-0000000000b2',
  username: '小白',
  email: 'bai@example.test',
  notificationEnabled: true,
};
const ledgerId = '00000000-0000-4000-8000-0000000000c1';
const ledgerId2 = '00000000-0000-4000-8000-0000000000c2';
const transferId = '00000000-0000-4000-8000-0000000000d1';
const batchId = '00000000-0000-4000-8000-0000000000e1';
const notifId1 = '00000000-0000-4000-8000-0000000000f1';
const notifId2 = '00000000-0000-4000-8000-0000000000f2';
const notifId3 = '00000000-0000-4000-8000-0000000000f3';
const notifIdB = '00000000-0000-4000-8000-0000000000f4';
const timestamp = '2026-11-20T08:00:00.000Z';

let mockKeySeq = 0;
let mockSessionVersion = 0;
let mockTokenListener: ((reason?: unknown) => void) | null = null;

const mockRestore = jest.fn<() => Promise<{ data: UserSelf }>>();
const mockLogin = jest.fn<() => Promise<void>>();
const mockLogout = jest.fn<() => Promise<{ serverRevoked: boolean; localCleared: boolean }>>();

jest.mock('../src/features/auth/api', () => ({
  authApi: {
    restore: () => mockRestore(),
    login: () => mockLogin(),
    register: jest.fn(),
    logout: () => mockLogout(),
  },
}));

jest.mock('../src/lib/session-token', () => ({
  sessionToken: {
    version: () => mockSessionVersion,
    clear: jest.fn(async () => {
      mockSessionVersion++;
      mockTokenListener?.();
      return mockSessionVersion;
    }),
    subscribe: (listener: (reason?: unknown) => void) => {
      mockTokenListener = listener;
      return () => {
        if (mockTokenListener === listener) mockTokenListener = null;
      };
    },
  },
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: jest.fn() }),
}));

jest.mock('../src/features/profile/api', () => ({
  profileApi: {
    getMe: jest.fn(),
    updateProfile: jest.fn(),
    updatePreferences: jest.fn(),
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
  },
}));

jest.mock('../src/features/ledgers/api', () => ({
  ledgersApi: {
    getLedger: jest.fn(),
    listLedgers: jest.fn(),
    archiveLedger: jest.fn(),
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

jest.mock('../src/lib/api', () => ({
  createIdempotencyKey: () => `notif-check-key-${++mockKeySeq}`,
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

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: notifId1,
    type: 'SETTLEMENT_REMINDER',
    ledgerId,
    ledgerName: '鼓山一日',
    transferId,
    actorUserId: userB.id,
    actorName: '小白',
    amountCents: '6000',
    note: '请核对这笔转账',
    readAt: null,
    createdAt: timestamp,
    ...overrides,
  };
}

function makeSettlingLedger(): EndpointOutput<'getLedger'>['data'] {
  return {
    id: ledgerId,
    name: '鼓山一日',
    coverKey: 'mountain',
    coverImageId: null,
    status: 'SETTLING',
    version: 3,
    memberCount: 2,
    expenseTotalCents: '12000',
    myRemainingNetCents: '6000',
    archivedAt: null,
    createdAt: timestamp,
    creatorUserId: userA.id,
    myMemberId: userA.id,
    myPaidCents: '12000',
    mySharedCents: '6000',
    myNetCents: '6000',
    members: [
      {
        id: userA.id,
        userId: userA.id,
        username: '小安',
        role: 'CREATOR',
        joinedAt: timestamp,
        netCents: '6000',
        remainingNetCents: '6000',
      },
      {
        id: userB.id,
        userId: userB.id,
        username: '小白',
        role: 'MEMBER',
        joinedAt: timestamp,
        netCents: '-6000',
        remainingNetCents: '-6000',
      },
    ],
  };
}

function makePendingSettlement(): EndpointOutput<'getSettlement'>['data'] {
  return {
    id: batchId,
    ledgerId,
    sourceVersion: 3,
    expenseTotalCents: '12000',
    transferTotalCents: '6000',
    transferCount: 1,
    algorithmVersion: 'exact-min-transfers-v1',
    createdAt: timestamp,
    ledgerStatus: 'SETTLING',
    transfers: [
      {
        id: transferId,
        sequence: 1,
        payerMemberId: userB.id,
        payeeMemberId: userA.id,
        amountCents: '6000',
        status: 'PENDING',
        registeredByMemberId: null,
        registeredAt: null,
        registrationNote: null,
      },
    ],
    progress: { paidCount: 0, totalCount: 1, remainingCents: '6000' },
    netSnapshot: [
      { memberId: userA.id, netCents: '6000' },
      { memberId: userB.id, netCents: '-6000' },
    ],
  };
}

type FiberNode = {
  memoizedProps?: { onPress?: () => void };
  return?: FiberNode | null;
};

function findOnPress(element: object): () => void {
  let fiber =
    'unstable_fiber' in element ? (element.unstable_fiber as FiberNode | null | undefined) : null;
  while (fiber) {
    if (typeof fiber.memoizedProps?.onPress === 'function') {
      return fiber.memoizedProps.onPress;
    }
    fiber = fiber.return;
  }
  throw new Error('Expected an onPress handler on component fiber');
}

function AuthenticatedGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : null;
}

function AuthIsolationHarness() {
  const auth = useAuth();
  return (
    <View>
      <Text testID="auth-status">
        {auth.status}:{auth.user?.id ?? 'none'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新登录账号"
        onPress={() => {
          void auth.login({
            params: {},
            query: {},
            body: { account: 'bai@example.test', password: 'password-2026' },
          });
        }}
      >
        <Text>重新登录账号</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="触发退出登录"
        onPress={() => {
          void auth.logout();
        }}
      >
        <Text>触发退出登录</Text>
      </Pressable>
    </View>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKeySeq = 0;
  mockSessionVersion = 0;
  mockTokenListener = null;
  mockRestore.mockResolvedValue({ data: userA });
  mockLogin.mockImplementation(async () => {
    mockSessionVersion++;
    mockTokenListener?.();
    mockSessionVersion++;
    mockTokenListener?.();
  });
  mockLogout.mockImplementation(async () => {
    mockSessionVersion++;
    mockTokenListener?.();
    return { serverRevoked: true, localCleared: true };
  });
  jest.mocked(ledgersApi.listLedgers).mockResolvedValue({
    data: [],
    page: { nextCursor: null },
  });
});

describe('B13/B14 notifications cross-check regressions (iOS & Android)', () => {
  it('supports A33 cursor pagination, manual retry without auto-retry, and unreadOnly filtering', async () => {
    const page1Unread = makeNotification({ id: notifId1, ledgerName: '鼓山一日', readAt: null });
    const page1Read = makeNotification({
      id: notifId2,
      ledgerId: ledgerId2,
      ledgerName: '海边夜宵',
      amountCents: '3000',
      readAt: timestamp,
    });
    const page2Unread = makeNotification({
      id: notifId3,
      ledgerId: ledgerId2,
      ledgerName: '周末露营',
      amountCents: '4500',
      readAt: null,
    });

    jest
      .mocked(profileApi.listNotifications)
      .mockResolvedValueOnce({
        data: [page1Unread, page1Read],
        page: { nextCursor: 'cursor-page-2' },
      })
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({ data: [page2Unread], page: { nextCursor: null } })
      .mockResolvedValueOnce({ data: [page1Unread, page2Unread], page: { nextCursor: null } });

    const client = createQueryClient();
    await render(
      <QueryClientProvider client={client}>
        <NotificationsSheet visible userId={userA.id} onClose={jest.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('鼓山一日')).toBeOnTheScreen();
    expect(screen.getByText('海边夜宵')).toBeOnTheScreen();

    // Load more fails once -> shows manual retry without auto-retrying
    await userEvent.press(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText(/网络异常，请检查连接后手动重试/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '重试加载更多' })).toBeOnTheScreen();
    expect(profileApi.listNotifications).toHaveBeenCalledTimes(2);

    // Manual retry loads page 2 using exact cursor
    await userEvent.press(screen.getByRole('button', { name: '重试加载更多' }));
    expect(await screen.findByText('周末露营')).toBeOnTheScreen();
    expect(profileApi.listNotifications).toHaveBeenNthCalledWith(3, {
      params: {},
      query: { unreadOnly: 'false', limit: 20, cursor: 'cursor-page-2' },
      body: undefined,
    });

    // Switch to unreadOnly filter -> excludes read items
    await userEvent.press(screen.getByRole('button', { name: '仅看未读' }));
    await waitFor(() =>
      expect(profileApi.listNotifications).toHaveBeenNthCalledWith(4, {
        params: {},
        query: { unreadOnly: 'true', limit: 20, cursor: undefined },
        body: undefined,
      }),
    );
    expect(screen.getByText('鼓山一日')).toBeOnTheScreen();
    expect(screen.getByText('周末露营')).toBeOnTheScreen();
    expect(screen.queryByText('海边夜宵')).toBeNull();
  });

  it('enforces A34 recipient-only 403 block, double-tap lock, idempotent mark-read, and settlement deep link', async () => {
    const unread = makeNotification({ id: notifId1, ledgerName: '鼓山一日', readAt: null });
    const read = makeNotification({
      id: notifId2,
      ledgerId: ledgerId2,
      ledgerName: '已读账本',
      readAt: timestamp,
    });

    let resolveRead!: (value: EndpointOutput<'markNotificationRead'>) => void;
    const deferredRead = new Promise<EndpointOutput<'markNotificationRead'>>((resolve) => {
      resolveRead = resolve;
    });

    jest.mocked(profileApi.listNotifications).mockResolvedValue({
      data: [unread, read],
      page: { nextCursor: null },
    });
    jest
      .mocked(profileApi.markNotificationRead)
      .mockRejectedValueOnce(new ApiError('FORBIDDEN', '仅提醒接收人本人可标记已读', 403))
      .mockReturnValueOnce(deferredRead);

    const client = createQueryClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const onClose = jest.fn();

    await render(
      <QueryClientProvider client={client}>
        <NotificationsSheet visible userId={userA.id} onClose={onClose} />
      </QueryClientProvider>,
    );

    const unreadButton = await screen.findByRole('button', { name: /鼓山一日.*未读/ });

    // Non-recipient 403 -> blocks navigation, keeps unread, zero auto-retry
    await userEvent.press(unreadButton);
    expect(await screen.findByText('仅提醒接收人本人可标记已读')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(profileApi.markNotificationRead).toHaveBeenCalledTimes(1);

    // Synchronous double-tap in the same turn before React disables the button -> markingLockRef permits only 1 A34 call
    const triggerPress = findOnPress(unreadButton);
    await act(async () => {
      triggerPress();
      triggerPress();
    });
    expect(profileApi.markNotificationRead).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRead({
        data: { notificationId: notifId1, readAt: '2026-11-20T09:00:00.000Z' },
      });
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['user', userA.id, 'notifications'],
    });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId },
    });

    // Tapping an already-read item navigates directly without calling A34
    const readButton = screen.getByRole('button', { name: /已读账本.*已读/ });
    await userEvent.press(readButton);
    expect(profileApi.markNotificationRead).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId: ledgerId2 },
    });
  });

  it('reflects A28 actorName rename immediately on sheet reopen (staleTime: 0) and manual refresh', async () => {
    jest
      .mocked(profileApi.listNotifications)
      .mockResolvedValueOnce({
        data: [makeNotification({ actorName: '小白' })],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: [makeNotification({ actorName: '小白改名版' })],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: [makeNotification({ actorName: '小白终版' })],
        page: { nextCursor: null },
      });

    const client = createQueryClient();
    const view = await render(
      <QueryClientProvider client={client}>
        <NotificationsSheet visible userId={userA.id} onClose={jest.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/小白 提醒你处理待还转账 ¥60\.00/)).toBeOnTheScreen();

    // Close and immediately reopen within <100ms (inside default 15s query staleTime)
    await view.rerender(
      <QueryClientProvider client={client}>
        <NotificationsSheet visible={false} userId={userA.id} onClose={jest.fn()} />
      </QueryClientProvider>,
    );
    await view.rerender(
      <QueryClientProvider client={client}>
        <NotificationsSheet visible userId={userA.id} onClose={jest.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/小白改名版 提醒你处理待还转账 ¥60\.00/)).toBeOnTheScreen();
    expect(profileApi.listNotifications).toHaveBeenCalledTimes(2);

    // Explicit manual refresh updates immediately as well
    await userEvent.press(screen.getByRole('button', { name: '刷新提醒' }));
    expect(await screen.findByText(/小白终版 提醒你处理待还转账 ¥60\.00/)).toBeOnTheScreen();
    expect(profileApi.listNotifications).toHaveBeenCalledTimes(3);
  });

  it('isolates notification local state, in-flight A34 calls, and QueryClient cache across account switches and logout', async () => {
    let resolveInFlightA34!: (value: EndpointOutput<'markNotificationRead'>) => void;
    const inFlightA34 = new Promise<EndpointOutput<'markNotificationRead'>>((resolve) => {
      resolveInFlightA34 = resolve;
    });

    jest.mocked(profileApi.listNotifications).mockImplementation(async ({ query }) => ({
      data: [
        query.unreadOnly === 'true'
          ? makeNotification({ id: notifId1, ledgerName: '账号A未读提醒', readAt: null })
          : makeNotification({ id: notifIdB, ledgerName: '账号B全部提醒', readAt: timestamp }),
      ],
      page: { nextCursor: null },
    }));
    jest.mocked(profileApi.markNotificationRead).mockReturnValueOnce(inFlightA34);

    // Part A: NotificationsSheet prop switch resets unreadOnly and ignores late A34 completion from previous user
    const onClose = jest.fn();
    const sheetClient = createQueryClient();
    const sheetView = await render(
      <QueryClientProvider client={sheetClient}>
        <NotificationsSheet visible userId={userA.id} onClose={onClose} />
      </QueryClientProvider>,
    );

    await userEvent.press(await screen.findByRole('button', { name: '仅看未读' }));
    expect(await screen.findByText('账号A未读提醒')).toBeOnTheScreen();

    // Trigger A34 for userA while in-flight, then switch userId to userB
    await fireEvent.press(screen.getByRole('button', { name: /账号A未读提醒.*未读/ }));
    await sheetView.rerender(
      <QueryClientProvider client={sheetClient}>
        <NotificationsSheet visible userId={userB.id} onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('账号B全部提醒')).toBeOnTheScreen();
    expect(profileApi.listNotifications).toHaveBeenLastCalledWith({
      params: {},
      query: { unreadOnly: 'false', limit: 20, cursor: undefined },
      body: undefined,
    });

    // Late A34 resolution from userA must NOT close userB's sheet or navigate
    await act(async () => {
      resolveInFlightA34({
        data: { notificationId: notifId1, readAt: '2026-11-20T09:05:00.000Z' },
      });
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    await sheetView.unmount();

    // Part B: Real AuthProvider clears userA notification caches on cross-account login and userB caches on logout
    const authClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    authClient.setQueryData(profileKeys.notifications(userA.id, false), {
      pages: [{ data: [makeNotification({ id: notifId1 })], page: { nextCursor: null } }],
      pageParams: [undefined],
    });
    authClient.setQueryData(profileKeys.notifications(userA.id, true), {
      pages: [{ data: [makeNotification({ id: notifId1 })], page: { nextCursor: null } }],
      pageParams: [undefined],
    });

    await render(
      <QueryClientProvider client={authClient}>
        <AuthProvider>
          <AuthIsolationHarness />
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('auth-status')).toHaveTextContent(`authenticated:${userA.id}`);

    // 401 enters reauthentication; logging in as userB clears userA's notification queries
    await act(async () => {
      mockSessionVersion++;
      mockTokenListener?.(new ApiError('UNAUTHENTICATED', 'expired', 401));
    });
    expect(screen.getByTestId('auth-status')).toHaveTextContent(`reauthentication:${userA.id}`);

    mockRestore.mockResolvedValueOnce({ data: userB });
    await userEvent.press(screen.getByRole('button', { name: '重新登录账号' }));
    expect(await screen.findByTestId('auth-status')).toHaveTextContent(`authenticated:${userB.id}`);
    expect(authClient.getQueryData(profileKeys.notifications(userA.id, false))).toBeUndefined();
    expect(authClient.getQueryData(profileKeys.notifications(userA.id, true))).toBeUndefined();

    // Seed userB notification cache -> explicit logout clears it too
    authClient.setQueryData(profileKeys.notifications(userB.id, false), {
      pages: [{ data: [makeNotification({ id: notifIdB })], page: { nextCursor: null } }],
      pageParams: [undefined],
    });
    await userEvent.press(screen.getByRole('button', { name: '触发退出登录' }));
    expect(await screen.findByTestId('auth-status')).toHaveTextContent('anonymous:none');
    expect(authClient.getQueryData(profileKeys.notifications(userB.id, false))).toBeUndefined();
  });

  it('keeps A29 notification_enabled=false silent on reminders while historical items remain readable/markable', async () => {
    const historicalUnread = makeNotification({
      id: notifId1,
      ledgerName: '历史未读账本',
      readAt: null,
    });
    jest.mocked(profileApi.updatePreferences).mockResolvedValueOnce({
      data: { notificationEnabled: false },
    });
    jest.mocked(profileApi.listNotifications).mockResolvedValue({
      data: [historicalUnread],
      page: { nextCursor: null },
    });
    jest.mocked(profileApi.markNotificationRead).mockResolvedValueOnce({
      data: { notificationId: notifId1, readAt: '2026-11-20T09:10:00.000Z' },
    });

    const client = createQueryClient();
    const accountView = await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AccountScreen />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // 1. Toggle A29 notification preference off via real AccountScreen + real AuthProvider
    await userEvent.press(await screen.findByRole('button', { name: '设置' }));
    expect(screen.getByText('已开启站内提醒通知')).toBeOnTheScreen();
    await fireEvent(screen.getByLabelText('通知开关'), 'valueChange', false);
    await waitFor(() =>
      expect(profileApi.updatePreferences).toHaveBeenCalledWith({
        params: {},
        query: {},
        body: { notificationEnabled: false },
      }),
    );
    expect(await screen.findByText('已关闭站内提醒通知')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
    await waitFor(() => expect(screen.queryByRole('header', { name: '设置' })).toBeNull());

    // 2. Historical notification remains readable and markable via A34 even while A29 is off
    await userEvent.press(screen.getByRole('button', { name: '站内提醒' }));
    expect(await screen.findByText('历史未读账本')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: /历史未读账本.*未读/ }));
    await waitFor(() =>
      expect(profileApi.markNotificationRead).toHaveBeenCalledWith({
        params: { notificationId: notifId1 },
        query: {},
        body: undefined,
      }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/ledgers/[ledgerId]/settlement',
      params: { ledgerId },
    });
    await accountView.unmount();

    // 3. Sender side (A32) success and 429 cooldown never leak payer's A29 preference
    const settlingLedger = makeSettlingLedger();
    jest.mocked(ledgersApi.getLedger).mockResolvedValue({ data: settlingLedger });
    jest.mocked(settlementsApi.getSettlement).mockResolvedValue({ data: makePendingSettlement() });
    jest
      .mocked(settlementsApi.remindTransfer)
      .mockResolvedValueOnce({
        data: {
          ledgerId,
          transferId,
          remindedAt: '2026-11-20T09:15:00.000Z',
          cooldownEndsAt: '2099-11-20T15:15:00.000Z',
        },
      })
      .mockRejectedValueOnce(new ApiError('REMINDER_COOLDOWN', 'cooldown', 429));

    const settlementView1 = await render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <AuthenticatedGate>
            <SettlementRecordScreen ledger={settlingLedger} />
          </AuthenticatedGate>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await userEvent.press(await screen.findByRole('button', { name: '提醒对方' }));
    await userEvent.press(screen.getByRole('button', { name: '确认发送提醒' }));
    expect(await screen.findByText('已发送站内催还提醒，6 小时内不可重复催还。')).toBeOnTheScreen();
    expect(screen.queryByText(/关闭通知|未开启通知|静默|notificationEnabled/)).toBeNull();
    await settlementView1.unmount();

    await render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <AuthenticatedGate>
            <SettlementRecordScreen ledger={settlingLedger} />
          </AuthenticatedGate>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await userEvent.press(await screen.findByRole('button', { name: '提醒对方' }));
    await userEvent.press(screen.getByRole('button', { name: '确认发送提醒' }));
    expect(await screen.findByText(/6 小时催还冷却期内/)).toBeOnTheScreen();
    expect(screen.queryByText(/关闭通知|未开启通知|静默|notificationEnabled/)).toBeNull();
  });
});
