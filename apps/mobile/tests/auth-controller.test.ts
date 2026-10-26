import { describe, expect, it, vi } from 'vitest';
import { createAuthController } from '../src/features/auth/controller';
import { ApiError } from '../src/lib/api-error';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: '真实用户',
  email: 'real@example.test',
  notificationEnabled: false,
};
const input = {
  params: {},
  query: {},
  body: { account: 'real@example.test', password: 'correct-password' },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
function fixture() {
  let version = 0;
  const api = {
    login: vi.fn(async (): Promise<void> => undefined),
    register: vi.fn(async (): Promise<void> => undefined),
    getMe: vi.fn(async () => ({ data: user })),
    logout: vi.fn(async () => ({ serverRevoked: true, localCleared: true })),
    clearLocal: vi.fn(async (): Promise<void> => undefined),
    sessionVersion: () => version,
  };
  return { api, auth: createAuthController(api), changeSession: () => version++ };
}
describe('mobile authentication and route admission state', () => {
  it('denies protected content until an online getMe has succeeded', async () => {
    const { api, auth } = fixture();
    const request = deferred<{ data: typeof user }>();
    api.getMe.mockReturnValueOnce(request.promise);
    const pending = auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status: 'restoring', user: null });
    request.resolve({ data: user });
    await pending;
    expect(auth.getSnapshot()).toMatchObject({ status: 'authenticated', user });
  });
  it('merges concurrent restoration and rejects expired sessions', async () => {
    const { api, auth } = fixture();
    api.getMe.mockRejectedValueOnce(new ApiError('UNAUTHENTICATED', 'expired', 401));
    await Promise.all([auth.restore(), auth.restore()]);
    expect(api.getMe).toHaveBeenCalledTimes(1);
    expect(auth.getSnapshot().status).toBe('anonymous');
  });
  it('keeps offline startup locked and only retries after an explicit request', async () => {
    const { api, auth } = fixture();
    api.getMe.mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', 'offline'));
    await auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status: 'error', user: null });
    expect(api.getMe).toHaveBeenCalledTimes(1);
    await auth.restore();
    expect(auth.getSnapshot().status).toBe('authenticated');
  });
  it('requires user verification after login and prevents duplicate submissions', async () => {
    const { api, auth } = fixture();
    await auth.restore();
    auth.invalidate();
    const request = deferred<void>();
    api.login.mockReturnValueOnce(request.promise);
    const first = auth.login(input);
    await auth.login(input);
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(auth.getSnapshot().status).toBe('anonymous');
    request.resolve();
    await first;
    expect(auth.getSnapshot()).toMatchObject({ status: 'authenticated', operation: null });
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });
  it('does not claim login success if getMe fails after issuing credentials', async () => {
    const { api, auth } = fixture();
    auth.invalidate();
    api.getMe.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'connection failed'));
    await expect(auth.login(input)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(auth.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, operation: null });
  });
  it('rejects getMe results from an invalidated session', async () => {
    const { api, auth, changeSession } = fixture();
    const request = deferred<{ data: typeof user }>();
    api.getMe.mockReturnValueOnce(request.promise);
    const pending = auth.restore();
    changeSession();
    auth.invalidate(new ApiError('UNAUTHENTICATED', 'revoked', 401));
    request.resolve({ data: user });
    await pending;
    expect(auth.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
  });
  it.each([
    { serverRevoked: false, localCleared: true, notice: '已清除本机登录状态，服务端撤销未确认。' },
    { serverRevoked: true, localCleared: false, notice: '本机凭据未能完全清除，请重试退出。' },
    { serverRevoked: true, localCleared: true, notice: '已退出登录。' },
  ])('retains accurate logout feedback across route changes (%j)', async (result) => {
    const { api, auth } = fixture();
    await auth.restore();
    api.logout.mockResolvedValueOnce(result);
    await auth.logout();
    expect(auth.getSnapshot()).toMatchObject({
      status: 'anonymous',
      user: null,
      notice: result.notice,
    });
  });
  it('blocks a restore response that arrives after losing connectivity', async () => {
    const { api, auth } = fixture();
    const request = deferred<{ data: typeof user }>();
    api.getMe.mockReturnValueOnce(request.promise);
    const pending = auth.restore();
    auth.suspend();
    request.resolve({ data: user });
    await pending;
    expect(auth.getSnapshot()).toMatchObject({ status: 'error', user: null });
  });
  it('does not revive a suspended response when restoration is requested again', async () => {
    const { api, auth } = fixture();
    await auth.restore();
    const request = deferred<{ data: typeof user }>();
    api.getMe.mockReturnValueOnce(request.promise);
    const pending = auth.restore();
    auth.suspend();
    const concurrent = auth.restore();
    expect(concurrent).toBe(pending);
    request.resolve({ data: user });
    await concurrent;
    expect(auth.getSnapshot()).toMatchObject({ status: 'error', user: null });
    await auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    expect(api.getMe).toHaveBeenCalledTimes(3);
  });
  it('retries local credential cleanup without misrepresenting remote revocation', async () => {
    const { api, auth } = fixture();
    auth.invalidate();
    api.clearLocal.mockRejectedValueOnce(new Error('storage failed'));
    await auth.clearLocal();
    expect(auth.getSnapshot().notice).toContain('未能完全清除');
    await auth.clearLocal();
    expect(auth.getSnapshot().notice).toBe('本机登录凭据已清除。');
    expect(api.logout).not.toHaveBeenCalled();
  });
  it('retains a background screen only behind the online restoration gate', async () => {
    const { api, auth } = fixture();
    await auth.restore();
    auth.suspend({ preserveScreen: true });
    expect(auth.getSnapshot()).toMatchObject({ status: 'restoring', user, operation: null });
    const request = deferred<{ data: typeof user }>();
    api.getMe.mockReturnValueOnce(request.promise);
    const pending = auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status: 'restoring', user, operation: 'restore' });
    request.resolve({ data: user });
    await pending;
    expect(auth.getSnapshot()).toMatchObject({ status: 'authenticated', user, operation: null });
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });
  it.each([
    [new ApiError('UNAUTHENTICATED', 'revoked', 401), 'anonymous'],
    [new ApiError('NETWORK_UNAVAILABLE', 'offline'), 'error'],
  ])('discards a background screen if online verification fails (%s)', async (error, status) => {
    const { api, auth } = fixture();
    await auth.restore();
    auth.suspend({ preserveScreen: true });
    api.getMe.mockRejectedValueOnce(error);
    await auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status, user: null, operation: null });
  });
  it('drops retained identity on a real network loss before returning from the picker', async () => {
    const { auth } = fixture();
    await auth.restore();
    auth.suspend({ preserveScreen: true });
    auth.suspend();
    expect(auth.getSnapshot()).toMatchObject({ status: 'error', user: null });
  });
  it('unmounts protected data when suspended and re-verifies when requested', async () => {
    const { api, auth } = fixture();
    await auth.restore();
    auth.suspend();
    expect(auth.getSnapshot()).toMatchObject({ status: 'error', user: null });
    await auth.restore();
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });
});
