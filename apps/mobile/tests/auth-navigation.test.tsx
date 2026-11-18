import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Text as MockText, TextInput, Pressable } from 'react-native';
import { AuthNavigation } from '../app/_layout';
import { useIdempotentWrite } from '../src/lib/use-idempotent-write';
import { ApiError } from '../src/lib/api-error';

const mockUnmount = jest.fn();
const mockRestore = jest.fn<() => Promise<void>>();
const mockLogout = jest.fn<() => Promise<void>>();
const mockAuth: {
  status: string;
  user: { id: string } | null;
  operation: string | null;
  error: unknown;
  restore: typeof mockRestore;
  logout: typeof mockLogout;
} = {
  status: 'authenticated',
  user: { id: 'account-a' },
  operation: null,
  error: null,
  restore: mockRestore,
  logout: mockLogout,
};
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/providers/AppProviders', () => ({ AppProviders: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/lib/api', () => ({ createIdempotencyKey: () => 'retained-key' }));
jest.mock('../src/icons/FigmaAsset', () => ({ FigmaAsset: () => null, figmaAssets: {} }));
jest.mock('../src/features/auth/screens/AuthScreen', () => ({
  __esModule: true,
  default: () => <MockText>重新登录门禁</MockText>,
}));
function MockFormProbe() {
  const [value, setValue] = useState('');
  const [image] = useState('uploaded-reference');
  const write = useIdempotentWrite();
  useEffect(
    () => () => {
      mockUnmount();
    },
    [],
  );
  return (
    <>
      <TextInput accessibilityLabel="未保存消费" value={value} onChangeText={setValue} />
      <MockText>{image}</MockText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="保存"
        onPress={() => {
          void write.submit({ value, image }, send);
        }}
      >
        <MockText>保存</MockText>
      </Pressable>
    </>
  );
}
const send = jest.fn<(key: string) => Promise<void>>();
jest.mock('expo-router', () => {
  function Stack({ children }: PropsWithChildren) {
    return <>{children}</>;
  }
  Stack.Protected = ({ guard, children }: PropsWithChildren<{ guard: boolean }>) =>
    guard ? <>{children}</> : null;
  Stack.Screen = ({ name }: { name: string }) => (name === '(app)' ? <MockFormProbe /> : null);
  return { Stack, useIsFocused: () => true, router: {} };
});
beforeEach(() => {
  mockAuth.status = 'authenticated';
  mockAuth.user = { id: 'account-a' };
  mockAuth.operation = null;
  mockAuth.error = null;
  mockRestore.mockReset().mockResolvedValue();
  mockLogout.mockReset().mockResolvedValue();
});
function enclosingModal(text: string) {
  let node = screen.getByText(text);
  while (node.parent && node.props.transparent === undefined) node = node.parent;
  return node;
}
describe('background session admission preserves native media forms', () => {
  it('retains the same input, uploaded reference and unresolved write key across reauthentication, without sending automatically', async () => {
    mockAuth.status = 'authenticated';
    mockAuth.user = { id: 'account-a' };
    mockUnmount.mockClear();
    send
      .mockReset()
      .mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', 'unknown'))
      .mockResolvedValue();
    await render(<AuthNavigation />);
    await userEvent.type(screen.getByLabelText('未保存消费'), 'Receipt 120');
    await userEvent.press(screen.getByRole('button', { name: '保存' }));
    mockAuth.status = 'reauthentication';
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByText('重新登录门禁')).toBeOnTheScreen();
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(screen.queryByText('uploaded-reference')).toBeNull();
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    mockAuth.status = 'authenticated';
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByDisplayValue('Receipt 120')).toBeOnTheScreen();
    expect(screen.getByText('uploaded-reference')).toBeOnTheScreen();
    expect(send).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '保存' }));
    expect(send.mock.calls).toEqual([['retained-key'], ['retained-key']]);
    mockAuth.status = 'reauthentication';
    await screen.rerender(<AuthNavigation />);
    mockAuth.status = 'authenticated';
    mockAuth.user = { id: 'account-b' };
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByLabelText('未保存消费')).toHaveDisplayValue('');
    expect(mockUnmount).toHaveBeenCalledTimes(1);
  });
  it('keeps form memory while blocked, resumes after verification, and unmounts on revocation', async () => {
    mockAuth.status = 'authenticated';
    mockAuth.user = { id: 'account-a' };
    mockUnmount.mockClear();
    await render(<AuthNavigation />);
    await userEvent.type(screen.getByLabelText('未保存消费'), 'Receipt 120');
    // Returning from background dims the retained page with a compact card instead of an error screen.
    mockAuth.status = 'restoring';
    mockAuth.operation = 'restore';
    mockAuth.error = null;
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByText('正在核验登录状态')).toBeOnTheScreen();
    expect(screen.queryByText('暂时无法核验登录状态')).toBeNull();
    expect(screen.queryByRole('button', { name: '退出并返回登录' })).toBeNull();
    expect(enclosingModal('正在核验登录状态').props.transparent).toBe(true);
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(mockUnmount).not.toHaveBeenCalled();
    // A real failure switches from the compact overlay to the full recovery page with explicit retry.
    mockAuth.status = 'error';
    mockAuth.operation = null;
    mockAuth.error = new ApiError('NETWORK_UNAVAILABLE', '请检查网络后重试');
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByText('暂时无法核验登录状态')).toBeOnTheScreen();
    expect(enclosingModal('暂时无法核验登录状态').props.transparent).toBe(false);
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(mockUnmount).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '重新核验' }));
    expect(mockRestore).toHaveBeenCalledTimes(1);
    mockAuth.status = 'authenticated';
    mockAuth.error = null;
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByDisplayValue('Receipt 120')).toBeOnTheScreen();
    expect(screen.queryByText('正在核验登录状态')).toBeNull();
    expect(screen.queryByText('暂时无法核验登录状态')).toBeNull();
    mockAuth.status = 'anonymous';
    mockAuth.user = null;
    await screen.rerender(<AuthNavigation />);
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(mockUnmount).toHaveBeenCalledTimes(1);
  });
  it('exposes explicit retry when connectivity drops in foreground instead of sticking on a compact spinner', async () => {
    mockUnmount.mockClear();
    await render(<AuthNavigation />);
    await userEvent.type(screen.getByLabelText('未保存消费'), 'Draft 60');
    mockAuth.status = 'restoring';
    mockAuth.operation = null;
    mockAuth.error = new ApiError('NETWORK_UNAVAILABLE', '请联网后重新核验登录状态');
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByText('暂时无法核验登录状态')).toBeOnTheScreen();
    expect(screen.getByText('请联网后重新核验登录状态')).toBeOnTheScreen();
    expect(enclosingModal('暂时无法核验登录状态').props.transparent).toBe(false);
    expect(mockUnmount).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '重新核验' }));
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });
});
