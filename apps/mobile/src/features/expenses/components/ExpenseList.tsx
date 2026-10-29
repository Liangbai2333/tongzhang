import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { expenseListQuerySchema, type EndpointInput } from '@tongzhang/contracts';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Touch } from '@/components/Touch';
import { Sheet } from '@/components/Sheet';
import { EmptyState, InlineError, RequestState, requestErrorMessage } from '@/components/Feedback';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { yuan } from '@/features/ledgers/presentation';
import { expensesApi } from '../api';
import { expensesKeys } from '../query-keys';
import { categories, type Ledger } from '../presentation';
type Filter = Omit<EndpointInput<'listExpenses'>['query'], 'cursor' | 'limit'>;
export function CategoryIcon({ category, detail = false }: { category: string; detail?: boolean }) {
  const asset =
    category === 'DINING'
      ? detail
        ? expenseAssets.diningDetail
        : expenseAssets.dining
      : category === 'TICKET'
        ? expenseAssets.ticket
        : category === 'TRANSPORT'
          ? expenseAssets.transport
          : undefined;
  return (
    <View style={s.icon}>
      {asset ? (
        <FigmaAsset asset={asset} />
      ) : (
        <Text style={ui.caption}>
          {categories.find((c) => c.value === category)?.label ?? '消费'}
        </Text>
      )}
    </View>
  );
}
export function ExpenseList({
  ledger,
  userId,
  refreshSignal = 0,
}: {
  ledger: Ledger;
  userId: string;
  /** Bumped by the owning page's pull-to-refresh. */
  refreshSignal?: number;
}) {
  const [filter, setFilter] = useState<Filter>({});
  const [draft, setDraft] = useState<Filter>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [range, setRange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: [...expensesKeys.ledger(userId, ledger.id), 'list', filter],
    queryFn: ({ pageParam }) =>
      expensesApi.listExpenses({
        params: { ledgerId: ledger.id },
        query: { ...filter, limit: 20, cursor: pageParam },
        body: undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    enabled: false,
    retry: false,
    gcTime: 0,
  });
  const { refetch } = query;
  const identity = JSON.stringify(filter);
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch, identity]),
  );
  const lastSignal = useRef(refreshSignal);
  useEffect(() => {
    if (lastSignal.current === refreshSignal) return;
    lastSignal.current = refreshSignal;
    void refetch();
  }, [refreshSignal, refetch]);
  const loading = query.isPending || query.isRefetching;
  const failed = query.isError && !query.isFetchNextPageError;
  const rows = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.data) ?? []).map((row) => [row.id, row]),
    ).values(),
  ];
  const filtered = Object.values(filter).some(Boolean);
  return (
    <View style={{ gap: 12 }}>
      <View style={ui.between}>
        <Text style={ui.heading}>消费流水</Text>
        <Button
          compact
          title={filtered ? '已筛选' : '筛选'}
          variant="secondary"
          onPress={() => {
            setDraft(filter);
            setRange(Boolean(filter.from || filter.to));
            setError(null);
            setFilterOpen(true);
          }}
        />
      </View>
      {loading || failed ? (
        <RequestState
          loading={loading}
          title="暂时无法读取消费"
          description="请检查网络后重试。"
          error={query.error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          {rows.length === 0 ? (
            <EmptyState
              title={filtered ? '没有匹配的消费' : '还没有消费记录'}
              description={
                filtered ? '试试调整或清除筛选条件。' : '记录付款人和参与成员，开始共同记账。'
              }
            />
          ) : (
            <View style={s.list}>
              {rows.map((expense, i) => (
                <Touch
                  key={expense.id}
                  accessibilityLabel={`查看消费 ${expense.title}`}
                  style={[s.expense, i > 0 && s.border]}
                  onPress={() =>
                    router.push({
                      pathname: '/ledgers/[ledgerId]/expenses/[expenseId]',
                      params: { ledgerId: ledger.id, expenseId: expense.id },
                    })
                  }
                >
                  <View style={ui.row}>
                    <CategoryIcon category={expense.category} />
                    <View style={ui.grow}>
                      <Text style={ui.strong}>{expense.title}</Text>
                      <Text style={ui.caption}>
                        {expense.payerName} 付款 · {expense.occurredOn}
                      </Text>
                    </View>
                    <Text style={ui.strong}>{yuan(expense.amountCents)}</Text>
                  </View>
                </Touch>
              ))}
            </View>
          )}
          {query.isFetchNextPageError && <InlineError message={requestErrorMessage(query.error)} />}
          {query.hasNextPage && (
            <Button
              title={query.isFetchNextPageError ? '重试加载更多消费' : '加载更多消费'}
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => {
                void query.fetchNextPage();
              }}
            />
          )}
        </>
      )}
      <Sheet
        visible={filterOpen}
        title="筛选消费"
        variant="members"
        onClose={() => setFilterOpen(false)}
      >
        <Text style={ui.caption}>日期</Text>
        <Touch
          accessibilityRole="radio"
          accessibilityLabel="全部日期"
          accessibilityState={{ selected: !range }}
          style={[s.dateChoice, !range && { backgroundColor: colors.primarySoft }]}
          onPress={() => {
            setRange(false);
            setDraft({ ...draft, from: undefined, to: undefined });
          }}
        >
          <View style={ui.between}>
            <Text style={ui.body}>全部日期</Text>
            {!range && <FigmaAsset asset={expenseAssets.done} />}
          </View>
        </Touch>
        <Touch
          accessibilityRole="radio"
          accessibilityLabel="选择日期范围"
          accessibilityState={{ selected: range }}
          style={[s.dateChoice, range && { backgroundColor: colors.primarySoft }]}
          onPress={() => setRange(true)}
        >
          <View style={ui.between}>
            <Text style={ui.body}>选择日期范围</Text>
            <Text style={ui.caption}>起始日期 — 结束日期</Text>
          </View>
        </Touch>
        {range && (
          <View style={{ gap: 12 }}>
            <Field
              label="开始日期 YYYY-MM-DD"
              value={draft.from ?? ''}
              maxLength={10}
              onChangeText={(value) => setDraft({ ...draft, from: value || undefined })}
            />
            <Field
              label="结束日期 YYYY-MM-DD"
              value={draft.to ?? ''}
              maxLength={10}
              onChangeText={(value) => setDraft({ ...draft, to: value || undefined })}
            />
          </View>
        )}
        <Text style={ui.strong}>付款人</Text>
        <View style={s.options}>
          {[{ id: '', username: '全部付款人' }, ...ledger.members].map((m) => (
            <Touch
              key={m.id}
              accessibilityRole="radio"
              accessibilityLabel={m.username}
              accessibilityState={{ selected: (draft.payerMemberId ?? '') === m.id }}
              style={[
                s.payerPill,
                (draft.payerMemberId ?? '') === m.id && { backgroundColor: colors.primarySoft },
              ]}
              onPress={() => setDraft({ ...draft, payerMemberId: m.id || undefined })}
            >
              <Text style={s.pillText}>{m.id ? m.username : '全部'}</Text>
            </Touch>
          ))}
        </View>
        <Text style={ui.strong}>消费类别</Text>
        <View style={s.options}>
          {[{ value: '', label: '全部类别' }, ...categories].map((c) => (
            <Touch
              key={c.value}
              accessibilityRole="radio"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: (draft.category ?? '') === c.value }}
              style={[
                s.pill,
                (draft.category ?? '') === c.value && { backgroundColor: colors.primarySoft },
              ]}
              onPress={() =>
                setDraft({ ...draft, category: (c.value || undefined) as Filter['category'] })
              }
            >
              <Text style={s.pillText}>{c.value ? c.label : '全部'}</Text>
            </Touch>
          ))}
        </View>
        <InlineError message={error} />
        <Button
          compact
          title="应用筛选"
          onPress={() => {
            if (range && !draft.from && !draft.to) {
              setError('请填写开始或结束日期');
              return;
            }
            if (!expenseListQuerySchema.safeParse(draft).success) {
              setError('请填写有效日期，开始日期不能晚于结束日期');
              return;
            }
            setFilter(draft);
            setFilterOpen(false);
          }}
        />
        <Button
          compact
          title="清除筛选"
          variant="quiet"
          onPress={() => {
            setFilter({});
            setFilterOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
const s = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16 },
  expense: { minHeight: 76, paddingVertical: 16, justifyContent: 'center' },
  border: { borderTopWidth: 1, borderColor: colors.border },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChoice: { minHeight: 52, borderRadius: 16, paddingHorizontal: 16, justifyContent: 'center' },
  payerPill: {
    flex: 1,
    flexBasis: 80,
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  pill: {
    width: '31%',
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  pillText: { fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
});
