import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, userEvent, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import AuthScreen from '../src/features/auth/screens/AuthScreen';
import AccountScreen from '../src/features/profile/screens/AccountScreen';
import { ApiError } from '../src/lib/api-error';
import { createQueryClient } from '../src/lib/query-client';
import { ledgersApi } from '../src/features/ledgers/api';

const mockLogin = jest.fn<() => Promise<void>>();
const mockRegister = jest.fn<() => Promise<void>>();
const mockLogout = jest.fn<() => Promise<void>>();
const mockAuth = {
  login: mockLogin,
  register: mockRegister,
  logout: mockLogout,
  clearLocal: jest.fn<() => Promise<void>>(),
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
jest.mock('../src/features/ledgers/api', () => ({ ledgersApi: { listLedgers: jest.fn() } }));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { canGoBack: () => false, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
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
  // A full first page plus a cursor means "more than 50"; counts are never extrapolated.
  jest.mocked(ledgersApi.listLedgers).mockImplementation(async ({ query }) => {
    const archived = query.archived === 'true';
    return {
      data: new Array(archived ? 2 : 50).fill(null) as never,
      page: { nextCursor: archived ? null : 'next-page' },
    };
  });
});
const renderAccount = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AccountScreen />
    </QueryClientProvider>,
  );
describe('real auth page interactions with isolated API callbacks', () => {
  it('offers explicit reauthentication and abandonment without navigating away from the retained form', async () => {
    await render(<AuthScreen recovery />);
    expect(screen.getByLabelText('账号')).toHaveDisplayValue('test@example.test');
    expect(screen.queryByLabelText('返回')).toBeNull();
    expect(screen.queryByText('注册同账 →')).toBeNull();
    expect(screen.getByText(/登录其他账号会丢弃原表单/)).toBeOnTheScreen();
    await userEvent.type(screen.getByLabelText('密码'), 'correct-password');
    await userEvent.press(screen.getByRole('button', { name: '登录并继续' }));
    expect(mockLogin).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '放弃表单并返回登录' }));
    expect(mockAuth.clearLocal).toHaveBeenCalledTimes(1);
  });
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
  it('preserves credentials after an offline failure and only retries on another explicit submit', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError('NETWORK_UNAVAILABLE', '网络未连接，请联网后重试'),
    );
    await render(<AuthScreen />);
    await fireEvent.changeText(screen.getByLabelText('账号'), 'offline@example.test');
    await fireEvent.changeText(screen.getByLabelText('密码'), 'correct-password');
    await userEvent.press(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('网络未连接，请联网后重试')).toBeOnTheScreen();
    expect(screen.getByLabelText('账号')).toHaveDisplayValue('offline@example.test');
    expect(screen.getByLabelText('密码')).toHaveDisplayValue('correct-password');
    expect(mockLogin).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: '登录' }));
    expect(mockLogin).toHaveBeenCalledTimes(2);
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
  it.each([false, true])(
    'reads both documents and preserves auth state (register=%s)',
    async (register) => {
      await render(<AuthScreen register={register} />);
      await fireEvent.changeText(screen.getByLabelText(register ? '用户名' : '账号'), '保留输入');
      await fireEvent.changeText(screen.getByLabelText('密码'), 'correct-password');
      await userEvent.press(screen.getAllByRole('button', { name: '显示密码' })[0]!);
      if (register) {
        await fireEvent.changeText(screen.getByLabelText('邮箱'), 'reader@example.test');
        await fireEvent.changeText(screen.getByLabelText('确认密码'), 'mismatch');
        await userEvent.press(screen.getByRole('checkbox'));
      } else {
        mockLogin.mockRejectedValueOnce(new ApiError('INVALID_CREDENTIALS', '账号或密码错误', 401));
      }
      await userEvent.press(screen.getByRole('button', { name: register ? '注册并开始' : '登录' }));
      const error = register ? '两次输入的密码不一致' : '账号或密码错误';
      expect(await screen.findByText(error)).toBeOnTheScreen();
      const calls = mockLogin.mock.calls.length;
      for (const [title, firstSection] of [
        ['用户协议', '一、服务范围'],
        ['隐私说明', '一、账号信息与登录凭据'],
      ]) {
        await userEvent.press(screen.getByRole('button', { name: title }));
        expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
        expect(screen.getByRole('header', { name: firstSection })).toBeOnTheScreen();
        await userEvent.press(screen.getByRole('button', { name: '关闭' }));
        await waitFor(() => expect(screen.queryByRole('header', { name: title })).toBeNull());
        expect(screen.getByLabelText(register ? '用户名' : '账号')).toHaveDisplayValue('保留输入');
        expect(screen.getByLabelText('密码')).toHaveDisplayValue('correct-password');
        expect(screen.getByLabelText('密码')).toHaveProp('secureTextEntry', false);
        expect(screen.getByText(error)).toBeOnTheScreen();
        if (register) {
          expect(screen.getByLabelText('邮箱')).toHaveDisplayValue('reader@example.test');
          expect(screen.getByLabelText('确认密码')).toHaveDisplayValue('mismatch');
          expect(screen.getByRole('checkbox')).toBeChecked();
        }
      }
      expect(mockLogin).toHaveBeenCalledTimes(calls);
      expect(mockRegister).not.toHaveBeenCalled();
    },
  );
  it.each(['关闭面板', '关闭面板遮罩', 'system'])(
    'dismisses reading via %s without consenting',
    async (method) => {
      await render(<AuthScreen register />);
      await fireEvent.changeText(screen.getByLabelText('用户名'), '未勾选');
      await userEvent.press(screen.getByRole('button', { name: '用户协议' }));
      if (method === 'system') {
        let modal = screen.getByRole('button', { name: '关闭面板' });
        while (modal.parent && !modal.props.onRequestClose) modal = modal.parent;
        await fireEvent(modal, 'requestClose');
      } else
        await userEvent.press(
          screen.getByRole('button', { name: method, includeHiddenElements: true }),
        );
      await waitFor(() => expect(screen.queryByRole('header', { name: '用户协议' })).toBeNull());
      expect(screen.getByLabelText('用户名')).toHaveDisplayValue('未勾选');
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockLogin).not.toHaveBeenCalled();
    },
  );
  it('opens all profile documents and returns to the same verified account', async () => {
    await renderAccount();
    for (const [title, section, via] of [
      ['关于同账', '共同记录，清楚分摊'],
      ['用户协议', '一、服务范围', '设置'],
      ['隐私说明', '一、账号信息与登录凭据', '设置'],
    ]) {
      if (via) await userEvent.press(screen.getByRole('button', { name: via }));
      await userEvent.press(screen.getByRole('button', { name: title }));
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: section })).toBeOnTheScreen();
      expect(screen.getByText('修订日期：2026-10-24')).toBeOnTheScreen();
      await userEvent.press(screen.getByRole('button', { name: '关闭面板' }));
      await waitFor(() => expect(screen.queryByRole('header', { name: title })).toBeNull());
      expect(screen.getByText('test@example.test')).toBeOnTheScreen();
    }
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockAuth.restore).not.toHaveBeenCalled();
  });
  it('toggles password visibility', async () => {
    await render(<AuthScreen />);
    expect(screen.getByLabelText('密码')).toHaveProp('secureTextEntry', true);
    await userEvent.press(screen.getByRole('button', { name: '显示密码' }));
    expect(screen.getByLabelText('密码')).toHaveProp('secureTextEntry', false);
  });
  it('reads ledger counts online without guessing beyond the first page', async () => {
    await renderAccount();
    expect(await screen.findByText('50+')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '历史账本 2' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '历史账本 2' }));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: '/ledgers',
      params: { view: 'archived' },
    });
    await userEvent.press(screen.getByRole('button', { name: '我参与的账本 50+' }));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: '/ledgers',
      params: { view: 'current' },
    });
    for (const archived of ['false', 'true'])
      expect(ledgersApi.listLedgers).toHaveBeenCalledWith(
        expect.objectContaining({ query: { archived, limit: 50 } }),
      );
  });
  it('shows account details read-only and keeps explicit reverification', async () => {
    await renderAccount();
    await userEvent.press(screen.getByRole('button', { name: '账户信息' }));
    expect(screen.getByText('资料修改暂未开放。')).toBeOnTheScreen();
    expect(screen.getAllByText('测试用户').length).toBeGreaterThan(1);
    await userEvent.press(screen.getByRole('button', { name: '重新核验登录状态' }));
    expect(mockAuth.restore).toHaveBeenCalledTimes(1);
  });
  it('shows the verified user and requires logout confirmation', async () => {
    await renderAccount();
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
