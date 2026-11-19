import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Touch } from '@/components/Touch';
import { EmptyState, RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { ledgersApi } from '@/features/ledgers/api';
import { statusLabels, yuan } from '@/features/ledgers/presentation';
import { categoryLabel } from '@/features/expenses/presentation';
import { colors } from '@/theme/tokens';
import { balancesApi } from '../api';
import { balancesKeys } from '../query-keys';
import {
  CategoryDonutChart,
  DailyTrendChart,
  MemberComparisonChart,
} from '../components/StatisticsCharts';

export default function StatisticsScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    balancesKeys.statistics(user!.id, ledgerId),
    async () => {
      const [statistics, ledger] = await Promise.all([
        balancesApi.getStatistics({ params: { ledgerId }, query: {}, body: undefined }),
        ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
      ]);
      return { statistics: statistics.data, ledger: ledger.data };
    },
    valid,
  );
  const loading = valid && blocksContent(query);
  const ready = valid && !loading && !query.isError && query.data;
  const stats = query.data?.statistics;
  const isEmpty = Boolean(
    stats && (stats.expenseCount === 0 || BigInt(stats.expenseTotalCents) === 0n),
  );

  return (
    <Screen
      title="支出统计"
      variant="ledger"
      contentStyle={{ paddingTop: 8, gap: 16 }}
      onRefresh={
        valid
          ? () => {
              void query.refetch();
            }
          : undefined
      }
      refreshing={query.isRefetching}
    >
      {!ready ? (
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取支出统计' : '账本地址无效'}
          description="请检查网络后重试。"
          error={query.error}
          onRetry={
            valid
              ? () => {
                  void query.refetch();
                }
              : undefined
          }
        />
      ) : (
        <>
          <View style={s.hero}>
            <View style={ui.between}>
              <Text style={[ui.caption, ui.grow]}>
                {ready.ledger.name} · {ready.statistics.expenseCount} 笔有效消费
              </Text>
              <Text style={s.status}>{statusLabels[ready.ledger.status]}</Text>
            </View>
            <Text style={ui.caption}>有效消费总额</Text>
            <Text style={ui.amount}>{yuan(ready.statistics.expenseTotalCents)}</Text>
          </View>
          {isEmpty ? (
            <EmptyState
              title="暂无消费统计"
              description="记录消费后，这里会自动展示分类占比、按日趋势、单笔排行与成员收支对比。"
            />
          ) : (
            <>
              <CategoryDonutChart
                categories={ready.statistics.categories}
                totalCents={ready.statistics.expenseTotalCents}
              />
              <DailyTrendChart
                dailyTrend={ready.statistics.dailyTrend}
                truncated={ready.statistics.dailyTrendTruncated}
              />
              <View style={s.card}>
                <View style={ui.between}>
                  <Text style={ui.heading}>单笔支出排行</Text>
                  <Text style={ui.caption}>前 {ready.statistics.topExpenses.length} 笔</Text>
                </View>
                <View style={s.rankList}>
                  {ready.statistics.topExpenses.map((item, index) => (
                    <Touch
                      key={item.id}
                      accessibilityLabel={`第 ${index + 1} 名 ${item.title} ${yuan(item.amountCents)}`}
                      onPress={() =>
                        router.push({
                          pathname: '/ledgers/[ledgerId]/expenses/[expenseId]',
                          params: { ledgerId, expenseId: item.id },
                        })
                      }
                      style={s.rankRow}
                    >
                      <View style={s.rankBadge}>
                        <Text style={s.rankIndex}>{index + 1}</Text>
                      </View>
                      <View style={ui.grow}>
                        <Text numberOfLines={1} style={ui.strong}>
                          {item.title}
                        </Text>
                        <Text style={ui.caption}>
                          {categoryLabel(item.category)} · {item.payerName} · {item.occurredOn}
                        </Text>
                      </View>
                      <Text style={s.rankAmount}>{yuan(item.amountCents)}</Text>
                    </Touch>
                  ))}
                </View>
              </View>
              <MemberComparisonChart members={ready.statistics.members} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 8,
  },
  status: {
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankList: { gap: 8 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.background,
    minHeight: 48,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankIndex: { fontSize: 12, fontWeight: '700', color: colors.warning },
  rankAmount: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
