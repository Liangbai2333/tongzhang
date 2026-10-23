import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { Sheet } from '@/components/Sheet';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar, Chips, Note, Row, usePreviewNotice } from '@/features/preview/PreviewUI';
import { categories, previewExpenses, previewMembers, yuan } from '@/features/preview/fixtures';

const a = figmaAssets['3-59'];
export default function LedgerScreen() {
  const [panel, setPanel] = useState<'closed' | 'members' | 'filter' | 'expense' | 'more'>(
    'closed',
  );
  const [category, setCategory] = useState('全部');
  const [payer, setPayer] = useState('全部');
  const [draftCategory, setDraftCategory] = useState('全部');
  const [draftPayer, setDraftPayer] = useState('全部');
  const [selected, setSelected] = useState<(typeof previewExpenses)[number]>(previewExpenses[0]);
  const { notice, notify } = usePreviewNotice();
  const expenses = previewExpenses.filter(
    (item) =>
      (category === '全部' || item.category === category) &&
      (payer === '全部' || item.payer === payer),
  );
  return (
    <Screen
      title="鼓山一日"
      preview
      action={
        <Touch
          accessibilityLabel="账本更多操作"
          onPress={() => setPanel('more')}
          style={styles.more}
        >
          <FigmaAsset asset={a.imgIconMore} />
        </Touch>
      }
      footer={
        <Button
          title="记一笔"
          icon={<FigmaAsset asset={a.imgIconAdd} />}
          onPress={() => router.push('/preview/expense')}
        />
      }
    >
      <View style={ui.row}>
        <Touch style={styles.members} onPress={() => setPanel('members')}>
          <View style={ui.row}>
            <FigmaAsset asset={a.imgIconMembers} />
            <Text style={[ui.body, ui.grow]}>成员 · 4 人</Text>
            <FigmaAsset asset={a.imgIconChevronRight} />
          </View>
        </Touch>
        <Text style={ui.caption}>进行中</Text>
      </View>
      <View style={[ui.card, ui.bordered, { gap: 16 }]}>
        <Text style={ui.caption}>总支出 · 人民币</Text>
        <Text style={ui.amount}>¥300.00</Text>
        <View style={ui.divider} />
        <View style={ui.between}>
          {[
            ['我的垫付', '120.00'],
            ['当前分摊', '90.00'],
            ['当前净额', '+30.00'],
          ].map(([label, value], i) => (
            <View key={label} style={{ flex: 1, gap: 4 }}>
              <Text style={ui.caption}>{label}</Text>
              <Text style={[ui.heading, { fontSize: 21 }, i === 2 && { color: colors.success }]}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            { title: '余额明细', icon: a.imgIconBalance, path: '/preview/balances' },
            { title: '支出统计', icon: a.imgIconChart, path: '/preview/statistics' },
            { title: '结算', icon: a.imgIconSettle, path: '/preview/settlement' },
          ] as const
        ).map((item) => (
          <Touch key={item.title} style={styles.tool} onPress={() => router.push(item.path)}>
            <View
              style={{
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FigmaAsset asset={item.icon} />
              <Text style={ui.caption}>{item.title}</Text>
            </View>
          </Touch>
        ))}
      </View>
      <View style={ui.between}>
        <Text style={ui.heading}>消费流水 · {expenses.length} 笔</Text>
        <Touch
          style={styles.filter}
          onPress={() => {
            setDraftCategory(category);
            setDraftPayer(payer);
            setPanel('filter');
          }}
        >
          <Text style={ui.strong}>
            {category !== '全部' || payer !== '全部' ? '已筛选' : '筛选'}
          </Text>
        </Touch>
      </View>
      <View style={[ui.card, { padding: 0, gap: 0 }]}>
        {expenses.length ? (
          expenses.map((expense, i) => (
            <View key={expense.id}>
              {i > 0 && <View style={[ui.divider, { marginHorizontal: 16 }]} />}
              <Touch
                style={{ padding: 16 }}
                onPress={() => {
                  setSelected(expense);
                  setPanel('expense');
                }}
              >
                <View style={ui.row}>
                  <View style={styles.tile}>
                    <FigmaAsset asset={a[expense.icon]} />
                  </View>
                  <View style={ui.grow}>
                    <Text style={ui.strong}>{expense.title}</Text>
                    <Text style={ui.caption}>{expense.payer} 付款 · 10月10日</Text>
                  </View>
                  <Text style={ui.strong}>¥{yuan(expense.cents)}</Text>
                </View>
              </Touch>
            </View>
          ))
        ) : (
          <View style={{ padding: 24, gap: 12 }}>
            <Text style={ui.heading}>没有匹配的消费</Text>
            <Text style={ui.muted}>试试其他类别或付款人。</Text>
            <Button
              title="清除筛选"
              variant="secondary"
              onPress={() => {
                setCategory('全部');
                setPayer('全部');
              }}
            />
          </View>
        )}
      </View>
      <Sheet
        visible={panel !== 'closed'}
        title={
          panel === 'members'
            ? '账本成员 · 4 / 12'
            : panel === 'filter'
              ? '筛选消费'
              : panel === 'expense'
                ? selected.title
                : '账本操作'
        }
        onClose={() => setPanel('closed')}
      >
        {panel === 'filter' && (
          <>
            <Text style={ui.caption}>日期</Text>
            <Note>全部日期 · 本预览使用 2026 年 10 月 10 日的设计样例。</Note>
            <Text style={ui.caption}>付款人</Text>
            <Chips
              options={['全部', ...previewMembers.map((m) => m.name)]}
              value={draftPayer}
              onChange={setDraftPayer}
            />
            <Text style={ui.caption}>消费类别</Text>
            <Chips
              options={['全部', ...categories]}
              value={draftCategory}
              onChange={setDraftCategory}
            />
            <Button
              title="应用筛选"
              onPress={() => {
                setCategory(draftCategory);
                setPayer(draftPayer);
                setPanel('closed');
              }}
            />
            <Button
              title="重置筛选"
              variant="quiet"
              onPress={() => {
                setDraftCategory('全部');
                setDraftPayer('全部');
              }}
            />
          </>
        )}
        {panel === 'members' && (
          <>
            {previewMembers.map((member, i) => (
              <View key={member.name} style={[ui.row, { paddingVertical: 8 }]}>
                <Avatar name={member.initial} index={i} />
                <Text style={[ui.body, ui.grow]}>
                  {member.name}
                  {i === 0 ? '（我）' : ''}
                </Text>
                <Text style={ui.muted}>{i === 0 ? '创建者' : '成员'}</Text>
              </View>
            ))}
            <Button
              title="邀请成员"
              onPress={() => {
                setPanel('closed');
                router.push('/preview/invite');
              }}
            />
            <Button
              title="重置邀请码"
              variant="quiet"
              onPress={() => notify('预览邀请码不会重置，尚未接入邀请服务。')}
            />
          </>
        )}
        {panel === 'expense' && (
          <>
            <Text style={ui.amount}>¥{yuan(selected.cents)}</Text>
            <Text style={ui.muted}>
              {selected.category} · {selected.payer} 付款 · 2026.10.10
            </Text>
            <Note>这是 Figma 消费详情的简版预览，尚未接入编辑、删除与收据读取。</Note>
            <Button
              title="查看记账表单"
              onPress={() => {
                setPanel('closed');
                router.push('/preview/expense');
              }}
            />
          </>
        )}
        {panel === 'more' && (
          <>
            <Row
              title="邀请成员"
              onPress={() => {
                setPanel('closed');
                router.push('/preview/invite');
              }}
            />
            <Row
              title="预览结算方案"
              onPress={() => {
                setPanel('closed');
                router.push('/preview/settlement');
              }}
            />
          </>
        )}
        {notice}
      </Sheet>
    </Screen>
  );
}
const styles = StyleSheet.create({
  more: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  members: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tool: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  filter: {
    minWidth: 80,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
