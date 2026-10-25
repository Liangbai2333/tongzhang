import { StyleSheet, Text, View } from 'react-native';
import { ui } from '@/components/Screen';
import { Touch } from '@/components/Touch';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { colors } from '@/theme/tokens';
import { yuan } from '../presentation';

/** Decorative receipt stack translated from Figma 17:1015; it is not business data. */
function ReceiptIllustration() {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.illustrationZone}
    >
      <View style={styles.graphic}>
        <View style={[styles.backCard, styles.backTwo]}>
          {[120, 60, 80].map((width, i) => (
            <View key={i} style={[styles.backLine, { width }]} />
          ))}
        </View>
        <View style={[styles.backCard, styles.backOne]}>
          {[120, 50, 70].map((width, i) => (
            <View key={i} style={[styles.backLine, { width }]} />
          ))}
        </View>
        <View style={styles.frontCard}>
          <View style={ui.between}>
            <View style={styles.coinBadge}>
              <Text style={styles.coinText}>¥</Text>
            </View>
            <FigmaAsset asset={ledgerAssets.dots} />
          </View>
          <View style={styles.entryLines}>
            {[
              [48, 28],
              [60, 24],
              [40, 32],
            ].map(([left, right], i) => (
              <View key={i} style={ui.between}>
                <View style={[styles.line, { width: left }]} />
                <View
                  style={[
                    styles.line,
                    { width: right, backgroundColor: i === 0 ? colors.primarySoft : colors.border },
                  ]}
                />
              </View>
            ))}
          </View>
        </View>
        <View style={styles.floatCoin}>
          <Text style={[styles.coinText, { fontSize: 16 }]}>¥</Text>
        </View>
        <View style={styles.smallCoin}>
          <Text style={[styles.coinText, { fontSize: 10, color: colors.muted }]}>¥</Text>
        </View>
        <View style={styles.people}>
          <View style={[styles.person, { backgroundColor: colors.sky }]}>
            <Text style={[styles.personText, { color: '#4A90C4' }]}>A</Text>
          </View>
          <View style={[styles.person, { backgroundColor: colors.peach }]}>
            <Text style={[styles.personText, { color: '#C46A4A' }]}>B</Text>
          </View>
          <View style={[styles.person, { backgroundColor: colors.primarySoft }]}>
            <FigmaAsset asset={ledgerAssets.add} />
          </View>
        </View>
        <Text style={styles.sparkle}>✦</Text>
      </View>
    </View>
  );
}

export function EmptyLedger({
  totalCents,
  onInvite,
}: {
  totalCents: string;
  onInvite?: () => void;
}) {
  return (
    <View>
      <ReceiptIllustration />
      <View style={styles.statusRow}>
        <View style={styles.status}>
          <Text style={styles.statusText}>进行中</Text>
        </View>
      </View>
      <Text style={styles.amount} accessibilityLabel={`账本总支出 ${yuan(totalCents)}`}>
        {yuan(totalCents)}
      </Text>
      <Text style={styles.title}>你们的故事，从第一笔开始。</Text>
      <Text style={styles.description}>
        还没有消费记录。{'\n'}记录付款人和参与成员，剩下的交给同账。
      </Text>
      <View style={styles.hints}>
        {(
          [
            {
              title: '付款人',
              description: '记录谁付了钱',
              asset: ledgerAssets.payer,
              color: colors.primarySoft,
            },
            {
              title: '参与成员',
              description: '谁参与了消费',
              asset: ledgerAssets.members,
              color: colors.mint,
            },
          ] as const
        ).map((item) => (
          <View key={item.title} style={styles.hint}>
            <View style={styles.hintTitle}>
              <View style={[styles.hintIcon, { backgroundColor: item.color }]}>
                <FigmaAsset asset={item.asset} />
              </View>
              <Text style={styles.hintLabel}>{item.title}</Text>
            </View>
            <Text style={styles.hintDescription}>{item.description}</Text>
          </View>
        ))}
      </View>
      {onInvite && (
        <Touch accessibilityLabel="邀请成员一起记账" style={styles.invite} onPress={onInvite}>
          <View style={styles.inviteContent}>
            <View style={styles.invitePeople}>
              <View style={[styles.invitePerson, { backgroundColor: colors.sky }]}>
                <Text style={styles.you}>你</Text>
              </View>
              <View style={[styles.invitePerson, { backgroundColor: colors.primarySoft }]}>
                <FigmaAsset asset={ledgerAssets.add} />
              </View>
            </View>
            <Text style={[ui.body, ui.grow]}>邀请成员一起记账</Text>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <FigmaAsset asset={ledgerAssets.inviteBack} />
            </View>
          </View>
        </Touch>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  illustrationZone: {
    height: 236,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphic: { width: 220, height: 180 },
  backCard: {
    position: 'absolute',
    width: 148,
    height: 100,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  backLine: { height: 8, borderRadius: 4, backgroundColor: colors.border },
  backTwo: { top: 18, left: 32, backgroundColor: colors.lavender },
  backOne: { top: 10, left: 18, backgroundColor: colors.mint },
  frontCard: {
    position: 'absolute',
    top: 2,
    left: 4,
    width: 152,
    height: 112,
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    boxShadow: '0px 4px 8px rgba(38,31,20,0.1)',
  },
  coinBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coinText: { fontSize: 13, fontWeight: '700', color: colors.text },
  entryLines: { gap: 6 },
  line: { height: 7, borderRadius: 4, backgroundColor: colors.border },
  floatCoin: {
    position: 'absolute',
    top: 0,
    left: 158,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 4px rgba(255,199,107,0.3)',
  },
  smallCoin: {
    position: 'absolute',
    left: 0,
    top: 102,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  people: { position: 'absolute', left: 158, top: 52, flexDirection: 'row' },
  person: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
  personText: { fontSize: 9, fontWeight: '700' },
  sparkle: { position: 'absolute', left: -4, top: 8, fontSize: 14, color: '#000000' },
  statusRow: { paddingBottom: 16, alignItems: 'flex-start' },
  status: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primarySoft,
  },
  statusText: { fontSize: 12, lineHeight: 18, color: colors.warning },
  amount: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  title: { ...ui.title, marginTop: 10 },
  description: { ...ui.body, color: colors.muted, marginTop: 12 },
  hints: { flexDirection: 'row', gap: 12, marginTop: 20 },
  hint: {
    flex: 1,
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },
  hintTitle: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  hintIcon: { width: 20, height: 20, borderRadius: 10 },
  hintLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.text },
  hintDescription: { fontSize: 11, lineHeight: 16, color: colors.muted },
  invite: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inviteContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invitePeople: { flexDirection: 'row', marginRight: 5 },
  invitePerson: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -5,
  },
  you: { fontSize: 11, fontWeight: '700', color: '#4A90C4' },
});
