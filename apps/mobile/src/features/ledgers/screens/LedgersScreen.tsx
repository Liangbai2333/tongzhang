import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Touch } from '@/components/Touch';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar, AvatarGroup, Note, PreviewTabs, Row } from '@/features/preview/PreviewUI';

const cards = [
  {
    name: '鼓山一日',
    status: '进行中',
    members: 4,
    metric: '当前分摊 ¥90.00',
    total: '300.00',
    icon: figmaAssets['3-2'].imgMountain,
  },
  {
    name: '周末聚餐',
    status: '结算中',
    members: 5,
    metric: '查看待收付',
    total: '568.00',
    icon: figmaAssets['3-2'].imgGlyph,
  },
  {
    name: '宿舍生活',
    status: '已结清',
    members: 4,
    metric: '你已付清',
    total: '1,240.00',
    icon: figmaAssets['3-2'].imgGlyph1,
  },
];
export default function LedgersScreen() {
  const [filter, setFilter] = useState('全部');
  const [panel, setPanel] = useState('');
  return (
    <Screen
      title="同账"
      back={false}
      preview
      contentStyle={{ paddingHorizontal: 20, gap: 12 }}
      action={
        <Touch accessibilityLabel="创建或加入账本" onPress={() => setPanel('添加账本')}>
          <FigmaAsset asset={figmaAssets['3-2'].img} />
        </Touch>
      }
      footer={<PreviewTabs active="books" />}
    >
      <View style={ui.between}>
        <View style={ui.grow}>
          <Text style={[ui.heading, { fontSize: 20 }]}>早上好，小安 ☀</Text>
          <Text style={ui.muted}>看看还有哪些账要处理。</Text>
        </View>
        <Touch accessibilityLabel="查看个人中心" onPress={() => router.replace('/preview/profile')}>
          <Avatar name="安" size={46} />
        </Touch>
      </View>
      <View style={styles.filters}>
        {['全部', '进行中', '结算中', '已结清'].map((item, i) => (
          <Touch
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ checked: filter === item }}
            onPress={() => setFilter(item)}
            style={[
              styles.filter,
              {
                backgroundColor:
                  filter === item
                    ? colors.primary
                    : [colors.surface, colors.primarySoft, colors.sky, colors.mint][i],
              },
            ]}
          >
            <Text style={ui.caption}>
              {item} {i === 0 ? 3 : 1}
            </Text>
          </Touch>
        ))}
      </View>
      <View style={{ gap: 10 }}>
        {cards
          .filter((card) => filter === '全部' || card.status === filter)
          .map((card) => (
            <Touch
              key={card.name}
              onPress={() =>
                card.name === '鼓山一日' ? router.push('/preview/ledger') : setPanel(card.name)
              }
              style={styles.card}
            >
              <View style={{ gap: 8 }}>
                <View style={ui.between}>
                  <View style={ui.row}>
                    <View style={styles.tile}>
                      <FigmaAsset asset={card.icon} />
                    </View>
                    <View>
                      <Text style={ui.body}>{card.name}</Text>
                      <Text style={ui.caption}>{card.members} 位成员</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          card.status === '已结清'
                            ? colors.mint
                            : card.status === '结算中'
                              ? colors.primarySoft
                              : colors.background,
                      },
                    ]}
                  >
                    <Text style={ui.caption}>{card.status}</Text>
                  </View>
                </View>
                <View style={ui.between}>
                  <View style={ui.grow}>
                    <Text
                      style={[ui.heading, card.status === '已结清' && { color: colors.success }]}
                    >
                      {card.metric}
                    </Text>
                    <Text style={ui.caption}>总支出 ¥{card.total}</Text>
                  </View>
                  {card.name === '鼓山一日' ? (
                    <AvatarGroup />
                  ) : (
                    <View style={{ flexDirection: 'row', paddingLeft: 6 }}>
                      {Array.from({ length: card.members }, (_, index) => (
                        <View
                          key={index}
                          style={{
                            marginLeft: -6,
                            borderWidth: 2,
                            borderColor: colors.surface,
                            borderRadius: 18,
                          }}
                        >
                          <Avatar
                            name={index === 0 ? '安' : String(index + 1)}
                            index={index}
                            size={24}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </Touch>
          ))}
      </View>
      <Row title="已归档账本" onPress={() => setPanel('已归档账本')} />
      <Sheet visible={!!panel} title={panel} onClose={() => setPanel('')}>
        {panel === '添加账本' ? (
          <>
            <Row
              title="创建新账本"
              icon={figmaAssets['3-2'].imgIconLedger}
              onPress={() => {
                setPanel('');
                router.push('/preview/create');
              }}
            />
            <Row
              title="有邀请码？加入账本"
              icon={figmaAssets['5-358'].imgGlyph1}
              onPress={() => {
                setPanel('');
                router.push('/preview/join');
              }}
            />
          </>
        ) : (
          <>
            <Note>
              {panel === '已归档账本'
                ? '历史列表将在下一阶段接入。归档只影响个人列表，不改变账本财务状态。'
                : '这是 Figma 的账本状态样例。当前首批实现包含“鼓山一日”的详情与结算预览。'}
            </Note>
            <Button
              title="查看已实现的账本详情"
              onPress={() => {
                setPanel('');
                router.push('/preview/ledger');
              }}
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filter: { minHeight: 44, borderRadius: 18, paddingHorizontal: 12, justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tile: {
    width: 36,
    height: 36,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
