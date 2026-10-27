import { Text, View, StyleSheet } from 'react-native';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { yuan } from '@/features/ledgers/presentation';
import { completionAssets } from '../completion-assets';

export function SettledSummary({
  total,
  transfers,
  members,
}: {
  total: string;
  transfers: number;
  members: number;
}) {
  return (
    <View style={s.hero}>
      <View style={s.check}>
        <FigmaAsset asset={completionAssets.check} />
      </View>
      <Text style={s.title}>账本已结清</Text>
      <View style={{ gap: 2 }}>
        <Text style={s.caption}>本次账本总支出</Text>
        <Text style={s.amount}>{yuan(total)}</Text>
      </View>
      <View style={[ui.row, { flexWrap: 'wrap', gap: 8, marginTop: 2 }]}>
        <View style={s.stat}>
          <FigmaAsset asset={completionAssets.transferDot} />
          <Text style={s.statText}>{transfers} 笔转账</Text>
        </View>
        <View style={s.stat}>
          <FigmaAsset asset={completionAssets.memberDot} />
          <Text style={s.statText}>{members} 位成员</Text>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  hero: {
    backgroundColor: colors.mint,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 6,
  },
  check: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF82',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 30 },
  caption: { color: colors.success, fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
  amount: { color: colors.text, fontSize: 32, lineHeight: 42, fontWeight: '700' },
  statText: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    opacity: 0.85,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});
