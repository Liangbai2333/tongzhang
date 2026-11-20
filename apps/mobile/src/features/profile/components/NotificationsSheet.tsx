import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationItem } from '@tongzhang/contracts';
import { Button } from '@/components/Button';
import { EmptyState, InlineError, RequestState } from '@/components/Feedback';
import { ui } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Touch } from '@/components/Touch';
import { yuan } from '@/features/ledgers/presentation';
import { blocksContent } from '@/lib/use-online-query';
import { colors } from '@/theme/tokens';
import { profileApi } from '../api';
import {
  applyNotificationRead,
  notificationErrorFeedback,
  notificationTargetRoute,
} from '../notifications';
import { profileKeys } from '../query-keys';

type NotificationsSheetProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
};

/**
 * In-app settlement reminder list sheet (A33 / A34).
 * Supports unreadOnly filter, cursor pagination, manual retry, mark-read and deep link to settlement.
 */
export function NotificationsSheet({ visible, userId, onClose }: NotificationsSheetProps) {
  const client = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [readOverrides, setReadOverrides] = useState<Record<string, string>>({});
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: profileKeys.notifications(userId, unreadOnly),
    queryFn: ({ pageParam }) =>
      profileApi.listNotifications({
        params: {},
        query: {
          unreadOnly: unreadOnly ? 'true' : 'false',
          limit: 20,
          cursor: pageParam,
        },
        body: undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    enabled: visible,
    retry: false,
    gcTime: 0,
  });

  const loading = visible && blocksContent(query);
  const failed = query.isError && !query.isFetchNextPageError;
  const rawItems = query.data?.pages.flatMap((page) => page.data) ?? [];
  const items = rawItems
    .reduce<NotificationItem[]>((acc, item) => {
      const override = readOverrides[item.id];
      const next = override ? (applyNotificationRead([item], item.id, override)[0] ?? item) : item;
      acc.push(next);
      return acc;
    }, [])
    .filter((item) => (!unreadOnly ? true : item.readAt === null));

  async function openNotification(item: NotificationItem) {
    if (markingId !== null) return;
    setActionError(null);
    if (item.readAt === null) {
      setMarkingId(item.id);
      try {
        const result = await profileApi.markNotificationRead({
          params: { notificationId: item.id },
          query: {},
          body: undefined,
        });
        setReadOverrides((prev) => ({
          ...prev,
          [result.data.notificationId]: prev[result.data.notificationId] ?? result.data.readAt,
        }));
        void client.invalidateQueries({ queryKey: ['user', userId, 'notifications'] });
      } catch (cause) {
        setActionError(notificationErrorFeedback(cause).message);
        return;
      } finally {
        setMarkingId(null);
      }
    }
    onClose();
    router.push(notificationTargetRoute(item));
  }

  const listFeedback = failed ? notificationErrorFeedback(query.error) : null;
  const nextPageFeedback = query.isFetchNextPageError
    ? notificationErrorFeedback(query.error)
    : null;

  return (
    <Sheet
      visible={visible}
      title="站内提醒"
      onClose={() => {
        if (markingId === null) onClose();
      }}
    >
      <View style={ui.between}>
        <View style={s.filters}>
          <Touch
            accessibilityRole="button"
            accessibilityState={{ selected: !unreadOnly }}
            style={[s.filterPill, !unreadOnly && s.filterActive]}
            disabled={markingId !== null}
            onPress={() => {
              setActionError(null);
              setUnreadOnly(false);
            }}
          >
            <Text style={[s.filterText, !unreadOnly && s.filterTextActive]}>全部</Text>
          </Touch>
          <Touch
            accessibilityRole="button"
            accessibilityState={{ selected: unreadOnly }}
            style={[s.filterPill, unreadOnly && s.filterActive]}
            disabled={markingId !== null}
            onPress={() => {
              setActionError(null);
              setUnreadOnly(true);
            }}
          >
            <Text style={[s.filterText, unreadOnly && s.filterTextActive]}>仅看未读</Text>
          </Touch>
        </View>
        <Touch
          accessibilityRole="button"
          accessibilityLabel="刷新提醒"
          style={s.refresh}
          disabled={query.isFetching || markingId !== null}
          onPress={() => {
            setActionError(null);
            void query.refetch();
          }}
        >
          <Text style={ui.caption}>刷新提醒</Text>
        </Touch>
      </View>
      <InlineError message={actionError} />
      {loading ? (
        <RequestState loading title="正在读取站内提醒" description="请稍候。" />
      ) : listFeedback ? (
        <View style={s.errorBox}>
          <InlineError message={listFeedback.message} />
          <Button
            compact
            title={listFeedback.actionLabel ?? '手动重试'}
            variant="secondary"
            onPress={() => {
              setActionError(null);
              void query.refetch();
            }}
          />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? '暂无未读提醒' : '暂无站内提醒'}
          description={unreadOnly ? '所有待还提醒都已查看。' : '收到待还催还提醒后会显示在这里。'}
        />
      ) : (
        <View style={s.list}>
          {items.map((item) => {
            const unread = item.readAt === null;
            return (
              <Touch
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.ledgerName} ${item.actorName} 提醒待还 ${yuan(item.amountCents)} ${unread ? '未读' : '已读'}`}
                disabled={markingId !== null}
                style={[s.item, unread && s.itemUnread]}
                onPress={() => {
                  void openNotification(item);
                }}
              >
                <View style={ui.between}>
                  <Text numberOfLines={1} style={[ui.strong, ui.grow]}>
                    {item.ledgerName}
                  </Text>
                  <Text style={[s.badge, unread ? s.badgeUnread : s.badgeRead]}>
                    {markingId === item.id ? '处理中' : unread ? '未读' : '已读'}
                  </Text>
                </View>
                <Text style={ui.body}>
                  {item.actorName} 提醒你处理待还转账 {yuan(item.amountCents)}
                </Text>
                {item.note && <Text style={ui.caption}>备注：{item.note}</Text>}
                <Text style={ui.caption}>
                  {new Date(item.createdAt).toLocaleString()} · 点击查看结算页
                </Text>
              </Touch>
            );
          })}
          {nextPageFeedback && <InlineError message={nextPageFeedback.message} />}
          {query.hasNextPage && (
            <Button
              compact
              title={query.isFetchNextPageError ? '重试加载更多' : '加载更多'}
              variant="secondary"
              loading={query.isFetchingNextPage}
              disabled={markingId !== null}
              onPress={() => {
                void query.fetchNextPage();
              }}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8 },
  filterPill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 13, lineHeight: 18, color: colors.muted, fontWeight: '600' },
  filterTextActive: { color: colors.text },
  refresh: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  errorBox: { gap: 10 },
  list: { gap: 10 },
  item: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  itemUnread: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  badge: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeUnread: { backgroundColor: colors.peach, color: colors.danger },
  badgeRead: { backgroundColor: colors.background, color: colors.muted },
});
