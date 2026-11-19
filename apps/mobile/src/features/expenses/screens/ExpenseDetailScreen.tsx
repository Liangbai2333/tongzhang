import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { InlineError, RequestState, requestErrorMessage } from '@/components/Feedback';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/tokens';
import { ledgersApi } from '@/features/ledgers/api';
import { ledgersKeys } from '@/features/ledgers/query-keys';
import { yuan } from '@/features/ledgers/presentation';
import { ReceiptImage } from '@/features/images/components/ReceiptImage';
import { expensesApi } from '../api';
import { expensesKeys } from '../query-keys';
import { categoryLabel, expenseWriteConflict, splitLabels } from '../presentation';
import { CategoryIcon } from '../components/ExpenseList';
import { ExpenseForm } from '../components/ExpenseForm';
import { MemberAvatar, expenseStyles } from '../components/ExpenseUI';

export default function ExpenseDetailScreen() {
  const { ledgerId, expenseId } = useLocalSearchParams<{ ledgerId: string; expenseId: string }>();
  const { user } = useAuth();
  const client = useQueryClient();
  const [receipt, setReceipt] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteWrite = useIdempotentWrite();
  const valid = uuidSchema.safeParse(ledgerId).success && uuidSchema.safeParse(expenseId).success;
  const query = useOnlineQuery(
    [...expensesKeys.ledger(user!.id, ledgerId), expenseId],
    () => expensesApi.getExpense({ params: { ledgerId, expenseId }, query: {}, body: undefined }),
    valid,
  );
  const ledgerQuery = useOnlineQuery(
    ledgersKeys.ledger(user!.id, ledgerId),
    () => ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
    valid && editing,
  );
  const loading = valid && blocksContent(query);
  const expense = query.data?.data;
  const ready = valid && !loading && !query.isError && expense;
  const deleteConflict = expenseWriteConflict(deleteWrite.error);

  function closeDeleteSheet() {
    if (deleteWrite.busy || deleteWrite.uncertain) return;
    deleteWrite.reset();
    setConfirmDelete(false);
  }

  async function confirmSoftDelete() {
    if (!expense || deleteWrite.busy) return;
    const result = await deleteWrite.submit(
      { ledgerId, expenseId, version: expense.version },
      (key) =>
        expensesApi.deleteExpense(
          { params: { ledgerId, expenseId }, query: { version: expense.version }, body: undefined },
          { idempotencyKey: key },
        ),
    );
    if (result) {
      setConfirmDelete(false);
      void client.invalidateQueries({ queryKey: ['user', user!.id] });
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/ledgers/[ledgerId]', params: { ledgerId } });
    }
  }

  if (ready && editing) {
    const ledgerLoading = blocksContent(ledgerQuery);
    const ledger = ledgerQuery.data?.data;
    if (ledgerLoading || ledgerQuery.isError || !ledger) {
      return (
        <Screen title="编辑消费" variant="ledger" onBack={() => setEditing(false)}>
          <RequestState
            loading={ledgerLoading}
            title="暂时无法读取账本成员"
            description="需要在线核验成员和账本状态。"
            error={ledgerQuery.error}
            onRetry={() => {
              void ledgerQuery.refetch();
            }}
          />
        </Screen>
      );
    }
    if (ledger.status !== 'ACTIVE') {
      return (
        <Screen title="编辑消费" variant="ledger" onBack={() => setEditing(false)}>
          <View style={expenseStyles.card}>
            <Text style={ui.heading}>账本已冻结</Text>
            <Text style={ui.body}>账本已进入结算或结清状态，无法继续编辑消费。</Text>
            <Button
              compact
              title="返回消费详情"
              variant="secondary"
              onPress={() => {
                setEditing(false);
                void client.invalidateQueries({ queryKey: ['user', user!.id] });
                void query.refetch();
              }}
            />
          </View>
        </Screen>
      );
    }
    return (
      <ExpenseForm
        key={`${expense.id}-${expense.version}`}
        ledger={ledger}
        userId={user!.id}
        expense={expense}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          client.setQueryData([...expensesKeys.ledger(user!.id, ledgerId), expenseId], {
            data: saved,
          });
          setEditing(false);
          void query.refetch();
        }}
        onConflictRefresh={() => {
          setEditing(false);
          void client.invalidateQueries({ queryKey: ledgersKeys.ledger(user!.id, ledgerId) });
          void query.refetch();
        }}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !deleteWrite.busy && !deleteWrite.uncertain }} />
      <Screen
        title="消费详情"
        variant="ledger"
        contentStyle={expenseStyles.content}
        backDisabled={deleteWrite.busy || deleteWrite.uncertain}
        onRefresh={
          valid && !deleteWrite.busy
            ? () => {
                setReceipt(false);
                void query.refetch();
              }
            : undefined
        }
        refreshing={query.isRefetching}
        footer={
          ready && expense.canEdit ? (
            <View style={s.footerActions}>
              <Button
                style={ui.grow}
                title="编辑消费"
                variant="secondary"
                disabled={deleteWrite.busy}
                onPress={() => {
                  setReceipt(false);
                  setEditing(true);
                }}
              />
              <Button
                style={ui.grow}
                title="删除消费"
                variant="danger"
                disabled={deleteWrite.busy}
                onPress={() => {
                  deleteWrite.reset();
                  setConfirmDelete(true);
                }}
              />
            </View>
          ) : undefined
        }
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
              {receipt && expense.receiptImageId && (
                <ReceiptImage imageId={expense.receiptImageId} />
              )}
            </Sheet>
            <Sheet
              visible={confirmDelete}
              title="确认删除消费？"
              variant="members"
              onClose={closeDeleteSheet}
            >
              <View style={s.deleteSummary}>
                <Text style={ui.strong}>{expense.title}</Text>
                <Text style={ui.muted}>
                  {yuan(expense.amountCents)} · {expense.occurredOn}
                </Text>
              </View>
              <Text style={ui.body}>
                删除后，该笔消费将不再计入账本总支出、成员余额与统计图表。
              </Text>
              <InlineError
                message={
                  deleteConflict
                    ? deleteConflict.message
                    : deleteWrite.error
                      ? requestErrorMessage(deleteWrite.error)
                      : null
                }
              />
              {deleteWrite.uncertain && (
                <Text style={ui.caption}>网络中断，删除结果未确认。重试不会重复提交。</Text>
              )}
              {deleteConflict ? (
                <Button
                  compact
                  title={deleteConflict.actionLabel}
                  variant="secondary"
                  disabled={deleteWrite.busy}
                  onPress={() => {
                    deleteWrite.reset();
                    setConfirmDelete(false);
                    void client.invalidateQueries({ queryKey: ['user', user!.id] });
                    void query.refetch();
                  }}
                />
              ) : (
                <Button
                  compact
                  title={deleteWrite.uncertain ? '重试删除' : '确认删除'}
                  variant="danger"
                  loading={deleteWrite.busy}
                  onPress={() => {
                    void confirmSoftDelete();
                  }}
                />
              )}
              <Button
                compact
                title={deleteWrite.uncertain ? '回到账本查看' : '取消'}
                variant="quiet"
                disabled={deleteWrite.busy}
                onPress={() => {
                  if (deleteWrite.uncertain) {
                    setConfirmDelete(false);
                    router.replace({ pathname: '/ledgers/[ledgerId]', params: { ledgerId } });
                  } else closeDeleteSheet();
                }}
              />
            </Sheet>
          </>
        )}
      </Screen>
    </>
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
  footerActions: { flexDirection: 'row', gap: 10 },
  deleteSummary: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    gap: 4,
  },
});
