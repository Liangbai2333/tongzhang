import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { RequestState } from '@/components/Feedback';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/tokens';
import { yuan } from '@/features/ledgers/presentation';
import { ReceiptImage } from '@/features/images/components/ReceiptImage';
import { expensesApi } from '../api';
import { expensesKeys } from '../query-keys';
import { categoryLabel, splitLabels } from '../presentation';
import { CategoryIcon } from '../components/ExpenseList';
import { MemberAvatar, expenseStyles } from '../components/ExpenseUI';
export default function ExpenseDetailScreen() {
  const { ledgerId, expenseId } = useLocalSearchParams<{ ledgerId: string; expenseId: string }>();
  const { user } = useAuth();
  const [receipt, setReceipt] = useState(false);
  const valid = uuidSchema.safeParse(ledgerId).success && uuidSchema.safeParse(expenseId).success;
  const query = useOnlineQuery(
    [...expensesKeys.ledger(user!.id, ledgerId), expenseId],
    () => expensesApi.getExpense({ params: { ledgerId, expenseId }, query: {}, body: undefined }),
    valid,
  );
  const loading = valid && blocksContent(query);
  const expense = query.data?.data;
  const ready = valid && !loading && !query.isError && expense;
  return (
    <Screen
      title="消费详情"
      variant="ledger"
      contentStyle={expenseStyles.content}
      onRefresh={
        valid
          ? () => {
              setReceipt(false);
              void query.refetch();
            }
          : undefined
      }
      refreshing={query.isFetching && !query.isPending}
    >
      {!ready ? (
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取消费' : '消费地址无效'}
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
          <View style={[expenseStyles.card, s.hero]}>
            <View style={ui.row}>
              <CategoryIcon category={expense.category} detail />
              <Text style={ui.strong}>
                {categoryLabel(expense.category)} · {splitLabels[expense.splitMode]}
              </Text>
            </View>
            <View style={ui.divider} />
            <Text style={ui.title}>{expense.title}</Text>
            <Text style={ui.amount}>{yuan(expense.amountCents)}</Text>
          </View>
          <View style={expenseStyles.infoCard}>
            <View style={s.info}>
              <Text style={ui.muted}>付款人</Text>
              <Text style={[ui.strong, ui.grow, s.right]}>{expense.payerName}</Text>
            </View>
            <View style={ui.divider} />
            <View style={s.info}>
              <Text style={ui.muted}>日期</Text>
              <Text style={ui.strong}>{expense.occurredOn}</Text>
            </View>
            {expense.recorderMemberId !== expense.payerMemberId && (
              <>
                <View style={ui.divider} />
                <View style={s.info}>
                  <Text style={ui.muted}>记录人</Text>
                  <Text style={[ui.body, ui.grow, s.right]}>{expense.recorderName}</Text>
                </View>
              </>
            )}
          </View>
          <Text style={ui.strong}>分摊明细（{expense.splits.length} 人）</Text>
          {expense.splits.map((split, i) => (
            <View key={split.memberId} style={s.member}>
              <MemberAvatar name={split.username} index={i} />
              <Text style={[ui.body, ui.grow]}>
                {split.username}
                {split.shares === null ? '' : ` · ${split.shares} 份`}
              </Text>
              <Text style={ui.strong}>{yuan(split.amountCents)}</Text>
            </View>
          ))}
          {(!!expense.note || !!expense.receiptImageId) && (
            <View style={expenseStyles.infoCard}>
              {!!expense.note && (
                <View style={s.info}>
                  <Text style={ui.muted}>备注</Text>
                  <Text style={[ui.body, ui.grow, s.right]}>{expense.note}</Text>
                </View>
              )}
              {!!expense.note && !!expense.receiptImageId && <View style={ui.divider} />}
              {!!expense.receiptImageId && (
                <View style={s.info}>
                  <Text style={ui.muted}>收据</Text>
                  <Button
                    compact
                    title="查看收据"
                    variant="quiet"
                    onPress={() => setReceipt(true)}
                  />
                </View>
              )}
            </View>
          )}
          <Sheet
            visible={receipt}
            title="收据图片"
            variant="members"
            onClose={() => setReceipt(false)}
          >
            {receipt && expense.receiptImageId && <ReceiptImage imageId={expense.receiptImageId} />}
          </Sheet>
        </>
      )}
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { padding: 20, gap: 6 },
  info: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  right: { textAlign: 'right' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
});
