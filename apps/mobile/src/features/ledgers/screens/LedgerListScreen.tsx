import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { blocksContent } from '@/lib/use-online-query';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { EmptyState, InlineError, RequestState, requestErrorMessage } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { colors } from '@/theme/tokens';
import { ledgersApi } from '../api';
import { ledgersKeys } from '../query-keys';
import { LedgerCover } from '../components/LedgerCover';
import { LedgerActionsMenu } from '../components/LedgerActionsMenu';
import { netColor, remaining, statusLabels, yuan } from '../presentation';

export default function LedgerListScreen() {
  const { user } = useAuth();
  const { archivedNotice, view } = useLocalSearchParams<{
    archivedNotice?: string;
    /** Set by other tabs; the list stays mounted, so later values must be followed too. */
    view?: 'archived' | 'current';
  }>();
  const [menu, setMenu] = useState(false);
  const [archived, setArchived] = useState(view === 'archived');
  useEffect(() => {
    setArchived(view === 'archived');
  }, [view]);
  const query = useInfiniteQuery({
    queryKey: [...ledgersKeys.root(user!.id), 'list', archived],
    queryFn: ({ pageParam }) =>
      ledgersApi.listLedgers({
        params: {},
        query: { archived: archived ? 'true' : 'false', limit: 20, cursor: pageParam },
        body: undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    enabled: false,
    retry: false,
    gcTime: 0,
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch, archived]),
  );
  const loading = blocksContent(query);
  const failed = query.isError && !query.isFetchNextPageError;
  const ledgers = query.data?.pages.flatMap((page) => page.data) ?? [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  return (
    <Screen
      title="同账"
      variant="ledger"
      back={false}
      contentStyle={styles.content}
      action={
        <Touch accessibilityLabel="创建或加入账本" style={styles.add} onPress={() => setMenu(true)}>
          <FigmaAsset asset={ledgerAssets.homeAdd} />
        </Touch>
      }
      tabRoot
      refreshing={query.isRefetching}
      onRefresh={() => {
        void refetch();
      }}
    >
      {archivedNotice && !archived && !loading && !failed && (
        <View style={[ui.card, { backgroundColor: colors.mint }]}>
          <Text accessibilityLiveRegion="polite" style={ui.strong}>
            账本已归档
          </Text>
          <Text style={ui.caption}>已从当前列表移出，可以在历史账本中查看。</Text>
          <Button
            compact
            title="查看历史账本"
            variant="secondary"
            onPress={() => setArchived(true)}
          />
        </View>
      )}
      <View style={styles.welcome}>
        <View style={ui.grow}>
          <Text style={styles.greeting}>
            {greeting}，{user!.username ?? '朋友'}
          </Text>
          <Text style={ui.muted}>看看还有哪些账要处理。</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{Array.from(user!.username ?? '同').at(-1)}</Text>
        </View>
      </View>
      <View style={ui.between}>
        <View style={styles.filter}>
          <Text style={ui.caption}>{archived ? '已归档账本' : '全部账本'}</Text>
        </View>
        {archived && (
          <Touch
            accessibilityLabel="返回当前账本"
            style={styles.refresh}
            disabled={query.isFetching}
            onPress={() => {
              setArchived(false);
              router.setParams({ view: 'current' });
            }}
          >
            <Text style={ui.caption}>返回当前账本</Text>
          </Touch>
        )}
      </View>
      {loading || failed ? (
        <RequestState
          loading={loading}
          title="暂时无法读取账本"
          description="请检查网络后重试。"
          error={query.error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          {ledgers.length === 0 && (
            <EmptyState
              title={archived ? '还没有已归档账本' : '还没有账本'}
              description={
                archived ? '个人归档后的账本会显示在这里。' : '点击右上角 +，创建或加入共同账本。'
              }
            />
          )}
          <View style={styles.list}>
            {ledgers.map((ledger) => (
              <Touch
                key={ledger.id}
                accessibilityLabel={`打开账本 ${ledger.name}`}
                style={styles.card}
                onPress={() =>
                  router.push({ pathname: '/ledgers/[ledgerId]', params: { ledgerId: ledger.id } })
                }
              >
                <View style={styles.cardContent}>
                  <View style={ui.between}>
                    <View style={[styles.identity, ui.grow]}>
                      <LedgerCover imageId={ledger.coverImageId} coverKey={ledger.coverKey} />
                      <View style={ui.grow}>
                        <Text style={ui.body}>{ledger.name}</Text>
                        <Text style={ui.caption}>{ledger.memberCount} 位成员</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        ledger.status === 'SETTLING' && styles.settling,
                        ledger.status === 'SETTLED' && styles.settled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          ledger.status === 'SETTLING' && styles.warningText,
                          ledger.status === 'SETTLED' && styles.successText,
                        ]}
                      >
                        {statusLabels[ledger.status]}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.amounts}>
                    <Text
                      style={[
                        ui.heading,
                        BigInt(ledger.myRemainingNetCents) !== 0n && {
                          color: netColor(ledger.myRemainingNetCents),
                        },
                        ledger.status === 'SETTLED' && styles.successText,
                      ]}
                    >
                      {remaining(ledger.myRemainingNetCents)}
                    </Text>
                    <Text style={ui.caption}>总支出 {yuan(ledger.expenseTotalCents)}</Text>
                  </View>
                </View>
              </Touch>
            ))}
          </View>
          {query.isFetchNextPageError && <InlineError message={requestErrorMessage(query.error)} />}
          {query.hasNextPage && (
            <Button
              title={query.isFetchNextPageError ? '重试加载更多' : '加载更多'}
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => {
                void query.fetchNextPage();
              }}
            />
          )}
          {!archived && (
            <Touch
              accessibilityLabel="已归档账本"
              style={styles.archive}
              onPress={() => setArchived(true)}
            >
              <View style={ui.between}>
                <Text style={ui.body}>已归档账本</Text>
                <FigmaAsset asset={ledgerAssets.chevron} />
              </View>
            </Touch>
          )}
        </>
      )}
      <LedgerActionsMenu visible={menu} onClose={() => setMenu(false)} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  refresh: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  add: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  welcome: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  greeting: {
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 5px rgba(0,0,0,0.1)',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.text },
  filter: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  list: { gap: 10 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardContent: { gap: 6 },
  identity: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  badge: {
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, lineHeight: 18, color: colors.muted },
  settling: { backgroundColor: colors.primarySoft },
  settled: { backgroundColor: colors.mint },
  warningText: { color: colors.warning },
  successText: { color: colors.success },
  amounts: { gap: 2 },
  archive: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
});
