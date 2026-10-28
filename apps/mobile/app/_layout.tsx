import { Stack } from 'expo-router';
import { Modal, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';
import SessionRecovery from '@/features/auth/screens/SessionRecovery';
import AuthScreen from '@/features/auth/screens/AuthScreen';

export function AuthNavigation() {
  const { status, user } = useAuth();
  const reauthentication = status === 'reauthentication';
  const locked = status === 'restoring' || status === 'error' || reauthentication;
  if (locked && !user) return <SessionRecovery />;
  const authenticated = user !== null && status !== 'anonymous';
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={locked ? 'none' : 'auto'}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
      >
        <Stack key={user?.id ?? 'anonymous'} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={!authenticated}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={authenticated}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </View>
      {locked && (
        <Modal visible animationType="none" onRequestClose={() => {}}>
          {reauthentication ? <AuthScreen recovery /> : <SessionRecovery />}
        </Modal>
      )}
    </View>
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
