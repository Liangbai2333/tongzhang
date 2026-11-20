import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api-error';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';

const userA = {
  id: '00000000-0000-4000-8000-0000000000a1',
  username: '小安',
  email: 'an@example.test',
  notificationEnabled: true,
};
const userB = {
  id: '00000000-0000-4000-8000-0000000000b2',
  username: '小白',
  email: 'bai@example.test',
  notificationEnabled: true,
};

let mockKeySeq = 0;
let mockVersion = 0;
let mockInvalidation: (reason?: unknown) => void;
let mockNetwork: (state: { isConnected: boolean }) => void;

const mockRestore = jest.fn<() => Promise<{ data: typeof userA }>>();
const mockLogin = jest.fn<() => Promise<void>>();
const mockLogout = jest.fn<() => Promise<{ serverRevoked: boolean; localCleared: boolean }>>();

jest.mock('@/lib/api', () => ({
  createIdempotencyKey: () => `gate-401-key-${++mockKeySeq}`,
}));
jest.mock('@/features/auth/api', () => ({
  authApi: {
    restore: () => mockRestore(),
    login: () => mockLogin(),
    register: jest.fn(),
    logout: () => mockLogout(),
  },
}));
jest.mock('@/lib/session-token', () => ({
  sessionToken: {
    version: () => mockVersion,
    clear: jest.fn(),
    subscribe: (cb: (reason?: unknown) => void) => {
      mockInvalidation = cb;
      return () => undefined;
    },
  },
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: (cb: (state: { isConnected: boolean }) => void) => {
    mockNetwork = cb;
    return { remove: jest.fn() };
  },
}));

function ProtectedWriteHarness({
  sendWrite,
}: {
  sendWrite: (key: string, draft: string) => Promise<{ saved: true }>;
}) {
  const auth = useAuth();
  const write = useIdempotentWrite();
  const [draft, setDraft] = useState('鼓山食堂 120 元');
  const [savedCount, setSavedCount] = useState(0);

  return (
    <View>
      <Text testID="auth-state">
        {auth.status}:{auth.user?.username ?? 'none'}
      </Text>
      <TextInput accessibilityLabel="草稿输入" value={draft} onChangeText={setDraft} />
      <Text testID="draft-value">{draft}</Text>
      <Text testID="saved-count">{String(savedCount)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="手动提交"
        onPress={async () => {
          const ok = await write.submit({ draft }, (key) => sendWrite(key, draft));
          if (ok) setSavedCount((n) => n + 1);
        }}
      >
        <Text>手动提交</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新登录核验"
        onPress={() => {
          void auth.login({
            params: {},
            query: {},
            body: { account: 'an@example.test', password: 'password-2026' },
          });
        }}
      >
        <Text>重新登录核验</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="手动触发核验"
        onPress={() => {
          void auth.restore();
        }}
      >
        <Text>手动触发核验</Text>
      </Pressable>
    </View>
  );
}

beforeEach(() => {
  mockKeySeq = 0;
  mockVersion = 0;
  mockRestore.mockReset().mockResolvedValue({ data: userA });
  mockLogout.mockReset().mockResolvedValue({ serverRevoked: true, localCleared: true });
  mockLogin.mockReset().mockImplementation(async () => {
    mockVersion++;
    mockInvalidation();
    mockVersion++;
    mockInvalidation();
  });
});

describe('B17 mobile 401 three-gate regressions (iOS & Android)', () => {
  it('Gate 1 & Gate 2: real 401 retains draft & idempotency key without auto-retry; same-account getMe restores for manual submit', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    client.setQueryData(['user', userA.id, 'ledgers'], [{ id: 'gushan', total: '30000' }]);

    const sendWrite = jest
      .fn<(key: string, draft: string) => Promise<{ saved: true }>>()
      .mockImplementationOnce(async () => {
        mockVersion++;
        mockInvalidation(new ApiError('UNAUTHENTICATED', '会话已失效', 401));
        throw new ApiError('UNAUTHENTICATED', '会话已失效', 401);
      })
      .mockResolvedValueOnce({ saved: true });

    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ProtectedWriteHarness sendWrite={sendWrite} />
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('authenticated:小安')).toBeOnTheScreen();

    // Gate 1: Write receives real 401 -> enters reauthentication gate, preserves draft & key, zero auto-retry.
    await userEvent.press(screen.getByRole('button', { name: '手动提交' }));
    expect(await screen.findByText('reauthentication:小安')).toBeOnTheScreen();
    expect(screen.getByTestId('draft-value')).toHaveTextContent('鼓山食堂 120 元');
    expect(client.getQueryData(['user', userA.id, 'ledgers'])).toEqual([
      { id: 'gushan', total: '30000' },
    ]);
    expect(sendWrite).toHaveBeenCalledTimes(1);

    // Gate 2: Same account re-authenticates and passes getMe -> returns to authenticated, still NO auto-submit.
    mockRestore.mockResolvedValueOnce({ data: userA });
    await userEvent.press(screen.getByRole('button', { name: '重新登录核验' }));
    expect(await screen.findByText('authenticated:小安')).toBeOnTheScreen();
    expect(screen.getByTestId('draft-value')).toHaveTextContent('鼓山食堂 120 元');
    expect(sendWrite).toHaveBeenCalledTimes(1);

    // User manually submits after recovery -> succeeds once reusing the exact same Idempotency-Key.
    await userEvent.press(screen.getByRole('button', { name: '手动提交' }));
    expect(await screen.findByTestId('saved-count')).toHaveTextContent('1');
    expect(sendWrite).toHaveBeenCalledTimes(2);
    expect(sendWrite.mock.calls[0]?.[0]).toBe('gate-401-key-1');
    expect(sendWrite.mock.calls[1]?.[0]).toBe('gate-401-key-1');
  });

  it('Gate 3: cross-account re-login clears prior query memory and late 200 during offline gate is discarded', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    client.setQueryData(['user', userA.id, 'ledgers'], [{ id: 'gushan', total: '30000' }]);

    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ProtectedWriteHarness
            sendWrite={jest.fn<() => Promise<{ saved: true }>>().mockResolvedValue({ saved: true })}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('authenticated:小安')).toBeOnTheScreen();

    // Enter reauthentication gate via 401, then switch to userB -> userA query memory must be wiped.
    await act(async () => {
      mockVersion++;
      mockInvalidation(new ApiError('UNAUTHENTICATED', 'revoked', 401));
    });
    expect(screen.getByText('reauthentication:小安')).toBeOnTheScreen();
    mockRestore.mockResolvedValueOnce({ data: userB });
    await userEvent.press(screen.getByRole('button', { name: '重新登录核验' }));
    expect(await screen.findByText('authenticated:小白')).toBeOnTheScreen();
    expect(client.getQueryData(['user', userA.id, 'ledgers'])).toBeUndefined();

    // Late 200 arriving after a network drop must be discarded and cannot unlock authenticated state.
    let resolveLateGetMe!: (value: { data: typeof userB }) => void;
    mockRestore.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLateGetMe = resolve;
      }),
    );
    await userEvent.press(screen.getByRole('button', { name: '手动触发核验' }));
    await act(async () => {
      mockNetwork({ isConnected: false });
    });
    expect(screen.getByText('restoring:小白')).toBeOnTheScreen();
    await act(async () => {
      resolveLateGetMe({ data: userB });
    });
    // Still blocked behind offline/error gate; late 200 did not unlock authenticated view.
    expect(screen.getByTestId('auth-state')).not.toHaveTextContent('authenticated:小白');
    expect(screen.getByTestId('auth-state')).toHaveTextContent('error:小白');
  });
});
