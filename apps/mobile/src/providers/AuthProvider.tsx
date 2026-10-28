import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/features/auth/api';
import { createAuthController } from '@/features/auth/controller';
import { sessionToken } from '@/lib/session-token';
import { sessionAdmission } from '@/lib/session-admission';

type Controller = ReturnType<typeof createAuthController>;
type Value = ReturnType<Controller['getSnapshot']> &
  Pick<Controller, 'login' | 'register' | 'logout' | 'restore' | 'dismissNotice' | 'clearLocal'>;
const AuthContext = createContext<Value | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const [controller] = useState(() =>
    createAuthController({
      ...authApi,
      getMe: authApi.restore,
      sessionVersion: sessionToken.version,
      clearMemory: () => client.clear(),
      setAdmission: sessionAdmission.set,
      clearLocal: async () => {
        await sessionToken.clear();
      },
    }),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    const unsubscribe = sessionToken.subscribe((reason) => {
      controller.invalidate(reason);
      if (controller.getSnapshot().status !== 'reauthentication') client.clear();
    });
    void controller.restore();
    const focus = AppState.addEventListener('change', (next) => {
      if (
        next === 'active' &&
        ['authenticated', 'error', 'restoring'].includes(controller.getSnapshot().status)
      )
        void controller.restore();
      else if (next !== 'active') controller.suspend({ preserveScreen: true });
    });
    const network = Network.addNetworkStateListener((next) => {
      if (next.isConnected === false || next.isInternetReachable === false)
        controller.suspend({ preserveScreen: true });
      // Network recovery does not automatically retry a refresh or any write.
    });
    return () => {
      sessionAdmission.set(false);
      unsubscribe();
      focus.remove();
      network.remove();
    };
  }, [client, controller]);
  return (
    <AuthContext.Provider
      value={{
        ...state,
        login: controller.login,
        register: controller.register,
        logout: controller.logout,
        restore: controller.restore,
        dismissNotice: controller.dismissNotice,
        clearLocal: controller.clearLocal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
