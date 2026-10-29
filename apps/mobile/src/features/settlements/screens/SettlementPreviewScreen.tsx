import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { uuidSchema, type EndpointOutput } from '@tongzhang/contracts';
import { ledgersApi } from '@/features/ledgers/api';
import { ledgersKeys } from '@/features/ledgers/query-keys';
import { Sheet } from '@/components/Sheet';
import { ApiError } from '@/lib/api-error';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import SettlementRecordScreen from './SettlementRecordScreen';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { InlineError, RequestState, requestErrorMessage } from '@/components/Feedback';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { useAuth } from '@/providers/AuthProvider';
import { yuan } from '@/features/ledgers/presentation';
import { MemberAvatar } from '@/features/expenses/components/ExpenseUI';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { colors } from '@/theme/tokens';
import { settlementsApi } from '../api';
import { settlementsKeys } from '../query-keys';
type Ledger = EndpointOutput<'getLedger'>['data'];
type Settlement = EndpointOutput<'startSettlement'>['data']['batch'];

export default function SettlementPreviewScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  return <SettlementPage key={ledgerId} ledgerId={ledgerId} />;
}

function SettlementPage({ ledgerId }: { ledgerId: string }) {
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const [generation, setGeneration] = useState(0);
  const [started, setStarted] = useState<Settlement | null>(null);
  const ledgerQuery = useOnlineQuery(
    ledgersKeys.ledger(user!.id, ledgerId),
    () => ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
    valid,
  );
  const ledger = ledgerQuery.data?.data;
  if (!valid || blocksContent(ledgerQuery) || ledgerQuery.isError || !ledger)
    return (
      <Screen title="结算" variant="ledger">
        <RequestState
          loading={valid && blocksContent(ledgerQuery)}
          title={valid ? '暂时无法读取账本' : '账本地址无效'}
          description="请检查网络后重试。"
          error={ledgerQuery.error}
          onRetry={
            valid
              ? () => {
                  void ledgerQuery.refetch();
                }
              : undefined
          }
        />
      </Screen>
    );
  if (started || ledger.status !== 'ACTIVE')
    return <SettlementRecordScreen ledger={ledger} initial={started ?? undefined} />;
  return (
    <Preview
      key={generation}
      ledger={ledger}
      onStarted={setStarted}
      onReload={() => {
        setGeneration((value) => value + 1);
        void ledgerQuery.refetch();
      }}
    />
  );
}

function Preview({
  ledger,
  onStarted,
  onReload,
}: {
  ledger: Ledger;
  onStarted: (settlement: Settlement) => void;
  onReload: () => void;
}) {
  const ledgerId = ledger.id;
  const { user } = useAuth();
  const client = useQueryClient();
  const valid = true;
  const write = useIdempotentWrite();
  const [confirmation, setConfirmation] = useState<{ expectedVersion: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkLock = useRef(false);
  const query = useOnlineQuery(
    [...settlementsKeys.ledger(user!.id, ledgerId), 'preview'],
    () => settlementsApi.previewSettlement({ params: { ledgerId }, query: {}, body: undefined }),
    valid,
  );
  const [copying, setCopying] = useState(false);
  const locked = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = valid && blocksContent(query);
  const plan = query.data?.data;
  const ready = valid && !loading && !query.isError && plan;
  const busy = write.busy || checking;
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => busy || write.uncertain,
    );
    return () => subscription.remove();
  }, [busy, write.uncertain]);
  const blocked =
    write.error instanceof ApiError &&
    ['VERSION_CONFLICT', 'LEDGER_FROZEN', 'LEDGER_STATE_INVALID', 'FORBIDDEN'].includes(
      write.error.code,
    );
  const canFreeze = ready && ledger.creatorUserId === user!.id && !blocked;
  async function freeze() {
    if (!confirmation || !canFreeze || checking) return;
    const result = await write.submit(confirmation, (key) =>
      settlementsApi.startSettlement(
        { params: { ledgerId }, query: {}, body: confirmation },
        { idempotencyKey: key },
      ),
    );
    if (result) {
      void client.invalidateQueries({ queryKey: ['user', user!.id] });
      onStarted(result.data.batch);
    }
  }
  async function checkResult() {
    if (write.busy || checkLock.current) return;
    checkLock.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const result = await settlementsApi.getSettlement({
        params: { ledgerId },
        query: {},
        body: undefined,
      });
      onStarted(result.data);
    } catch (cause) {
      setCheckError(
        cause instanceof ApiError && cause.code === 'SETTLEMENT_NOT_FOUND'
          ? '还没有查到结算记录，可以重试提交。'
          : requestErrorMessage(cause),
      );
    } finally {
      checkLock.current = false;
      setChecking(false);
    }
  }
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
      setError('复制失败，请稍后重试');
    } finally {
      locked.current = false;
      setCopying(false);
    }
  }
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Screen
        backDisabled={busy || write.uncertain}
        title="结算预览"
        variant="ledger"
        contentStyle={{ paddingTop: 8, gap: 16 }}
        onRefresh={!busy && !write.uncertain && !confirmation ? onReload : undefined}
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
                disabled={busy}
                onPress={() => {
                  void copy();
                }}
              />
              {canFreeze && !confirmation && (
                <Button
                  title="正式发起结算"
                  icon={<FigmaAsset asset={expenseAssets.preview} />}
                  // The plan stays visible while refreshing; confirm only the latest version.
                  disabled={busy || query.isFetching}
                  onPress={() => setConfirmation({ expectedVersion: plan.ledgerVersion })}
                />
              )}
              {blocked && (
                <>
                  <InlineError message="账本内容有变化，请刷新后再结算。" />
                  <Button title="刷新预览" onPress={onReload} />
                </>
              )}
              {ledger.creatorUserId !== user!.id && (
                <Text style={[ui.caption, { textAlign: 'center' }]}>
                  只有账本创建者可以发起结算。
                </Text>
              )}
            </>
          ) : undefined
        }
      >
        {!ready ? (
          <RequestState
            loading={loading}
            title={valid ? '暂时无法读取结算预览' : '账本地址无效'}
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
              <Text style={ui.caption}>待转账总额</Text>
              <Text style={[ui.amount, { fontSize: 28, lineHeight: 41 }]}>
                {yuan(plan.transferTotalCents)}
              </Text>
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
                <Text style={ui.heading}>无需转账</Text>
                <Text style={ui.muted}>大家的收支已经平衡。</Text>
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
                        {payer?.username ?? '未知成员'}
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
                        {payee?.username ?? '未知成员'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={s.notice}>
              <FigmaAsset asset={expenseAssets.info} />
              <View style={ui.grow}>
                <Text style={ui.strong}>发起结算后账本将冻结</Text>
                <Text style={ui.caption}>不能再记账或加入成员。转账请在应用外完成。</Text>
              </View>
            </View>
          </>
        )}
      </Screen>
      <Sheet
        visible={confirmation !== null}
        title="冻结账单，开始结算？"
        hideClose
        variant="join"
        onClose={() => {
          if (!busy && !write.uncertain) setConfirmation(null);
        }}
      >
        <View style={s.summary}>
          <Text style={ui.strong}>
            {ledger.name} · 总支出 {plan ? yuan(plan.expenseTotalCents) : ''}
          </Text>
          <Text style={ui.caption}>
            需要 {plan?.transferCount} 笔转账，共 {plan ? yuan(plan.transferTotalCents) : ''}
          </Text>
        </View>
        <Text style={[ui.muted, { fontSize: 13, lineHeight: 19 }]}>
          {plan?.transferCount === 0
            ? '无需转账，确认后账本将直接结清，且无法撤销。'
            : '冻结后不能再记账或加入成员，且无法撤销。'}
        </Text>
        <InlineError message={write.error ? requestErrorMessage(write.error) : null} />
        <InlineError message={checkError} />
        {write.uncertain && (
          <Text style={ui.body}>
            网络中断，结果未确认。重试不会重复结算，也可以先查询结算记录。
          </Text>
        )}
        {blocked ? (
          <Button title="刷新预览" onPress={onReload} />
        ) : (
          <Button
            compact
            title={write.uncertain ? '重试' : '确认冻结并结算'}
            loading={write.busy}
            disabled={checking}
            onPress={() => {
              void freeze();
            }}
          />
        )}
        {write.uncertain && (
          <Button
            title="查询结算记录"
            variant="secondary"
            loading={checking}
            disabled={write.busy}
            onPress={() => {
              void checkResult();
            }}
          />
        )}
        <Button
          title="返回检查"
          variant="outlined"
          compact
          disabled={busy || write.uncertain}
          onPress={() => setConfirmation(null)}
        />
      </Sheet>
    </>
  );
}
const s = StyleSheet.create({
  summary: { backgroundColor: colors.background, borderRadius: 12, padding: 16, gap: 8 },
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
