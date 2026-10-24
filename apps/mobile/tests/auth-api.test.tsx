import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authApi } from '../src/features/auth/api';
import { createAuthSession } from '../src/lib/auth-session';
import { ApiError } from '../src/lib/api-error';
import type { TokenPair } from '@tongzhang/contracts';

let mockSession: ReturnType<typeof createAuthSession>;
const mockRequest = jest.fn<() => Promise<{ data: { revoked: boolean } }>>();
jest.mock('../src/lib/api', () => ({ callOperation: jest.fn() }));
jest.mock('../src/lib/http', () => ({ requestJson: () => mockRequest() }));
jest.mock('../src/lib/session-token', () => ({
  sessionToken: {
    version: () => mockSession.version(),
    read: () => mockSession.read(),
    clear: (version?: number) => mockSession.clear(version),
    credentialsCleared: () => mockSession.credentialsCleared(),
  },
}));
const pair: TokenPair = {
  accessToken: 'access',
  refreshToken: 'refresh',
  accessTokenExpiresAt: new Date(900_000).toISOString(),
  refreshTokenExpiresAt: new Date(30 * 86400000).toISOString(),
};
function fixture() {
  let saved: string | null = 'refresh-old';
  const deps = {
    read: jest.fn(async () => saved),
    save: jest.fn(async (token: string) => {
      saved = token;
    }),
    clear: jest.fn(async () => {
      saved = null;
    }),
    refresh: jest.fn(async () => pair),
    now: () => 0,
  };
  mockSession = createAuthSession(deps);
  return { deps, saved: () => saved };
}
beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ data: { revoked: true } });
});
describe('logout with the real session manager', () => {
  it('reports confirmed server revocation and local deletion independently', async () => {
    const { saved } = fixture();
    await expect(authApi.logout()).resolves.toEqual({ serverRevoked: true, localCleared: true });
    expect(saved()).toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
  it('does not report local success if refresh invalidation failed to delete credentials', async () => {
    const { deps, saved } = fixture();
    deps.refresh.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', 'uncertain'));
    deps.clear.mockRejectedValueOnce(new Error('secure storage unavailable'));
    await expect(authApi.logout()).resolves.toEqual({ serverRevoked: false, localCleared: false });
    expect(saved()).toBe('refresh-old');
    expect(mockRequest).not.toHaveBeenCalled();
    await expect(mockSession.read()).rejects.toMatchObject({ status: 401 });
  });
  it('recognizes successful local deletion during a failed refresh', async () => {
    const { deps, saved } = fixture();
    deps.refresh.mockRejectedValueOnce(new ApiError('REQUEST_TIMEOUT', 'uncertain'));
    await expect(authApi.logout()).resolves.toEqual({ serverRevoked: false, localCleared: true });
    expect(saved()).toBeNull();
  });
  it('does not clear a newer login when an old logout response arrives', async () => {
    const { saved } = fixture();
    await mockSession.save(pair);
    mockRequest.mockImplementationOnce(async () => {
      await mockSession.save({ ...pair, refreshToken: 'other-refresh' });
      return { data: { revoked: true } };
    });
    await expect(authApi.logout()).resolves.toEqual({ serverRevoked: true, localCleared: false });
    expect(saved()).toBe('other-refresh');
  });
});
