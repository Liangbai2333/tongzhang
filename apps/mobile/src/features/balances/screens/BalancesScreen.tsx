import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { ledgersApi } from '@/features/ledgers/api';
import { netAmount, netColor, netLabel, statusLabels, yuan } from '@/features/ledgers/presentation';
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
  const loading = valid && blocksContent(query);
  const ready = valid && !loading && !query.isError && query.data;
  const preview = () =>
    router.push({ pathname: '/ledgers/[ledgerId]/settlement-preview', params: { ledgerId } });
  const members = query.data?.balance.members ?? [];
  // Receivables always equal payables, so one "still to settle" figure is enough.
  const outstanding = members.reduce(
    (sum, m) => sum + (BigInt(m.remainingNetCents) > 0n ? BigInt(m.remainingNetCents) : 0n),
    0n,
  );
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
                {ready.ledger.name} · {members.length} 位成员
              </Text>
              <Text style={s.status}>{statusLabels[ready.ledger.status]}</Text>
            </View>
            <Text style={ui.caption}>总支出</Text>
            <Text style={ui.amount}>{yuan(ready.balance.expenseTotalCents)}</Text>
            <View style={ui.divider} />
            <View style={ui.between}>
              <Text style={ui.caption}>成员之间还需转账</Text>
              <Text style={ui.strong}>
                {outstanding === 0n ? '已全部平衡' : yuan(outstanding.toString())}
              </Text>
            </View>
          </View>
          <Text style={ui.strong}>成员明细</Text>
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
                  {remaining !== 0n && (
                    <Text style={ui.caption}>{netLabel(member.remainingNetCents)}</Text>
                  )}
                  <Text style={[ui.heading, { color: netColor(member.remainingNetCents) }]}>
                    {netAmount(member.remainingNetCents)}
                  </Text>
                </View>
              </View>
            );
          })}
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
});
