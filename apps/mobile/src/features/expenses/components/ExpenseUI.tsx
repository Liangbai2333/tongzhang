import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Touch } from '@/components/Touch';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
export function MemberAvatar({
  name,
  index = 0,
  size = 28,
}: {
  name: string;
  index?: number;
  size?: number;
}) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: [colors.mint, colors.sky, colors.peach, colors.lavender][index % 4],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: size >= 40 ? 18 : 12 }}>
        {Array.from(name).at(-1)}
      </Text>
    </View>
  );
}
export function ExpenseRow({
  label,
  children,
  onPress,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Touch accessibilityLabel={label} disabled={disabled} onPress={onPress} style={s.target}>
      <View style={ui.between}>
        <Text style={ui.muted}>{label}</Text>
        <View style={[ui.row, s.value]}>
          {children}
          <FigmaAsset asset={expenseAssets.down} />
        </View>
      </View>
    </Touch>
  );
}
export const expenseStyles = StyleSheet.create({
  content: { paddingTop: 6, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12 },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  label: { fontSize: 12, lineHeight: 18, color: colors.muted },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  choice: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    justifyContent: 'center',
  },
  notice: { backgroundColor: colors.primarySoft, borderRadius: 20, padding: 16, gap: 6 },
});
const s = StyleSheet.create({
  target: { minHeight: 44, justifyContent: 'center' },
  value: { flexShrink: 1, justifyContent: 'flex-end', gap: 6 },
});
