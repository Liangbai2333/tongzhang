import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, act } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { ApiError } from '../src/lib/api-error';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: '在线用户',
  email: 'online@example.test',
  notificationEnabled: false,
};
const mockRestore = jest.fn<() => Promise<{ data: typeof user }>>();
const mockLogout = jest.fn<() => Promise<{ serverRevoked: boolean; localCleared: boolean }>>();
let mockInvalidation: (reason?: unknown) => void;
let mockNetwork: (state: { isConnected: boolean }) => void;
let mockVersion = 0;
jest.mock('../src/features/auth/api', () => ({
  authApi: {
    restore: () => mockRestore(),
    login: jest.fn(),
    register: jest.fn(),
    logout: () => mockLogout(),
  },
}));
jest.mock('../src/lib/session-token', () => ({
  sessionToken: {
    version: () => mockVersion,
    clear: jest.fn(),
    subscribe: (callback: (reason?: unknown) => void) => {
      mockInvalidation = callback;
      return () => undefined;
    },
  },
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: (callback: (state: { isConnected: boolean }) => void) => {
    mockNetwork = callback;
    return { remove: jest.fn() };
  },
}));
function Probe() {
  const auth = useAuth();
  return (
    <>
      <Text>
        {auth.status}:{auth.user?.username ?? '无用户'}
      </Text>
      <Text>{auth.notice}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="核验"
        onPress={() => {
          void auth.restore();
        }}
      >
        <Text>核验</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="退出"
        onPress={() => {
          void auth.logout();
        }}
      >
        <Text>退出</Text>
      </Pressable>
    </>
  );
}
async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(['private-user-data'], { balance: '12300' });
  await render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  mockVersion = 0;
  mockRestore.mockReset().mockResolvedValue({ data: user });
  mockLogout.mockReset().mockResolvedValue({ serverRevoked: true, localCleared: true });
});
describe('AuthProvider lifecycle and memory isolation', () => {
  it('does not expose a user until online verification finishes', async () => {
    let finish!: (value: { data: typeof user }) => void;
    mockRestore.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    expect(screen.getByText('restoring:无用户')).toBeOnTheScreen();
    await act(async () => {
      finish({ data: user });
    });
    expect(await screen.findByText('authenticated:在线用户')).toBeOnTheScreen();
  });
  it('removes protected data and query memory when a session is revoked', async () => {
    const client = await mount();
    expect(await screen.findByText('authenticated:在线用户')).toBeOnTheScreen();
    await act(async () => {
      mockVersion++;
      mockInvalidation(new ApiError('UNAUTHENTICATED', 'revoked', 401));
    });
    expect(screen.getByText('anonymous:无用户')).toBeOnTheScreen();
    expect(client.getQueryData(['private-user-data'])).toBeUndefined();
  });
  it('hides protected content offline without retrying writes on reconnect', async () => {
    await mount();
    expect(await screen.findByText('authenticated:在线用户')).toBeOnTheScreen();
    await act(async () => {
      mockNetwork({ isConnected: false });
    });
    expect(screen.getByText('error:无用户')).toBeOnTheScreen();
    await act(async () => {
      mockNetwork({ isConnected: true });
    });
    expect(mockRestore).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '核验' }));
    expect(await screen.findByText('authenticated:在线用户')).toBeOnTheScreen();
  });
  it('keeps remote-revocation failure visible after local sign out', async () => {
    await mount();
    expect(await screen.findByText('authenticated:在线用户')).toBeOnTheScreen();
    mockLogout.mockImplementationOnce(async () => {
      mockVersion++;
      mockInvalidation();
      return { serverRevoked: false, localCleared: true };
    });
    await userEvent.press(screen.getByRole('button', { name: '退出' }));
    expect(await screen.findByText('已清除本机登录状态，服务端撤销未确认。')).toBeOnTheScreen();
    expect(screen.getByText('anonymous:无用户')).toBeOnTheScreen();
  });
});
