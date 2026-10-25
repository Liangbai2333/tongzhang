import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { colors } from '@/theme/tokens';
import { ExpenseList } from '@/features/expenses/components/ExpenseList';
import { expenseAssets } from '@/icons/expense-assets';
import { LedgerMembersSheet } from '../components/LedgerMembersSheet';
import { RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useOnlineQuery } from '@/lib/use-online-query';
import { ledgersApi } from '../api';
import { ledgersKeys } from '../query-keys';
import { EmptyLedger } from '../components/EmptyLedger';
import { statusLabels, yuan } from '../presentation';

export default function LedgerDetailScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    ledgersKeys.ledger(user!.id, ledgerId),
    () => ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
    valid,
  );
  const [members, setMembers] = useState(false);
  const ledger = query.data?.data;
  const loading = valid && (query.isPending || query.isFetching);
  const ready = valid && !loading && !query.isError && ledger;
  const empty = ready && ledger.status === 'ACTIVE' && ledger.expenseTotalCents === '0';
  const invite = () =>
    router.push({ pathname: '/ledgers/[ledgerId]/invitation', params: { ledgerId } });
  return (
    <Screen
      title={ready ? ledger.name : '账本详情'}
      variant="ledger"
      contentStyle={{ paddingTop: 16 }}
      onRefresh={
        valid
          ? () => {
              setMembers(false);
              void query.refetch();
            }
          : undefined
      }
      refreshing={query.isFetching && !query.isPending}
      action={
        ready ? (
          <Touch
            accessibilityLabel={`查看成员 · ${ledger.memberCount} / 12`}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setMembers(true)}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0px 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <FigmaAsset asset={ledgerAssets.more} />
            </View>
          </Touch>
        ) : undefined
      }
      footer={
        ready && ledger.status === 'ACTIVE' ? (
          <Button
            title={empty ? '记第一笔' : '记一笔'}
            icon={<FigmaAsset asset={ledgerAssets.entryAdd} />}
            onPress={() =>
              router.push({ pathname: '/ledgers/[ledgerId]/expenses/create', params: { ledgerId } })
            }
          />
        ) : undefined
      }
    >
      {!ready ? (
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取账本' : '账本地址无效'}
          description="请核对账本地址或返回列表。"
          error={query.error}
          onRetry={
            valid
              ? () => {
                  void query.refetch();
                }
              : undefined
          }
        >
          <Button
            title="返回账本列表"
            variant="secondary"
            onPress={() => router.replace('/ledgers')}
          />
        </RequestState>
      ) : (
        <>
          {empty ? (
            <EmptyLedger
              totalCents={ledger.expenseTotalCents}
              onInvite={ledger.creatorUserId === user!.id ? invite : undefined}
            />
          ) : (
            <>
              <View style={ui.between}>
                <Touch
                  accessibilityLabel="打开账本成员"
                  style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    paddingHorizontal: 16,
                    minHeight: 44,
                    borderRadius: 22,
                    justifyContent: 'center',
                  }}
                  onPress={() => setMembers(true)}
                >
                  <View style={ui.between}>
                    <View style={ui.row}>
                      <FigmaAsset asset={expenseAssets.members} />
                      <Text style={ui.body}>成员 · {ledger.memberCount} 人</Text>
                    </View>
                    <FigmaAsset asset={expenseAssets.memberChevron} />
                  </View>
                </Touch>
                <Text style={ui.caption}>{statusLabels[ledger.status]}</Text>
              </View>
              <View
                style={[
                  ui.card,
                  { borderWidth: 1, borderColor: colors.border, padding: 20, gap: 16 },
                ]}
              >
                <Text style={ui.caption}>总支出 · 人民币</Text>
                <Text style={ui.amount}>{yuan(ledger.expenseTotalCents)}</Text>
                <View style={ui.divider} />
                <View style={[ui.row, { alignItems: 'flex-start' }]}>
                  <View style={ui.grow}>
                    <Text style={ui.caption}>我的垫付</Text>
                    <Text style={ui.strong}>{yuan(ledger.myPaidCents)}</Text>
                  </View>
                  <View style={ui.grow}>
                    <Text style={ui.caption}>当前应摊</Text>
                    <Text style={ui.strong}>{yuan(ledger.mySharedCents)}</Text>
                  </View>
                  <View style={ui.grow}>
                    <Text style={ui.caption}>剩余净额</Text>
                    <Text
                      style={[
                        ui.strong,
                        {
                          color:
                            BigInt(ledger.myRemainingNetCents) > 0n
                              ? colors.success
                              : BigInt(ledger.myRemainingNetCents) < 0n
                                ? colors.danger
                                : colors.muted,
                        },
                      ]}
                    >
                      {yuan(ledger.myRemainingNetCents)}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              compact
              labelStyle={{ fontSize: 14 }}
              title="余额明细"
              variant="secondary"
              icon={<FigmaAsset asset={expenseAssets.balance} />}
              onPress={() =>
                router.push({ pathname: '/ledgers/[ledgerId]/balances', params: { ledgerId } })
              }
            />
            <Button
              compact
              labelStyle={{ fontSize: 14 }}
              title="支出统计"
              icon={<FigmaAsset asset={expenseAssets.chart} />}
              variant="secondary"
              disabled
              onPress={() => {}}
            />
            {ledger.status === 'ACTIVE' && (
              <Button
                compact
                labelStyle={{ fontSize: 14 }}
                title="结算预览"
                variant="secondary"
                icon={<FigmaAsset asset={expenseAssets.settle} />}
                onPress={() =>
                  router.push({
                    pathname: '/ledgers/[ledgerId]/settlement-preview',
                    params: { ledgerId },
                  })
                }
              />
            )}
          </View>
          <Text style={ui.caption}>支出统计暂未开放。</Text>
          {!empty && <ExpenseList ledger={ledger} userId={user!.id} />}
          {!empty && (
            <Button
              title="刷新账本"
              variant="quiet"
              onPress={() => {
                void query.refetch();
              }}
            />
          )}
          <LedgerMembersSheet
            visible={members}
            ledger={ledger}
            userId={user!.id}
            onClose={() => setMembers(false)}
            onInvite={invite}
            onRefresh={() => {
              setMembers(false);
              void query.refetch();
            }}
          />
        </>
      )}
    </Screen>
  );
}
