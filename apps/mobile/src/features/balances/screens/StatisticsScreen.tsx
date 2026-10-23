import { StyleSheet, Text, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar } from '@/features/preview/PreviewUI';
import { previewExpenses, previewMembers, yuan } from '@/features/preview/fixtures';

export default function StatisticsScreen() {
  const a = figmaAssets['5-307'];
  return (
    <Screen title="支出统计" preview contentStyle={{ gap: 20 }}>
      <View>
        <Text style={ui.muted}>这次出行，花了多少？</Text>
        <Text style={ui.amount}>¥300.00</Text>
      </View>
      <Text style={ui.heading}>按消费类别</Text>
      <View style={[ui.row, { gap: 20, flexWrap: 'wrap' }]}>
        <View
          style={styles.chart}
          accessible
          accessibilityLabel="餐饮 40%，门票 40%，交通 20%，总支出 300 元"
        >
          <FigmaAsset asset={a.imgEllipse} style={styles.absolute} />
          <FigmaAsset asset={a.imgEllipse1} style={[styles.absolute, { left: 71.19 }]} />
          <FigmaAsset asset={a.imgEllipse2} style={[styles.absolute, { top: 50.036 }]} />
          <FigmaAsset asset={a.imgEllipse3} style={[styles.absolute, { left: 3.99 }]} />
          <Text style={ui.caption}>总支出</Text>
          <Text style={ui.strong}>¥300</Text>
        </View>
        <View style={{ flex: 1, minWidth: 140, gap: 12 }}>
          {previewExpenses.map((expense, i) => (
            <View key={expense.id} style={ui.row}>
              <View style={styles.tile}>
                <FigmaAsset asset={a[expense.icon]} />
              </View>
              <View style={ui.grow}>
                <View style={ui.between}>
                  <Text style={ui.strong}>{expense.category}</Text>
                  <Text style={ui.caption}>{i < 2 ? '40%' : '20%'}</Text>
                </View>
                <Text style={ui.caption}>¥{yuan(expense.cents)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={ui.divider} />
      <Text style={ui.heading}>成员已付 / 应摊</Text>
      {previewMembers.map((member, i) => (
        <View key={member.name} style={{ gap: 6 }}>
          <View style={ui.between}>
            <View style={ui.row}>
              <Avatar name={member.initial} index={i} size={24} />
              <Text style={ui.body}>{member.name}</Text>
            </View>
            <Text style={ui.strong}>
              ¥{yuan(member.paid)} <Text style={ui.caption}>/ ¥{yuan(member.share)}</Text>
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                {
                  width: (['60%', '60%', '30%', '0%'] as const)[i],
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                { width: (['45%', '30%', '45%', '30%'] as const)[i], backgroundColor: '#D4C4F0' },
              ]}
            />
          </View>
        </View>
      ))}
      <View style={ui.row}>
        <View style={[styles.legend, { backgroundColor: colors.primary }]} />
        <Text style={ui.caption}>已付</Text>
        <View style={[styles.legend, { backgroundColor: '#D4C4F0' }]} />
        <Text style={ui.caption}>应摊</Text>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  chart: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  absolute: { position: 'absolute', left: 0, top: 0 },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  bar: { height: 5 },
  legend: { width: 16, height: 5, borderRadius: 3 },
});
