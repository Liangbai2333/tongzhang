import { Tabs } from 'expo-router';
import { MainTabBar } from '@/components/MainTabs';
import { useReducedMotion } from '@/components/motion';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const reduced = useReducedMotion();
  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: reduced ? 'none' : 'fade',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="ledgers" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
