import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';
import SessionRecovery from '@/features/auth/screens/SessionRecovery';

export function AuthNavigation() {
  const { status, user } = useAuth();
  if (status === 'restoring' || status === 'error') return <SessionRecovery />;
  const authenticated = status === 'authenticated' && user !== null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!authenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={authenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <AuthNavigation />
    </AppProviders>
  );
}
