import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Text as MockText, TextInput, Pressable } from 'react-native';
import { AuthNavigation } from '../app/_layout';
import { useIdempotentWrite } from '../src/lib/use-idempotent-write';
import { ApiError } from '../src/lib/api-error';

const mockUnmount = jest.fn();
const mockAuth: { status: string; user: { id: string } | null } = {
  status: 'authenticated',
  user: { id: 'account-a' },
};
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/providers/AppProviders', () => ({ AppProviders: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/lib/api', () => ({ createIdempotencyKey: () => 'retained-key' }));
jest.mock('../src/features/auth/screens/AuthScreen', () => ({
  __esModule: true,
  default: () => <MockText>重新登录门禁</MockText>,
}));
jest.mock('../src/features/auth/screens/SessionRecovery', () => {
  return { __esModule: true, default: () => <MockText>在线核验门禁</MockText> };
});
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
  return { Stack };
});
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
    mockAuth.status = 'restoring';
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByText('在线核验门禁')).toBeOnTheScreen();
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(mockUnmount).not.toHaveBeenCalled();
    mockAuth.status = 'error';
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByText('在线核验门禁')).toBeOnTheScreen();
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(mockUnmount).not.toHaveBeenCalled();
    mockAuth.status = 'authenticated';
    await screen.rerender(<AuthNavigation />);
    expect(screen.getByDisplayValue('Receipt 120')).toBeOnTheScreen();
    expect(screen.queryByText('在线核验门禁')).toBeNull();
    mockAuth.status = 'anonymous';
    mockAuth.user = null;
    await screen.rerender(<AuthNavigation />);
    expect(screen.queryByLabelText('未保存消费')).toBeNull();
    expect(mockUnmount).toHaveBeenCalledTimes(1);
  });
});
