import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '@/lib/query-client';

export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(createQueryClient);
  useEffect(() => {
    const focus = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    const network = Network.addNetworkStateListener((state) => {
      onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => {
      focus.remove();
      network.remove();
    };
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
