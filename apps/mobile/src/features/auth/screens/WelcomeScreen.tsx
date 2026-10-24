import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { AuthNotice } from '../components';
import { colors } from '@/theme/tokens';

const art = figmaAssets['5-2'];
export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const illustrationScale = Math.min(1, (width - 48) / 345);
  return (
    <Screen back={false} contentStyle={styles.content}>
      <AuthNotice />
      <View style={ui.between}>
        <View style={ui.row}>
          <View style={styles.logo}>
            <FigmaAsset asset={art.imgIconLedger} />
          </View>
          <View>
            <Text style={styles.brand}>同账</Text>
            <Text style={styles.wordmark}>TongZhang</Text>
          </View>
        </View>
      </View>
      <View style={styles.artSpace}>
        <View
          style={[styles.art, { transform: [{ scale: illustrationScale }] }]}
          accessibilityLabel="四位朋友围绕一本共同账本"
          accessible
        >
          <FigmaAsset
            asset={art.imgConnectionMember1}
            style={[styles.position, { left: 79.1, top: 81.1 }]}
          />
          <FigmaAsset
            asset={art.imgConnectionMember2}
            style={[styles.position, { left: 243.1, top: 106.1 }]}
          />
          <FigmaAsset
            asset={art.imgConnectionMember3}
            style={[styles.position, { left: 65.1, top: 240.1 }]}
          />
          <FigmaAsset
            asset={art.imgConnectionMember4}
            style={[styles.position, { left: 244.1, top: 246.1 }]}
          />
          <FigmaAsset
            asset={art.imgIllustrationBoundSharedLedger}
            style={[styles.position, { left: 86, top: 93 }]}
          />
          <FigmaAsset asset={art.imgFrame} style={[styles.position, { left: 28, top: 48 }]} />
          <FigmaAsset asset={art.imgFrame1} style={[styles.position, { left: 258, top: 76 }]} />
          <FigmaAsset asset={art.imgFrame1} style={[styles.position, { left: 25, top: 249 }]} />
          <FigmaAsset asset={art.imgFrame} style={[styles.position, { left: 257, top: 273 }]} />
          <FigmaAsset
            asset={art.imgCurrencyToken}
            style={[styles.position, { left: 229, top: 170 }]}
          />
          <Text style={styles.currency}>¥</Text>
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={styles.headline}>一起花的钱，{'\n'}一本账算清。</Text>
        <Text style={ui.muted}>多人记账，灵活分摊，轻松结清。</Text>
      </View>
      <View style={{ gap: 8 }}>
        <Button title="开始使用" onPress={() => router.push('/register')} />
        <Touch onPress={() => router.push('/login')} style={styles.login}>
          <Text style={ui.muted}>
            已有账号？ <Text style={ui.strong}>登录</Text>
          </Text>
        </Touch>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { paddingTop: 20, gap: 20 },
  logo: {
    backgroundColor: colors.primarySoft,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontWeight: '700', fontSize: 20, lineHeight: 26, color: colors.text },
  wordmark: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  artSpace: { flex: 1, minHeight: 350, alignItems: 'center', justifyContent: 'center' },
  art: { width: 345, height: 388 },
  position: { position: 'absolute' },
  currency: {
    position: 'absolute',
    left: 255,
    top: 185,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.text,
  },
  copy: { gap: 8 },
  headline: { fontSize: 28, lineHeight: 38, fontWeight: '700', color: colors.text },
  login: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
