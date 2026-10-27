import { SettledTransferCard } from '../components/SettledTransferCard';
import { completionAssets } from '../completion-assets';
import { SettledSummary } from '../components/SettledSummary';
import { router, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SettlementActionSheet } from '../components/SettlementActionSheet';
import { ArchiveLedgerSheet } from '@/features/ledgers/components/ArchiveLedgerSheet';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { EndpointOutput } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Touch } from '@/components/Touch';
import { Button } from '@/components/Button';
import { InlineError, RequestState } from '@/components/Feedback';
import { useOnlineQuery } from '@/lib/use-online-query';
import { useAuth } from '@/providers/AuthProvider';
import { ledgersApi } from '@/features/ledgers/api';
import { yuan } from '@/features/ledgers/presentation';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { settlementsApi } from '../api';
import { settlementsKeys } from '../query-keys';
import { settlementAssets } from '../assets';

type Settlement = EndpointOutput<'startSettlement'>['data']['batch'];

/** Read the saved batch, never recompute a preview for a frozen ledger. */
export default function SettlementRecordScreen({
  ledger,
  initial,
}: {
  ledger: EndpointOutput<'getLedger'>['data'];
  initial?: Settlement;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [action, setAction] = useState<
    Settlement['transfers'][number] | 'settle' | 'archive' | null
  >(null);
  const query = useOnlineQuery(
    [...settlementsKeys.ledger(user!.id, ledger.id), 'record'],
    async () => {
      const input = { params: { ledgerId: ledger.id }, query: {}, body: undefined };
      const [settlement, currentLedger] = await Promise.all([
        settlementsApi.getSettlement(input),
        ledgersApi.getLedger(input),
      ]);
      return {
        settlement: settlement.data,
        ledger: currentLedger.data,
        members: currentLedger.data.members,
      };
    },
  );
  const [copying, setCopying] = useState(false);
  const copyLock = useRef(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loading = query.isPending || query.isFetching;
  const record =
    !query.isError && !loading
      ? query.data?.settlement
      : !query.isError && query.isPending
        ? initial
        : undefined;
  const name = (id: string) =>
    (query.data?.members ?? ledger.members).find((member) => member.id === id)?.username ?? id;
  const settled = record?.ledgerStatus === 'SETTLED';
  const currentLedger = query.data?.ledger ?? ledger;
  const creator = currentLedger.creatorUserId === user!.id;
  const canSettle =
    record?.ledgerStatus === 'SETTLING' &&
    creator &&
    record.progress.paidCount === record.progress.totalCount &&
    record.progress.remainingCents === '0' &&
    currentLedger.members.every((member) => member.remainingNetCents === '0');
  const refresh = () => {
    if (action) return;
    setNotice(null);
    setCopyError(null);
    void query.refetch();
  };
  const line = (transfer: Settlement['transfers'][number]) =>
    `${name(transfer.payerMemberId)} → ${name(transfer.payeeMemberId)} ${yuan(transfer.amountCents)} · ${transfer.status === 'PAID' ? '已登记' : '待登记'}`;
  async function copy(transfer?: Settlement['transfers'][number]) {
    if (!record || copyLock.current || loading) return;
    copyLock.current = true;
    setCopying(true);
    setCopyError(null);
    setNotice(null);
    try {
      const text = transfer
        ? line(transfer)
        : [
            `同账正式结算 · ${ledger.name} · 批次 ${record.id}`,
            `账本总支出 ${yuan(record.expenseTotalCents)}，方案转账 ${yuan(record.transferTotalCents)}，共 ${record.transferCount} 笔`,
            ...record.transfers.map(line),
            '转账在应用外完成，登记不代表应用已验证到账。',
          ].join('\n');
      if (!(await Clipboard.setStringAsync(text))) throw new Error('copy failed');
      setNotice(transfer ? '转账信息已复制' : '结算方案已复制');
    } catch {
      setCopyError('复制失败，请稍后手动重试');
    } finally {
      copyLock.current = false;
      setCopying(false);
    }
  }
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: action === null }} />
      <Screen
        backDisabled={action !== null}
        title={`${ledger.name} · ${record?.ledgerStatus === 'SETTLED' ? '已结清' : '结算中'}`}
        variant="ledger"
        onRefresh={action === null ? refresh : undefined}
        refreshing={query.isFetching && !query.isPending}
        contentStyle={{ paddingTop: 8, gap: settled ? 12 : 16 }}
        footer={
          record && !loading ? (
            <>
              <InlineError message={copyError} />
              {notice && (
                <Text accessibilityLiveRegion="polite" style={ui.caption}>
                  {notice}
                </Text>
              )}
              {!settled && (
                <Button
                  title="复制完整方案"
                  variant="secondary"
                  loading={copying}
                  onPress={() => {
                    void copy();
                  }}
                />
              )}
              {record.ledgerStatus === 'SETTLING' && (
                <>
                  {creator ? (
                    <Button
                      title="确认整本结清"
                      disabled={!canSettle || action !== null}
                      onPress={() => setAction('settle')}
                    />
                  ) : (
                    <Text style={ui.caption}>全部登记后，由账本创建者确认结清。</Text>
                  )}
                  {creator && !canSettle && (
                    <Text style={ui.caption}>全部转账登记且每位成员剩余净额为零后才能结清。</Text>
                  )}
                </>
              )}
              {record.ledgerStatus === 'SETTLED' && !currentLedger.archivedAt && (
                <Button
                  title="归档账本"
                  icon={<FigmaAsset asset={completionAssets.archiveButton} />}
                  onPress={() => setAction('archive')}
                />
              )}
              {currentLedger.archivedAt && (
                <Text style={ui.caption}>已个人归档 · 历史记录只读</Text>
              )}
            </>
          ) : undefined
        }
      >
        {!record ? (
          <>
            {initial && (
              <Text style={ui.caption}>已确认正式批次：{initial.id}。最新进度以在线查询为准。</Text>
            )}
            <RequestState
              loading={loading}
              title="暂时无法读取正式记录"
              description="请手动重试在线查询，不会重复提交结算。"
              error={query.error}
              onRetry={refresh}
            />
          </>
        ) : (
          <>
            {settled ? (
              <SettledSummary
                total={record.expenseTotalCents}
                transfers={record.transferCount}
                members={currentLedger.memberCount}
              />
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={s.frozen}>
                  {record.ledgerStatus === 'SETTLED' ? '账单已结清' : '账单已冻结'}
                </Text>
                <Text style={ui.title}>
                  {record.ledgerStatus === 'SETTLED'
                    ? '全部已结清'
                    : record.progress.paidCount === record.progress.totalCount
                      ? '全部转账已登记'
                      : '待完成转账'}
                </Text>
                <View style={ui.between}>
                  <Text style={ui.muted}>
                    {record.progress.paidCount} / {record.progress.totalCount} 笔已登记
                  </Text>
                  <Text style={s.remaining}>待登记 {yuan(record.progress.remainingCents)}</Text>
                </View>
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: record.progress.totalCount || 1,
                    now: record.progress.totalCount ? record.progress.paidCount : 1,
                  }}
                  style={s.track}
                >
                  <View
                    style={[
                      s.fill,
                      {
                        width: `${record.progress.totalCount ? (record.progress.paidCount / record.progress.totalCount) * 100 : 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
            {!settled && <View style={ui.divider} />}
            <View style={ui.between}>
              <Text accessibilityRole="header" style={settled ? ui.strong : ui.caption}>
                {settled ? '结算记录' : '收付款记录'}
              </Text>
              {settled && <Text style={ui.caption}>{record.transferCount} 笔</Text>}
            </View>
            {record.transfers.length === 0 && (
              <View style={ui.card}>
                <Text style={ui.body}>无需转账，账本已直接结清。</Text>
              </View>
            )}
            {record.transfers.map((transfer) =>
              settled ? (
                <SettledTransferCard key={transfer.id} transfer={transfer} name={name} />
              ) : (
                <View key={transfer.id} style={s.transfer}>
                  <View style={ui.between}>
                    <Text style={[s.badge, transfer.status === 'PAID' && s.paid]}>
                      {transfer.status === 'PAID' ? '已登记' : '待登记'}
                    </Text>
                    <Text style={s.amount}>{yuan(transfer.amountCents)}</Text>
                  </View>
                  <View style={ui.row}>
                    <View
                      accessibilityLabel={`付款人：${name(transfer.payerMemberId)}`}
                      style={s.person}
                    >
                      <View style={[s.avatar, { backgroundColor: colors.peach }]}>
                        <Text style={s.avatarText}>
                          {Array.from(name(transfer.payerMemberId)).at(-1)}
                        </Text>
                      </View>
                      <Text style={s.name}>{name(transfer.payerMemberId)}</Text>
                    </View>
                    <View style={s.arrow}>
                      <FigmaAsset
                        asset={settlementAssets.arrow}
                        style={{ transform: [{ rotate: '180deg' }, { scaleY: -1 }] }}
                      />
                    </View>
                    <View
                      accessibilityLabel={`收款人：${name(transfer.payeeMemberId)}`}
                      style={s.person}
                    >
                      <View style={[s.avatar, { backgroundColor: colors.mint }]}>
                        <Text style={s.avatarText}>
                          {Array.from(name(transfer.payeeMemberId)).at(-1)}
                        </Text>
                      </View>
                      <Text style={s.name}>{name(transfer.payeeMemberId)}</Text>
                    </View>
                  </View>
                  <View style={[ui.row, { flexWrap: 'wrap', gap: 4 }]}>
                    {record.ledgerStatus === 'SETTLING' &&
                      transfer.status === 'PENDING' &&
                      (creator || transfer.payerMemberId === currentLedger.myMemberId) && (
                        <Button
                          compact
                          title="登记已还"
                          variant="secondary"
                          icon={<FigmaAsset asset={settlementAssets.check} />}
                          disabled={action !== null}
                          onPress={() => setAction(transfer)}
                          style={{ paddingHorizontal: 8 }}
                        />
                      )}
                    <Touch
                      accessibilityRole="button"
                      accessibilityLabel={`复制第 ${transfer.sequence} 笔转账信息`}
                      disabled={copying || loading}
                      style={{ flexGrow: 1, minHeight: 44, justifyContent: 'center' }}
                      onPress={() => {
                        void copy(transfer);
                      }}
                    >
                      <View style={[ui.row, { gap: 6, justifyContent: 'center' }]}>
                        <FigmaAsset asset={settlementAssets.copy} />
                        <Text style={ui.caption}>复制转账信息</Text>
                      </View>
                    </Touch>
                  </View>
                  {transfer.registeredAt && (
                    <Text style={ui.caption}>
                      登记时间 {new Date(transfer.registeredAt).toLocaleString()}
                    </Text>
                  )}
                  {transfer.registeredByMemberId && (
                    <Text style={ui.caption}>登记人：{name(transfer.registeredByMemberId)}</Text>
                  )}
                  {transfer.registrationNote && (
                    <Text style={ui.body}>备注：{transfer.registrationNote}</Text>
                  )}
                </View>
              ),
            )}
            {settled && (
              <View
                style={[
                  ui.card,
                  { padding: 0, gap: 0, borderWidth: 1, borderColor: colors.border },
                ]}
              >
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel="历史账单"
                  onPress={() =>
                    router.push({
                      pathname: '/ledgers/[ledgerId]',
                      params: { ledgerId: ledger.id },
                    })
                  }
                  style={{
                    minHeight: 52,
                    justifyContent: 'center',
                    paddingHorizontal: 20,
                  }}
                >
                  <View style={[ui.row, { gap: 10 }]}>
                    <View style={s.iconTile}>
                      <FigmaAsset asset={completionAssets.ledger} />
                    </View>
                    <Text style={[ui.strong, ui.grow]}>历史账单</Text>
                    <FigmaAsset asset={completionAssets.chevron} />
                  </View>
                </Touch>
                <View style={ui.divider} />
                <View style={[ui.row, { paddingHorizontal: 20, paddingVertical: 8, gap: 10 }]}>
                  <View style={s.iconTile}>
                    <FigmaAsset asset={completionAssets.archive} />
                  </View>
                  <Text style={[ui.caption, ui.grow]}>
                    账单与结算记录仅供查看，个人归档不影响其他成员。
                  </Text>
                </View>
              </View>
            )}
            {!settled && (
              <View style={s.notice}>
                <FigmaAsset asset={settlementAssets.info} />
                <View style={ui.grow}>
                  <Text style={[ui.strong, { color: colors.warning, fontSize: 13 }]}>
                    在应用外完成转账
                  </Text>
                  <Text style={ui.caption}>
                    登记已还仅记录转账状态，请自行核实到账，应用不验证到账情况。
                  </Text>
                </View>
              </View>
            )}
            <View style={ui.card}>
              <Text style={ui.strong}>正式批次</Text>
              <Text selectable style={ui.caption}>
                {record.id}
              </Text>
              <Text style={ui.caption}>
                冻结前版本 {record.sourceVersion} · {record.algorithmVersion}
              </Text>
              <Text style={ui.caption}>创建时间 {new Date(record.createdAt).toLocaleString()}</Text>
              <Text style={ui.caption}>
                消费总额 {yuan(record.expenseTotalCents)} · 转账共 {record.transferCount} 笔，合计{' '}
                {yuan(record.transferTotalCents)}
              </Text>
            </View>
            {settled && (
              <Button
                title="复制完整方案"
                variant="secondary"
                loading={copying}
                onPress={() => {
                  void copy();
                }}
              />
            )}
            <Button title="刷新正式记录" variant="secondary" onPress={refresh} />
          </>
        )}
      </Screen>
      {action !== null && action !== 'archive' && (
        <SettlementActionSheet
          ledgerId={ledger.id}
          ledgerName={ledger.name}
          transferCount={record?.transferCount ?? 0}
          transfer={action === 'settle' ? null : action}
          name={name}
          onCancel={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void client.invalidateQueries({ queryKey: ['user', user!.id] });
            void query.refetch();
          }}
        />
      )}
      {action === 'archive' && (
        <ArchiveLedgerSheet
          ledger={currentLedger}
          userId={user!.id}
          onCancel={() => setAction(null)}
        />
      )}
    </>
  );
}
const s = StyleSheet.create({
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frozen: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  remaining: {
    backgroundColor: colors.primarySoft,
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary },
  transfer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  badge: {
    backgroundColor: colors.peach,
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paid: { backgroundColor: colors.mint, color: colors.success },
  amount: { color: colors.text, fontSize: 20, lineHeight: 29, fontWeight: '700', flexShrink: 1 },
  person: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    minWidth: 0,
    flexWrap: 'wrap',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: colors.text },
  name: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700', flexShrink: 1 },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    gap: 8,
  },
});
