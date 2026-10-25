import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useOnlineQuery } from '@/lib/use-online-query';
import { ledgersApi } from '@/features/ledgers/api';
import { yuan, statusLabels } from '@/features/ledgers/presentation';
import { MemberAvatar } from '@/features/expenses/components/ExpenseUI';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { colors } from '@/theme/tokens';
import { balancesApi } from '../api';
import { balancesKeys } from '../query-keys';
export default function BalancesScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    balancesKeys.ledger(user!.id, ledgerId),
    async () => {
      const [balance, ledger] = await Promise.all([
        balancesApi.getBalances({ params: { ledgerId }, query: {}, body: undefined }),
        ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
      ]);
      return { balance: balance.data, ledger: ledger.data };
    },
    valid,
  );
  const loading = valid && (query.isPending || query.isFetching);
  const ready = valid && !loading && !query.isError && query.data;
  const preview = () =>
    router.push({ pathname: '/ledgers/[ledgerId]/settlement-preview', params: { ledgerId } });
  const members = query.data?.balance.members ?? [];
  const receivable = members.reduce(
    (sum, m) => sum + (BigInt(m.remainingNetCents) > 0n ? BigInt(m.remainingNetCents) : 0n),
    0n,
  );
  const payable = members.reduce(
    (sum, m) => sum + (BigInt(m.remainingNetCents) < 0n ? -BigInt(m.remainingNetCents) : 0n),
    0n,
  );
  const paid = members.reduce((sum, m) => sum + BigInt(m.paidCents), 0n);
  const shared = members.reduce((sum, m) => sum + BigInt(m.sharedCents), 0n);
  const net = members.reduce((sum, m) => sum + BigInt(m.netCents), 0n);
  return (
    <Screen
      title="成员余额"
      variant="ledger"
      contentStyle={{ paddingTop: 8, gap: 16 }}
      onRefresh={
        valid
          ? () => {
              void query.refetch();
            }
          : undefined
      }
      refreshing={query.isFetching && !query.isPending}
      footer={
        ready && ready.ledger.status === 'ACTIVE' ? (
          <Button
            title="预览结算"
            icon={<FigmaAsset asset={expenseAssets.preview} />}
            onPress={preview}
          />
        ) : undefined
      }
    >
      {!ready ? (
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取余额' : '账本地址无效'}
          description="请联网后手动重试，不使用离线余额。"
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
                {ready.ledger.name} · {members.length} 位成员
              </Text>
              <Text style={s.status}>{statusLabels[ready.ledger.status]}</Text>
            </View>
            <Text style={ui.caption}>账本总支出</Text>
            <Text style={ui.amount}>{yuan(ready.balance.expenseTotalCents)}</Text>
            <View style={ui.divider} />
            <View style={ui.row}>
              <View style={ui.grow}>
                <Text style={ui.caption}>待收回</Text>
                <Text style={[ui.heading, { color: colors.success }]}>
                  {yuan(receivable.toString())}
                </Text>
              </View>
              <View style={ui.grow}>
                <Text style={ui.caption}>待偿还</Text>
                <Text style={[ui.heading, { color: colors.danger }]}>
                  {yuan(payable.toString())}
                </Text>
              </View>
            </View>
          </View>
          <View style={ui.between}>
            <Text style={ui.strong}>成员明细</Text>
            <Text style={ui.caption}>＋ 应收 / − 应付</Text>
          </View>
          {members.map((member, i) => {
            const remaining = BigInt(member.remainingNetCents);
            return (
              <View key={member.memberId} style={s.member}>
                <MemberAvatar name={member.username} index={i} size={40} />
                <View style={ui.grow}>
                  <Text style={ui.strong}>{member.username}</Text>
                  <Text style={ui.caption}>
                    已付 {yuan(member.paidCents)} · 应摊 {yuan(member.sharedCents)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      ui.heading,
                      {
                        color:
                          remaining > 0n
                            ? colors.success
                            : remaining < 0n
                              ? colors.danger
                              : colors.muted,
                      },
                    ]}
                  >
                    {remaining === 0n
                      ? '已平衡'
                      : `${remaining > 0n ? '+' : '−'}${yuan((remaining > 0n ? remaining : -remaining).toString())}`}
                  </Text>
                  <Text style={ui.caption}>
                    {remaining > 0n ? '应收' : remaining < 0n ? '应付' : '无待收付'}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={s.summary}>
            <Text style={ui.caption}>
              已付 {yuan(paid.toString())} · 应摊 {yuan(shared.toString())}
            </Text>
            <Text style={[ui.strong, { color: net === 0n ? colors.success : colors.danger }]}>
              净额 {yuan(net.toString())}
            </Text>
          </View>
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
    padding: 8,
    borderRadius: 12,
  },
  member: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summary: { backgroundColor: colors.mint, borderRadius: 16, padding: 12, gap: 4 },
});
