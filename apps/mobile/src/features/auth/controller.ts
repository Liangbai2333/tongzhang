import type { EndpointInput, UserSelf } from '@tongzhang/contracts';
import { ApiError } from '../../lib/api-error';
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous' | 'error' | 'reauthentication';
export interface LogoutResult {
  serverRevoked: boolean;
  localCleared: boolean;
}
export interface AuthState {
  user: UserSelf | null;
  status: AuthStatus;
  operation: 'login' | 'register' | 'restore' | 'logout' | null;
  error: unknown;
  notice: string | null;
}
interface Dependencies {
  login: (input: EndpointInput<'login'>) => Promise<unknown>;
  register: (input: EndpointInput<'register'>) => Promise<unknown>;
  getMe: () => Promise<{ data: UserSelf }>;
  logout: () => Promise<LogoutResult>;
  sessionVersion: () => number;
  clearLocal: () => Promise<void>;
  clearMemory: () => void;
  setAdmission: (admitted: boolean) => void;
}
export function createAuthController(api: Dependencies) {
  let state: AuthState = {
    user: null,
    status: 'restoring',
    operation: null,
    error: null,
    notice: null,
  };
  let intent = 0;
  let suspended = false;
  let restorePending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  function update(patch: Partial<AuthState>) {
    state = { ...state, ...patch };
    api.setAdmission(state.status === 'authenticated');
    for (const listener of listeners) listener();
  }
  async function verify(id: number) {
    const version = api.sessionVersion();
    const result = await api.getMe();
    if (suspended) throw new ApiError('NETWORK_UNAVAILABLE', '请重新在线核验登录状态');
    if (id !== intent || version !== api.sessionVersion())
      throw new ApiError('UNAUTHENTICATED', '登录状态已改变，请重新登录', 401);
    if (state.user && state.user.id !== result.data.id) api.clearMemory();
    update({ user: result.data, status: 'authenticated', error: null, notice: null });
  }
  async function signIn<K extends 'login' | 'register'>(operation: K, input: EndpointInput<K>) {
    if (state.operation) return;
    const id = ++intent;
    const retained = state.status === 'reauthentication' ? state.user : null;
    suspended = false;
    update({
      operation,
      status: retained ? 'reauthentication' : 'anonymous',
      user: retained,
      error: null,
      notice: null,
    });
    try {
      if (operation === 'login') await api.login(input as EndpointInput<'login'>);
      else await api.register(input as EndpointInput<'register'>);
      if (id !== intent) return;
      await verify(id);
    } catch (error) {
      if (id === intent)
        update({ status: retained ? 'reauthentication' : 'anonymous', user: retained, error });
      throw error;
    } finally {
      if (id === intent) update({ operation: null });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate(reason?: unknown) {
      // The identity here only owns hidden, process-local form memory. Credentials
      // have already been revoked; only a new login plus getMe can reopen it.
      const retain =
        state.user &&
        !['logout', 'register'].includes(state.operation ?? '') &&
        (state.status === 'reauthentication' ||
          (reason instanceof ApiError &&
            (reason.status === 401 || reason.code === 'SESSION_REFRESH_UNCERTAIN')));
      update({
        user: retain ? state.user : null,
        status: retain
          ? 'reauthentication'
          : reason &&
              !(reason instanceof ApiError && reason.status === 401) &&
              !['login', 'register'].includes(state.operation ?? '')
            ? 'error'
            : 'anonymous',
        error: reason ?? null,
        notice:
          reason instanceof ApiError && reason.status === 401
            ? '登录已失效，请重新登录。'
            : state.notice,
      });
    },
    dismissNotice() {
      update({ notice: null });
    },
    login: (input: EndpointInput<'login'>) => signIn('login', input),
    register: (input: EndpointInput<'register'>) => signIn('register', input),
    restore(): Promise<void> {
      if (state.status === 'reauthentication') return Promise.resolve();
      if (restorePending) return restorePending;
      if (state.operation) return Promise.resolve();
      const id = ++intent;
      suspended = false;
      update({ status: 'restoring', operation: 'restore', error: null });
      restorePending = (async () => {
        try {
          await verify(id);
        } catch (error) {
          if (id === intent)
            update({
              user: state.user,
              error,
              status:
                state.status === 'reauthentication' ||
                (state.user && error instanceof ApiError && error.status === 401)
                  ? 'reauthentication'
                  : error instanceof ApiError && error.status === 401
                    ? 'anonymous'
                    : 'error',
            });
        } finally {
          if (id === intent) update({ operation: null });
          restorePending = null;
        }
      })();
      return restorePending;
    },
    async logout() {
      if (
        state.operation === 'logout' ||
        state.operation === 'login' ||
        state.operation === 'register'
      )
        return;
      const id = ++intent;
      update({ operation: 'logout', error: null });
      try {
        const result = await api.logout();
        if (id !== intent) return;
        const notice = !result.localCleared
          ? '本机凭据未能完全清除，请重试退出。'
          : !result.serverRevoked
            ? '已清除本机登录状态，服务端撤销未确认。'
            : '已退出登录。';
        update({ user: null, status: 'anonymous', notice });
      } finally {
        if (id === intent) update({ operation: null });
      }
    },
    async clearLocal() {
      if (state.operation) return;
      const id = ++intent;
      update({ operation: 'logout' });
      try {
        await api.clearLocal();
        if (id === intent)
          update({ status: 'anonymous', user: null, notice: '本机登录凭据已清除。' });
      } catch {
        if (id === intent) update({ notice: '本机凭据未能完全清除，请重试退出。' });
      } finally {
        if (id === intent) update({ operation: null });
      }
    },
    suspend({ preserveScreen = false }: { preserveScreen?: boolean } = {}) {
      suspended = true;
      if (state.status === 'reauthentication') return;
      if (state.operation) {
        if (!preserveScreen) update({ user: null });
        return;
      }
      intent++;
      if (state.user)
        update({
          // A picker or network interruption must not discard the in-memory form.
          // Navigation blocks the retained screen until online verification succeeds.
          user: preserveScreen ? state.user : null,
          status: preserveScreen ? 'restoring' : 'error',
          error: preserveScreen
            ? null
            : new ApiError('NETWORK_UNAVAILABLE', '请联网后重新核验登录状态'),
        });
    },
  };
}
