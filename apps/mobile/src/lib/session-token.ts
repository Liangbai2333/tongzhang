import * as SecureStore from 'expo-secure-store';
import { endpoints } from '@tongzhang/contracts';
import { createAuthSession } from './auth-session';
import { requestJson } from './http';
const KEY = 'tongzhang.session.refresh-token';
export const sessionToken = createAuthSession({
  read: () => SecureStore.getItemAsync(KEY),
  save: (token) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
  refresh: async (refreshToken) =>
    (
      await requestJson(endpoints.refresh.path, endpoints.refresh.response, {
        method: 'POST',
        body: { refreshToken },
      })
    ).data,
});
