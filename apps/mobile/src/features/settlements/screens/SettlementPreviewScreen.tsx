import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { InlineError, RequestState } from '@/components/Feedback';
import { useOnlineQuery } from '@/lib/use-online-query';
import { useAuth } from '@/providers/AuthProvider';
import { yuan } from '@/features/ledgers/presentation';
import { MemberAvatar } from '@/features/expenses/components/ExpenseUI';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { colors } from '@/theme/tokens';
import { settlementsApi } from '../api';
import { settlementsKeys } from '../query-keys';
export default function SettlementPreviewScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    [...settlementsKeys.ledger(user!.id, ledgerId), 'preview'],
    () => settlementsApi.previewSettlement({ params: { ledgerId }, query: {}, body: undefined }),
    valid,
  );
  const [copying, setCopying] = useState(false);
  const locked = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = valid && (query.isPending || query.isFetching);
  const plan = query.data?.data;
  const ready = valid && !loading && !query.isError && plan;
  const longNames = (plan?.members ?? []).some((m) => Array.from(m.username).length > 10);
  const member = (id: string) => plan?.members.find((m) => m.memberId === id);
  async function copy() {
    if (!ready || locked.current) return;
    locked.current = true;
    setCopying(true);
    setNotice(null);
    setError(null);
    try {
      const text = [
        `同账结算预览 · 版本 ${plan.ledgerVersion}`,
        `账本总支出 ${yuan(plan.expenseTotalCents)}，待转账 ${yuan(plan.transferTotalCents)}，共 ${plan.transferCount} 笔`,
        ...plan.transfers.map(
          (t) =>
            `${member(t.payerMemberId)?.username ?? t.payerMemberId} → ${member(t.payeeMemberId)?.username ?? t.payeeMemberId} ${yuan(t.amountCents)}`,
        ),
        '仅为预览，未冻结账本，未登记任何转账。',
      ].join('\n');
      if (!(await Clipboard.setStringAsync(text))) throw new Error('copy failed');
      setNotice('结算方案已复制');
    } catch {
      setError('复制失败，请稍后手动重试');
    } finally {
      locked.current = false;
      setCopying(false);
    }
  }
  return (
    <Screen
      title="结算预览"
      variant="ledger"
      contentStyle={{ paddingTop: 8, gap: 16 }}
      onRefresh={
        valid
          ? () => {
              setNotice(null);
              setError(null);
              void query.refetch();
            }
          : undefined
      }
      refreshing={query.isFetching && !query.isPending}
      footer={
        ready ? (
          <>
            <InlineError message={error} />
            {notice && (
              <Text accessibilityLiveRegion="polite" style={ui.caption}>
                {notice}
              </Text>
            )}
            <Button
              title="复制完整方案"
              variant="secondary"
              loading={copying}
              onPress={() => {
                void copy();
              }}
            />
            <Text style={[ui.caption, { textAlign: 'center' }]}>
              结算进度与还款登记尚未开放，本页仅预览，不冻结账本。
            </Text>
          </>
        ) : undefined
      }
    >
      {!ready ? (
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取结算预览' : '账本地址无效'}
          description="仅进行中账本可在线预览，请手动刷新核对。"
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
            <Text style={ui.caption}>待转账总额</Text>
            <Text style={ui.amount}>{yuan(plan.transferTotalCents)}</Text>
            <View style={ui.row}>
              <View style={ui.grow}>
                <Text style={ui.caption}>账本总支出</Text>
                <Text style={ui.heading}>{yuan(plan.expenseTotalCents)}</Text>
              </View>
              <View style={ui.grow}>
                <Text style={ui.caption}>转账笔数</Text>
                <Text style={ui.heading}>{plan.transferCount} 笔</Text>
              </View>
            </View>
          </View>
          <Text style={ui.strong}>转账明细</Text>
          {plan.transfers.length === 0 && (
            <View style={s.hero}>
              <Text style={ui.heading}>当前无需转账</Text>
              <Text style={ui.muted}>当前成员净额已平衡。预览不会改变账本状态。</Text>
            </View>
          )}
          {plan.transfers.map((t) => {
            const payer = member(t.payerMemberId);
            const payee = member(t.payeeMemberId);
            return (
              <View key={t.sequence} style={s.transfer}>
                <View
                  style={[
                    ui.row,
                    ui.grow,
                    { gap: 8 },
                    longNames && { flexDirection: 'column', alignItems: 'center' },
                  ]}
                >
                  <MemberAvatar
                    name={payer?.username ?? '?'}
                    index={Math.max(
                      0,
                      plan.members.findIndex((m) => m.memberId === t.payerMemberId),
                    )}
                    size={40}
                  />
                  <View style={longNames ? { alignItems: 'center', width: '100%' } : ui.grow}>
                    <Text style={ui.caption}>付款人</Text>
                    <Text
                      style={[
                        ui.strong,
                        longNames && { textAlign: 'center', fontSize: 13, lineHeight: 19 },
                      ]}
                    >
                      {payer?.username ?? '请刷新核对成员'}
                    </Text>
                  </View>
                </View>
                <View style={s.amount}>
                  <Text style={s.amountText}>{yuan(t.amountCents)}</Text>
                  <FigmaAsset
                    asset={expenseAssets.arrow}
                    style={{ transform: [{ rotate: '180deg' }, { scaleY: -1 }] }}
                  />
                </View>
                <View
                  style={[
                    ui.row,
                    ui.grow,
                    { gap: 8 },
                    longNames && { flexDirection: 'column', alignItems: 'center' },
                  ]}
                >
                  <MemberAvatar
                    name={payee?.username ?? '?'}
                    index={Math.max(
                      0,
                      plan.members.findIndex((m) => m.memberId === t.payeeMemberId),
                    )}
                    size={40}
                  />
                  <View style={longNames ? { alignItems: 'center', width: '100%' } : ui.grow}>
                    <Text style={ui.caption}>收款人</Text>
                    <Text
                      style={[
                        ui.strong,
                        longNames && { textAlign: 'center', fontSize: 13, lineHeight: 19 },
                      ]}
                    >
                      {payee?.username ?? '请刷新核对成员'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={s.notice}>
            <FigmaAsset asset={expenseAssets.info} />
            <View style={ui.grow}>
              <Text style={ui.strong}>这是一份只读结算预览</Text>
              <Text style={ui.caption}>
                方案来自服务端，成员或消费变化后需重新预览。转账在应用外完成；本页不会发起支付。
              </Text>
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  transfer: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  amount: { alignItems: 'center', gap: 4 },
  amountText: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.warning,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
});
