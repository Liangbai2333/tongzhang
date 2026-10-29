import { StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { colors } from '@/theme/tokens';
import { Touch } from './Touch';

const tabs = [
  { name: 'ledgers', label: '账本', asset: ledgerAssets.ledger },
  { name: 'account', label: '我的', asset: ledgerAssets.user },
] as const;

/** Persistent bottom bar for the (tabs) navigator; switching keeps both tab screens mounted. */
export function MainTabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const index = state.routes.findIndex((route) => route.name === tab.name);
        const route = state.routes[index];
        if (!route) return null;
        const focused = state.index === index;
        return (
          <Touch
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}
          >
            <View style={styles.content}>
              <FigmaAsset asset={tab.asset} />
              <Text style={[styles.label, focused && styles.active]}>{tab.label}</Text>
            </View>
          </Touch>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 11,
    paddingHorizontal: 24,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center' },
  content: { alignItems: 'center', gap: 2 },
  label: { fontSize: 12, lineHeight: 18, color: colors.muted },
  active: { fontWeight: '700', color: colors.text },
});
