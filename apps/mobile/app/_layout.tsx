import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/AppProviders';
import { useReducedMotion } from '@/components/motion';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  const reduced = useReducedMotion();
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduced ? 'none' : 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="preview/index" options={{ animation: reduced ? 'none' : 'fade' }} />
        <Stack.Screen name="preview/profile" options={{ animation: reduced ? 'none' : 'fade' }} />
      </Stack>
    </AppProviders>
  );
}
