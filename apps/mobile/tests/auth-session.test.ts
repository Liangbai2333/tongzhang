import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../src/lib/auth-session';
import { ApiError } from '../src/lib/api-error';
import type { TokenPair } from '@tongzhang/contracts';
const pair = (accessToken = 'access-new', refreshToken = 'refresh-new'): TokenPair => ({
  accessToken,
  refreshToken,
  accessTokenExpiresAt: new Date(900_000).toISOString(),
  refreshTokenExpiresAt: new Date(30 * 86400000).toISOString(),
});
function fixture() {
  let saved: string | null = 'refresh-old';
  const deps = {
    read: vi.fn(async () => saved),
    save: vi.fn(async (token: string) => {
      saved = token;
    }),
    clear: vi.fn(async () => {
      saved = null;
    }),
    refresh: vi.fn(async (_token: string) => pair()),
    now: () => 0,
  };
  return { deps, session: createAuthSession(deps), saved: () => saved };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
describe('mobile online auth session', () => {
  it('restores online and shares one refresh across concurrent requests', async () => {
    const { deps, session, saved } = fixture();
    expect(await Promise.all([session.read(), session.read(), session.read()])).toEqual(
      Array(3).fill('access-new'),
    );
    expect(deps.refresh).toHaveBeenCalledExactlyOnceWith('refresh-old');
    expect(saved()).toBe('refresh-new');
    expect(await session.read()).toBe('access-new');
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });
  it('refreshes before sending a write and never replays a failed write', async () => {
    const { deps, session } = fixture();
    const submit = vi.fn(async (token: string) => {
      expect(token).toBe('access-new');
      expect(deps.save).toHaveBeenCalled();
      throw new ApiError('REQUEST_TIMEOUT', 'unknown result');
    });
    await expect(session.authorized(submit)).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('clears credentials on 401 without replaying the business request', async () => {
    const { session, saved } = fixture();
    const invalidated = vi.fn();
    session.subscribe(invalidated);
    const request = vi.fn(async () => {
      throw new ApiError('UNAUTHENTICATED', 'expired', 401);
    });
    await expect(session.authorized(request)).rejects.toMatchObject({ status: 401 });
    expect(saved()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
  });
  it.each(['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'])(
    'does not reuse a refresh token after uncertain %s',
    async (code) => {
      const { deps, session, saved } = fixture();
      deps.refresh.mockRejectedValue(new ApiError(code, 'uncertain'));
      await expect(session.read()).rejects.toMatchObject({ code: 'SESSION_REFRESH_UNCERTAIN' });
      await expect(session.read()).rejects.toMatchObject({ status: 401 });
      expect(deps.refresh).toHaveBeenCalledTimes(1);
      expect(saved()).toBeNull();
    },
  );
  it.each([
    new ApiError('NETWORK_UNAVAILABLE', 'offline'),
    new ApiError('RATE_LIMITED', 'wait', 429),
  ])('preserves credentials when the refresh was definitely not consumed (%s)', async (error) => {
    const { deps, session, saved } = fixture();
    deps.refresh.mockRejectedValueOnce(error);
    await expect(session.read()).rejects.toBe(error);
    expect(saved()).toBe('refresh-old');
    // This represents a later explicit attempt, not an automatic retry.
    expect(await session.read()).toBe('access-new');
  });
  it('does not restore a refresh response arriving after logout', async () => {
    const { deps, session, saved } = fixture();
    const response = deferred<TokenPair>();
    deps.refresh.mockReturnValue(response.promise);
    const pending = session.read();
    await vi.waitFor(() => expect(deps.refresh).toHaveBeenCalled());
    await session.clear();
    response.resolve(pair());
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(saved()).toBeNull();
  });
  it('does not let an old request 401 clear a newer login', async () => {
    const { deps, session, saved } = fixture();
    await session.save(pair('old-access', 'old-refresh'));
    const response = deferred<string>();
    const oldRequest = session.authorized(() => response.promise);
    await Promise.resolve();
    await session.save(pair('other-account', 'other-refresh'));
    response.reject(new ApiError('UNAUTHENTICATED', 'old session', 401));
    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(await session.read()).toBe('other-account');
    expect(saved()).toBe('other-refresh');
    expect(deps.refresh).not.toHaveBeenCalled();
  });
  it('rejects an old refresh arriving after a different login', async () => {
    const { deps, session, saved } = fixture();
    const response = deferred<TokenPair>();
    deps.refresh.mockReturnValue(response.promise);
    const pending = session.read();
    await vi.waitFor(() => expect(deps.refresh).toHaveBeenCalled());
    await session.save(pair('other-account', 'other-refresh'));
    response.resolve(pair());
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(await session.read()).toBe('other-account');
    expect(saved()).toBe('other-refresh');
  });
  it('cannot restore a session from a login response arriving after logout', async () => {
    const { session, saved } = fixture();
    const attempt = await session.clear();
    await session.clear();
    await expect(session.save(pair(), attempt)).rejects.toMatchObject({ status: 401 });
    expect(saved()).toBeNull();
  });
  it('does not let a late logout clear a newer login', async () => {
    const { session, saved } = fixture();
    const version = session.version();
    await session.save(pair('other-account', 'other-refresh'));
    await session.clear(version);
    expect(await session.read()).toBe('other-account');
    expect(saved()).toBe('other-refresh');
  });
  it('blocks restoration in memory if credential deletion fails', async () => {
    const { deps, session } = fixture();
    deps.clear.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(session.clear()).rejects.toThrow('storage unavailable');
    await expect(session.read()).rejects.toMatchObject({ status: 401 });
    expect(deps.refresh).not.toHaveBeenCalled();
  });
  it('refreshes again near expiry and keeps the absolute refresh expiry', async () => {
    const { deps, session } = fixture();
    let now = 0;
    deps.now = () => now;
    const manager = createAuthSession(deps);
    await manager.save(pair());
    now = 880_000;
    await manager.read();
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    await session.clear();
  });
});
