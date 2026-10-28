import type { TokenPair } from '@tongzhang/contracts';
import { ApiError } from './api-error';

interface SessionDependencies {
  read: () => Promise<string | null>;
  save: (token: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: (token: string) => Promise<TokenPair>;
  now?: () => number;
}
/** In-memory access token, serialized credential writes and one refresh per session generation. */
export function createAuthSession(deps: SessionDependencies) {
  let access: TokenPair | null = null;
  let blocked = false;
  let generation = 0;
  let clearedGeneration: number | null = null;
  let pending: { generation: number; promise: Promise<string> } | null = null;
  let storage = Promise.resolve();
  const listeners = new Set<(reason?: unknown) => void>();
  const now = deps.now ?? Date.now;
  const expired = () => new ApiError('UNAUTHENTICATED', '请先登录', 401);
  function store(work: () => Promise<void>) {
    const result = storage.then(work);
    storage = result.catch(() => undefined);
    return result;
  }
  function check(version: number) {
    if (version !== generation) throw expired();
  }
  async function clear(expected?: number, reason?: unknown) {
    if (expected !== undefined && expected !== generation) return generation;
    const version = ++generation;
    access = null;
    blocked = true;
    for (const listener of listeners) listener(reason);
    await store(deps.clear);
    clearedGeneration = version;
    return version;
  }
  return {
    clear,
    version: () => generation,
    credentialsCleared: () => clearedGeneration === generation,
    subscribe(listener: (reason?: unknown) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async save(pair: TokenPair, expected = generation) {
      check(expected);
      const version = ++generation;
      access = null;
      blocked = true;
      for (const listener of listeners) listener();
      try {
        await store(() => deps.save(pair.refreshToken));
        check(version);
        access = pair;
        blocked = false;
      } catch (error) {
        if (version === generation) await clear();
        throw error;
      }
    },
    read(): Promise<string> {
      if (blocked) return Promise.reject(expired());
      if (access && Date.parse(access.accessTokenExpiresAt) > now() + 30_000)
        return Promise.resolve(access.accessToken);
      if (pending?.generation === generation) return pending.promise;
      const version = generation;
      const promise = (async () => {
        await storage;
        const token = await deps.read();
        check(version);
        if (!token) throw expired();
        try {
          const pair = await deps.refresh(token);
          check(version);
          await store(() => deps.save(pair.refreshToken));
          check(version);
          access = pair;
          return pair.accessToken;
        } catch (error) {
          if (version !== generation) throw expired();
          // A preflight offline check or a definite 429 did not consume the token.
          if (
            error instanceof ApiError &&
            (error.code === 'NETWORK_UNAVAILABLE' || error.status === 429)
          )
            throw error;
          const reason =
            error instanceof ApiError && error.status === 401
              ? error
              : new ApiError('SESSION_REFRESH_UNCERTAIN', '登录续期结果未确认，请重新登录');
          await clear(undefined, reason);
          throw reason;
        }
      })();
      pending = { generation: version, promise };
      void promise
        .finally(() => {
          if (pending?.promise === promise) pending = null;
        })
        .catch(() => undefined);
      return promise;
    },
    async authorized<T>(request: (token: string) => Promise<T>): Promise<T> {
      const version = generation;
      const token = await this.read();
      check(version);
      try {
        const result = await request(token);
        check(version);
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && version === generation)
          await clear(undefined, error);
        throw error;
      }
    },
  };
}
