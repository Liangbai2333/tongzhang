import { StyleSheet, Text, View } from 'react-native';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { invitationAssets } from '@/icons/invitation-assets';
import { colors } from '@/theme/tokens';
import { ui } from '@/components/Screen';

export function JoinInvitationHero() {
  return (
    <View style={styles.hero}>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.decoration}
        pointerEvents="none"
      >
        <FigmaAsset asset={invitationAssets.circleLarge} style={styles.largeCircle} />
        <FigmaAsset asset={invitationAssets.circleSmall} style={styles.smallCircle} />
      </View>
      <View style={[ui.grow, styles.copy]}>
        <Text style={styles.intro}>你被邀请加入</Text>
        <Text style={styles.title}>朋友的共同账本 ✨</Text>
        <View style={styles.friends}>
          <FigmaAsset asset={invitationAssets.friendOne} />
          <FigmaAsset asset={invitationAssets.friendTwo} />
          <Text style={styles.caption}>核对后再加入</Text>
        </View>
      </View>
      <View style={styles.book}>
        <FigmaAsset asset={invitationAssets.ledger} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  hero: {
    minHeight: 148,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    overflow: 'hidden',
  },
  decoration: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  largeCircle: { position: 'absolute', right: -25, top: -30 },
  smallCircle: { position: 'absolute', right: 5, top: 60 },
  copy: { gap: 8 },
  intro: { fontSize: 13, lineHeight: 19, color: colors.muted },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text },
  friends: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  caption: { fontSize: 12, lineHeight: 18, color: colors.muted },
  book: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
