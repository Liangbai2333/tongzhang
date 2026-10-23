import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar, Note, usePreviewNotice } from '@/features/preview/PreviewUI';

export default function InviteScreen() {
  const a = figmaAssets['87-1597'];
  const { notice, notify } = usePreviewNotice();
  return (
    <Screen
      title="邀请一起记账"
      preview
      contentStyle={{ gap: 12 }}
      footer={
        <>
          {notice}
          <Button title="进入账本" onPress={() => router.dismissTo('/preview/ledger')} />
        </>
      }
    >
      <Text style={ui.title}>鼓山一日</Text>
      <View style={ui.row}>
        <Avatar name="安" />
        <View>
          <Text style={ui.strong}>小安（我）</Text>
          <Text style={ui.caption}>设计样例 · 当前 1 / 12 人</Text>
        </View>
      </View>
      <View style={[ui.card, { alignItems: 'center', paddingVertical: 16, gap: 10 }]}>
        <Text
          style={{
            backgroundColor: colors.primarySoft,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 4,
            color: colors.warning,
          }}
        >
          邀请码
        </Text>
        <Text selectable style={[ui.amount, { fontSize: 38, letterSpacing: 2 }]}>
          483 926
        </Text>
        <View style={{ width: 120, height: 3, backgroundColor: colors.primary }} />
        <View style={[ui.divider, { alignSelf: 'stretch', marginVertical: 4 }]} />
        <FigmaAsset asset={a.imgQrTongzhangJoinCode483926} />
        <View style={ui.row}>
          <FigmaAsset asset={a.imgIconScan} />
          <Text style={ui.caption}>设计二维码 · 不可用于实际加入</Text>
        </View>
      </View>
      <View style={ui.row}>
        <View style={{ flex: 1.3 }}>
          <Button
            title="复制邀请码"
            variant="secondary"
            icon={<FigmaAsset asset={a.imgLeadingIcon} />}
            onPress={() => notify('这是设计示例邀请码，尚未接入复制功能。')}
          />
        </View>
        <View style={ui.grow}>
          <Button
            title="分享邀请"
            variant="secondary"
            icon={<FigmaAsset asset={a.imgIconShare} />}
            onPress={() => notify('分享邀请尚未接入。')}
          />
        </View>
      </View>
      <Note title="邀请码有效期 7 天">请仅分享给参与此账本的朋友。当前显示的是设计样例。</Note>
    </Screen>
  );
}
