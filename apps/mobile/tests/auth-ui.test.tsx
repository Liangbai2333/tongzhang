import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, userEvent, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../src/features/auth/screens/AuthScreen';
import AccountScreen from '../src/features/profile/screens/AccountScreen';
import { ApiError } from '../src/lib/api-error';

const mockLogin = jest.fn<() => Promise<void>>();
const mockRegister = jest.fn<() => Promise<void>>();
const mockLogout = jest.fn<() => Promise<void>>();
const mockAuth = {
  login: mockLogin,
  register: mockRegister,
  logout: mockLogout,
  restore: jest.fn(),
  operation: null,
  notice: null,
  dismissNotice: jest.fn(),
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    username: '测试用户',
    email: 'test@example.test',
    notificationEnabled: false,
  },
};
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => false, replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/icons/FigmaAsset', () => {
  const asset = { source: 1, width: 20, height: 20 };
  const group = new Proxy({}, { get: () => asset });
  return { FigmaAsset: () => null, figmaAssets: new Proxy({}, { get: () => group }) };
});
beforeEach(() => {
  jest.clearAllMocks();
  mockLogin.mockResolvedValue();
  mockRegister.mockResolvedValue();
  mockLogout.mockResolvedValue();
});
describe('real auth page interactions with isolated API callbacks', () => {
  it('validates empty credentials without sending a request', async () => {
    await render(<AuthScreen />);
    await userEvent.press(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('请输入邮箱或用户名（最多 254 个字符）')).toBeOnTheScreen();
    expect(mockLogin).not.toHaveBeenCalled();
  });
  it('submits credentials and preserves inputs after a server rejection', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError('INVALID_CREDENTIALS', '账号或密码错误', 401));
    await render(<AuthScreen />);
    await userEvent.type(screen.getByLabelText('账号'), 'tester@example.test');
    await userEvent.type(screen.getByLabelText('密码'), 'wrong-password');
    await userEvent.press(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('账号或密码错误')).toBeOnTheScreen();
    expect(screen.getByLabelText('账号')).toHaveDisplayValue('tester@example.test');
    expect(screen.getByLabelText('密码')).toHaveDisplayValue('wrong-password');
    expect(mockLogin).toHaveBeenCalledWith({
      params: {},
      query: {},
      body: { account: 'tester@example.test', password: 'wrong-password' },
    });
  });
  it('prevents duplicate submissions while a request is pending', async () => {
    let finish!: () => void;
    mockLogin.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await render(<AuthScreen />);
    await fireEvent.changeText(screen.getByLabelText('账号'), 'tester');
    await fireEvent.changeText(screen.getByLabelText('密码'), 'password');
    const button = screen.getByRole('button', { name: '登录' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('账号')).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByLabelText('账号')).toBeEnabled());
  });
  it('requires consent and matching passwords, then registers with the real contract fields', async () => {
    await render(<AuthScreen register />);
    await fireEvent.changeText(screen.getByLabelText('用户名'), '新用户');
    await fireEvent.changeText(screen.getByLabelText('邮箱'), 'new@example.test');
    await fireEvent.changeText(screen.getByLabelText('密码'), 'correct-password');
    await fireEvent.changeText(screen.getByLabelText('确认密码'), 'mismatch');
    await userEvent.press(screen.getByRole('button', { name: '注册并开始' }));
    expect(await screen.findByText('两次输入的密码不一致')).toBeOnTheScreen();
    expect(mockRegister).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('确认密码'), 'correct-password');
    await userEvent.press(screen.getByRole('checkbox'));
    await userEvent.press(screen.getByRole('button', { name: '注册并开始' }));
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith({
        params: {},
        query: {},
        body: {
          username: '新用户',
          email: 'new@example.test',
          password: 'correct-password',
          acceptTerms: true,
        },
      }),
    );
  });
  it('opens and closes the legal sheet without losing form input', async () => {
    await render(<AuthScreen register />);
    await fireEvent.changeText(screen.getByLabelText('用户名'), '保留输入');
    await userEvent.press(screen.getByRole('button', { name: '隐私说明' }));
    expect(await screen.findByText('隐私说明 · 课程联调版')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '返回表单' }));
    expect(screen.getByLabelText('用户名')).toHaveDisplayValue('保留输入');
  });
  it('toggles password visibility', async () => {
    await render(<AuthScreen />);
    expect(screen.getByLabelText('密码')).toHaveProp('secureTextEntry', true);
    await userEvent.press(screen.getByRole('button', { name: '显示密码' }));
    expect(screen.getByLabelText('密码')).toHaveProp('secureTextEntry', false);
  });
  it('shows the verified user and requires logout confirmation', async () => {
    await render(<AccountScreen />);
    expect(screen.getByText('test@example.test')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '退出登录' }));
    expect(mockLogout).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '取消' }));
    expect(mockLogout).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '退出登录' }));
    await userEvent.press(screen.getByRole('button', { name: '确认退出' }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
