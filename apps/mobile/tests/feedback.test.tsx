import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { InlineError, RequestState, EmptyState } from '../src/components/Feedback';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { ApiError } from '../src/lib/api-error';
jest.mock('../src/icons/FigmaAsset', () => ({ FigmaAsset: () => null, figmaAssets: {} }));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {},
}));
describe('shared in-page feedback and submission controls', () => {
  it('shows the pull spinner only for a refresh the user pulled for', async () => {
    const onRefresh = jest.fn();
    const page = (refreshing: boolean) => (
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        {null}
      </Screen>
    );
    const spinner = () => screen.getByTestId('screen-scroll').props.refreshControl.props.refreshing;
    await render(page(true));
    // A focus or tab refetch updates quietly.
    expect(spinner()).toBe(false);
    await screen.rerender(page(false));
    await act(async () =>
      screen.getByTestId('screen-scroll').props.refreshControl.props.onRefresh(),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await screen.rerender(page(true));
    expect(spinner()).toBe(true);
    await screen.rerender(page(false));
    await screen.rerender(page(true));
    expect(spinner()).toBe(false);
  });
  it('renders optional field errors as accessible alerts', async () => {
    await render(<InlineError />);
    expect(screen.queryByRole('alert')).toBeNull();
    await screen.rerender(<InlineError message="请检查邮箱" />);
    expect(screen.getByRole('alert')).toHaveTextContent('请检查邮箱');
  });
  it('keeps loading in the current container without starting a retry', async () => {
    const retry = jest.fn();
    await render(
      <RequestState
        loading
        title="请求失败"
        loadingTitle="正在核验"
        description="检查网络"
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('progressbar', { name: '正在核验' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(retry).not.toHaveBeenCalled();
  });
  it('shows a precise API error but hides private details from unknown exceptions', async () => {
    const props = { loading: false, title: '请求失败', description: '请手动重试' };
    await render(
      <RequestState {...props} error={new ApiError('NETWORK_UNAVAILABLE', '网络未连接')} />,
    );
    expect(screen.getByText('网络未连接')).toBeOnTheScreen();
    await screen.rerender(<RequestState {...props} error={new Error('private-password')} />);
    expect(screen.getByText('请手动重试')).toBeOnTheScreen();
    expect(screen.queryByText('private-password')).toBeNull();
  });
  it('requires explicit retry and suppresses another press while the parent request is pending', async () => {
    let finish!: () => void;
    const request = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    function Host() {
      const [loading, setLoading] = useState(false);
      return (
        <RequestState
          loading={loading}
          title="加载失败"
          description="检查网络"
          onRetry={() => {
            setLoading(true);
            void request().finally(() => setLoading(false));
          }}
        />
      );
    }
    await render(<Host />);
    expect(request).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '重试' }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    await act(async () => {
      finish();
    });
    expect(screen.getByRole('button', { name: '重试' })).toBeOnTheScreen();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('describes unavailable business content without manufacturing a balance', async () => {
    await render(<EmptyState title="共同账本" description="账本功能尚未接通" />);
    expect(screen.getByText('账本功能尚未接通')).toBeOnTheScreen();
    expect(screen.queryByText(/0[.．]00/)).toBeNull();
  });
  it('disables a pending submit action and exposes its busy state', async () => {
    const submit = jest.fn();
    await render(<Button title="提交" onPress={submit} loading />);
    const button = screen.getByRole('button', { name: '提交', busy: true });
    expect(button).toBeDisabled();
    await userEvent.press(button);
    expect(submit).not.toHaveBeenCalled();
  });
});
