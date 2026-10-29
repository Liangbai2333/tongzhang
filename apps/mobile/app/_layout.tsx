import { Stack } from 'expo-router';
import { Modal, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';
import SessionRecovery from '@/features/auth/screens/SessionRecovery';
import AuthScreen from '@/features/auth/screens/AuthScreen';
import { colors } from '@/theme/tokens';

export function AuthNavigation() {
  const { status, user, error } = useAuth();
  const reauthentication = status === 'reauthentication';
  // Re-verifying a kept session dims the current page instead of replacing it.
  const verifying = status === 'restoring' && !error && user !== null;
  const locked = status === 'restoring' || status === 'error' || reauthentication;
  if (locked && !user) return <SessionRecovery />;
  const authenticated = user !== null && status !== 'anonymous';
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
        <Modal
          visible
          transparent={verifying}
          animationType={verifying ? 'fade' : 'none'}
          onRequestClose={() => {}}
        >
          {reauthentication ? <AuthScreen recovery /> : <SessionRecovery compact={verifying} />}
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
