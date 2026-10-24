import * as SecureStore from 'expo-secure-store';
import { endpoints } from '@tongzhang/contracts';
import { createAuthSession } from './auth-session';
import { requestJson } from './http';
const KEY = 'tongzhang.session.refresh-token';
const LEGACY_KEY = 'tongzhang.session.token';
export const sessionToken = createAuthSession({
  read: async () => {
    await SecureStore.deleteItemAsync(LEGACY_KEY);
    return SecureStore.getItemAsync(KEY);
  },
  save: (token) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: async () => {
    // Finish both deletions before releasing the serialized storage queue, even on failure.
    try {
      await SecureStore.deleteItemAsync(KEY);
    } finally {
      await SecureStore.deleteItemAsync(LEGACY_KEY);
    }
  },
  refresh: async (refreshToken) =>
    (
      await requestJson(endpoints.refresh.path, endpoints.refresh.response, {
        method: 'POST',
        body: { refreshToken },
      })
    ).data,
});
