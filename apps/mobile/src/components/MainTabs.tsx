import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { colors } from '@/theme/tokens';
import { Touch } from './Touch';

export function MainTabs({ active }: { active: 'ledgers' | 'account' }) {
  return (
    <View style={styles.tabs}>
      {(
        [
          { key: 'ledgers', label: '账本', asset: ledgerAssets.ledger, href: '/ledgers' },
          { key: 'account', label: '我的', asset: ledgerAssets.user, href: '/account' },
        ] as const
      ).map((tab) => (
        <Touch
          key={tab.key}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: tab.key === active }}
          onPress={() => {
            if (tab.key !== active) router.replace(tab.href);
          }}
          style={styles.tab}
        >
          <View style={styles.content}>
            <FigmaAsset asset={tab.asset} />
            <Text style={[styles.label, tab.key === active && styles.active]}>{tab.label}</Text>
          </View>
        </Touch>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingTop: 6 },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center' },
  content: { alignItems: 'center', gap: 2 },
  label: { fontSize: 12, lineHeight: 18, color: colors.muted },
  active: { fontWeight: '700', color: colors.text },
});
