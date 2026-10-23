import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar } from '@/features/preview/PreviewUI';
import { previewMembers, yuan } from '@/features/preview/fixtures';

export default function BalancesScreen() {
  return (
    <Screen
      title="成员余额"
      preview
      contentStyle={{ gap: 16 }}
      footer={
        <Button
          title="预览结算"
          icon={<FigmaAsset asset={figmaAssets['5-222'].imgLeadingIcon} />}
          onPress={() => router.push('/preview/settlement')}
        />
      }
    >
      <View style={[ui.card, ui.bordered, { gap: 8 }]}>
        <View style={ui.between}>
          <Text style={ui.caption}>鼓山一日 · 4 位成员</Text>
          <Text style={ui.caption}>进行中</Text>
        </View>
        <Text style={ui.caption}>旅行总花费</Text>
        <Text style={ui.amount}>¥300.00</Text>
        <View style={ui.divider} />
        <View style={ui.row}>
          <View style={ui.grow}>
            <Text style={ui.caption}>● 待收回</Text>
            <Text style={[ui.heading, { color: colors.success, fontSize: 22 }]}>¥90.00</Text>
          </View>
          <View style={{ width: 1, height: 44, backgroundColor: colors.border }} />
          <View style={ui.grow}>
            <Text style={ui.caption}>● 待偿还</Text>
            <Text style={[ui.heading, { color: colors.danger, fontSize: 22 }]}>¥90.00</Text>
          </View>
        </View>
      </View>
      <View style={ui.between}>
        <Text style={ui.muted}>成员明细</Text>
        <Text style={ui.caption}>+ 应收 / − 应付</Text>
      </View>
      <View style={{ gap: 8 }}>
        {previewMembers.map((member, i) => (
          <View key={member.name} style={[ui.card, ui.row, { padding: 16 }]}>
            <Avatar name={member.initial} index={i} />
            <View style={ui.grow}>
              <Text style={ui.strong}>{member.name}</Text>
              <Text style={ui.caption}>
                已付 ¥{yuan(member.paid)} · 应摊 ¥{yuan(member.share)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[ui.heading, { color: i < 2 ? colors.success : colors.danger }]}>
                {i < 2 ? '+' : '−'}¥{yuan(member.net.replace('-', ''))}
              </Text>
              <Text style={[ui.caption, { color: i < 2 ? colors.success : colors.danger }]}>
                {i < 2 ? '应收' : '应付'}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={[ui.between, { padding: 12, borderRadius: 20, backgroundColor: colors.mint }]}>
        <Text style={ui.caption}>已付 = 应摊 ¥300.00</Text>
        <Text style={[ui.caption, { fontWeight: '700', color: colors.success }]}>净额 ¥0.00</Text>
      </View>
    </Screen>
  );
}
