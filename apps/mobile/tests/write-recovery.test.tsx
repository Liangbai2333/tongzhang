import { describe, expect, it, jest } from '@jest/globals';
import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import { useIdempotentWrite } from '../src/lib/use-idempotent-write';
import { OnlineWriteSheet } from '../src/components/OnlineWriteSheet';
import { ApiError } from '../src/lib/api-error';

jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
}));
jest.mock('../src/lib/api', () => ({ createIdempotencyKey: () => 'recovery-key' }));
jest.mock('../src/icons/FigmaAsset', () => ({
  FigmaAsset: () => null,
  figmaAssets: new Proxy(
    {},
    { get: () => new Proxy({}, { get: () => ({ source: 1, width: 20, height: 20 }) }) },
  ),
}));
describe('uncertain writes remain unresolved until a confirmed result', () => {
  it.each(['NETWORK_UNAVAILABLE', 'FORBIDDEN', 'UNAUTHENTICATED'])(
    'keeps the original payload/key locked after a retry returns %s',
    async (code) => {
      const send = jest
        .fn<(key: string) => Promise<{ saved: boolean }>>()
        .mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', '结果未知'))
        .mockRejectedValueOnce(new ApiError(code, '重试失败'))
        .mockResolvedValue({ saved: true });
      const hook = await renderHook(() => useIdempotentWrite());
      await act(async () => {
        await hook.result.current.submit({ note: 'original' }, send);
      });
      expect(hook.result.current.uncertain).toBe(true);
      await act(async () => {
        await hook.result.current.submit({ note: 'original' }, send);
      });
      expect(hook.result.current.uncertain).toBe(true);
      await act(async () => {
        await hook.result.current.submit({ note: 'changed' }, send);
      });
      expect(send).toHaveBeenCalledTimes(2);
      await act(async () => {
        await hook.result.current.submit({ note: 'original' }, send);
      });
      expect(hook.result.current.uncertain).toBe(false);
      expect(send.mock.calls).toEqual([['recovery-key'], ['recovery-key'], ['recovery-key']]);
    },
  );
  it('ignores an online verification that resolves after its sheet was unmounted', async () => {
    let resolve!: (value: boolean) => void;
    const check = jest.fn<() => Promise<boolean>>(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onDone = jest.fn();
    const view = await render(
      <OnlineWriteSheet
        title="核对"
        confirmTitle="提交"
        payload={{}}
        send={async () => {
          throw new ApiError('REQUEST_TIMEOUT', '结果未知');
        }}
        check={check}
        onDone={onDone}
        onCancel={() => {}}
      >
        {() => null}
      </OnlineWriteSheet>,
    );
    await userEvent.press(screen.getByRole('button', { name: '提交' }));
    await screen.findByText('结果未知');
    await userEvent.press(screen.getByRole('button', { name: '查询结果' }));
    await view.unmount();
    await act(async () => {
      resolve(true);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});

it('lets a definite preflight failure be edited when no earlier request is unresolved', async () => {
  const send = jest
    .fn<() => Promise<{ saved: boolean }>>()
    .mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', '未发送'))
    .mockResolvedValue({ saved: true });
  const hook = await renderHook(() => useIdempotentWrite());
  await act(async () => {
    await hook.result.current.submit({ note: 'first' }, send);
  });
  expect(hook.result.current.uncertain).toBe(false);
  await act(async () => {
    await hook.result.current.submit({ note: 'changed' }, send);
  });
  expect(send).toHaveBeenCalledTimes(2);
});
