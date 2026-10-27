import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Text as MockText, TextInput } from 'react-native';
import { AuthNavigation } from '../app/_layout';

const mockUnmount = jest.fn();
const mockAuth: { status: string; user: { id: string } | null } = {
  status: 'authenticated',
  user: { id: 'account-a' },
};
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/providers/AppProviders', () => ({ AppProviders: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/features/auth/screens/SessionRecovery', () => {
  return { __esModule: true, default: () => <MockText>在线核验门禁</MockText> };
});
function MockFormProbe() {
  const [value, setValue] = useState('');
  useEffect(
    () => () => {
      mockUnmount();
    },
    [],
  );
  return <TextInput accessibilityLabel="未保存消费" value={value} onChangeText={setValue} />;
}
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
