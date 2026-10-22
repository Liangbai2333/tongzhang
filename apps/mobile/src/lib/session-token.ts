import * as SecureStore from 'expo-secure-store';
const KEY = 'tongzhang.session.token';
export const sessionToken = {
  read: () => SecureStore.getItemAsync(KEY),
  save: (token: string) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
