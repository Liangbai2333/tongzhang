import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Touch } from '@/components/Touch';
import { useOnlineQuery } from '@/lib/use-online-query';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { profileAssets } from '@/icons/profile-assets';
import { useAuth } from '@/providers/AuthProvider';
import { ledgersApi, ledgersKeys } from '@/features/ledgers';
import { colors } from '@/theme/tokens';
import { DocumentBody } from '../components/DocumentSheet';
import { MenuGroup, SettingRow } from '../components/ProfileMenu';
import { readingDocuments } from '../documents';
import type { ProfilePanel } from '../model';

const countLimit = 50;

/** First page of the current or archived list; a further cursor is shown as "50+", never guessed. */
function useLedgerCount(userId: string | undefined, archived: boolean) {
  const query = useOnlineQuery(
    [...ledgersKeys.root(userId ?? ''), 'count', archived],
    () =>
      ledgersApi.listLedgers({
        params: {},
        query: { archived: archived ? 'true' : 'false', limit: countLimit },
        body: undefined,
      }),
    userId !== undefined,
  );
  const count = query.data
    ? `${query.data.data.length}${query.data.page.nextCursor ? '+' : ''}`
    : undefined;
  return { query, count, failed: query.isError };
}

const panelTitles: Record<Exclude<ProfilePanel['kind'], 'closed' | 'document'>, string> = {
  account: '账户信息',
  settings: '设置',
  'logout-confirm': '退出登录？',
};

export default function AccountScreen() {
  const { user, operation, logout, restore } = useAuth();
  const [panel, setPanel] = useState<ProfilePanel>({ kind: 'closed' });
  const current = useLedgerCount(user?.id, false);
  const history = useLedgerCount(user?.id, true);
  const busy = operation !== null;
  if (!user) return null;
  const initial = Array.from(user.username).at(-1);
  const close = () => {
    if (!busy) setPanel({ kind: 'closed' });
  };
  const countText = (entry: typeof current, format: (count: string) => string) =>
    entry.count !== undefined ? format(entry.count) : entry.failed ? '暂时无法读取' : '正在读取';
  const title =
    panel.kind === 'closed'
      ? ''
      : panel.kind === 'document'
        ? readingDocuments[panel.document].title
        : panelTitles[panel.kind];
  return (
    <Screen
      title="我的"
      variant="ledger"
      back={false}
      contentStyle={styles.content}
      tabRoot
      refreshing={current.query.isRefetching || history.query.isRefetching}
      onRefresh={() => {
        void current.query.refetch();
        void history.query.refetch();
      }}
    >
      <View style={[ui.card, styles.profile]}>
        <View style={ui.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={[ui.grow, styles.identity]}>
            <Text numberOfLines={1} style={styles.name}>
              {user.username}
            </Text>
            <Text selectable numberOfLines={1} style={styles.caption}>
              {user.email}
            </Text>
          </View>
        </View>
        <View style={ui.divider} />
        <Text style={styles.tagline}>每一笔共同消费，都有清楚的记录。</Text>
      </View>
      <View style={styles.stats}>
        {(
          [
            {
              key: 'current',
              entry: current,
              label: '我参与的账本',
              highlight: true,
              view: 'current',
            },
            {
              key: 'history',
              entry: history,
              label: '历史账本',
              highlight: false,
              view: 'archived',
            },
          ] as const
        ).map((stat) => (
          <Touch
            key={stat.key}
            accessibilityLabel={`${stat.label} ${countText(stat.entry, (count) => count)}`}
            accessibilityHint={stat.view === 'archived' ? '打开历史账本' : '打开账本列表'}
            disabled={busy}
            onPress={() => router.navigate({ pathname: '/ledgers', params: { view: stat.view } })}
            style={[styles.stat, stat.highlight && styles.statHighlight]}
          >
            <View style={styles.statContent}>
              <Text style={styles.statValue}>{stat.entry.count ?? '–'}</Text>
              <View style={styles.statLabel}>
                <Text style={styles.caption}>{stat.label}</Text>
                <FigmaAsset asset={profileAssets.chevron} />
              </View>
            </View>
          </Touch>
        ))}
      </View>
      <MenuGroup
        title="账号设置"
        disabled={busy}
        items={[
          {
            key: 'account',
            title: '账户信息',
            icon: profileAssets.user,
            value: user.username,
            onPress: () => setPanel({ kind: 'account' }),
          },
          {
            key: 'settings',
            title: '设置',
            icon: profileAssets.settings,
            onPress: () => setPanel({ kind: 'settings' }),
          },
          {
            key: 'about',
            title: '关于同账',
            icon: profileAssets.about,
            onPress: () => setPanel({ kind: 'document', document: 'about' }),
          },
        ]}
      />
      <Touch
        accessibilityLabel="退出登录"
        disabled={busy}
        onPress={() => setPanel({ kind: 'logout-confirm' })}
        style={styles.logout}
      >
        <Text style={styles.logoutText}>退出登录</Text>
      </Touch>
      <Sheet
        visible={panel.kind !== 'closed'}
        title={title}
        contentKey={panel.kind === 'document' ? panel.document : panel.kind}
        onClose={close}
      >
        {panel.kind === 'account' && (
          <>
            <View style={styles.accountHead}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <Text style={ui.strong}>当前账号已在线核验</Text>
            </View>
            <ReadonlyField label="用户名" value={user.username} />
            <ReadonlyField label="邮箱" value={user.email} />
            <Text style={ui.caption}>资料修改暂未开放。</Text>
            <Button
              title="重新核验登录状态"
              variant="secondary"
              icon={<FigmaAsset asset={profileAssets.refresh} />}
              disabled={busy}
              onPress={() => {
                setPanel({ kind: 'closed' });
                void restore();
              }}
            />
          </>
        )}
        {panel.kind === 'settings' && (
          <View>
            <SettingRow icon={profileAssets.bell} label="通知" value="暂未开放" />
            <SettingRow icon={profileAssets.amount} label="记账货币" value="人民币 CNY" />
            <SettingRow
              icon={profileAssets.lock}
              label="隐私说明"
              value="查看"
              onPress={() => setPanel({ kind: 'document', document: 'privacy' })}
            />
            <SettingRow
              icon={profileAssets.note}
              label="用户协议"
              value="查看"
              onPress={() => setPanel({ kind: 'document', document: 'terms' })}
            />
          </View>
        )}
        {panel.kind === 'document' && <DocumentBody document={panel.document} onClose={close} />}
        {panel.kind === 'logout-confirm' && (
          <>
            <Text style={ui.body}>退出后将清除本机登录凭据。已保存的账号和账目会保留。</Text>
            <Button
              title="确认退出"
              variant="danger"
              loading={operation === 'logout'}
              onPress={() => {
                void logout();
              }}
            />
            <Button title="取消" variant="quiet" disabled={busy} onPress={close} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.caption}>{label}</Text>
      <View style={styles.fieldBox}>
        <Text selectable numberOfLines={1} style={ui.body}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 8, gap: 10 },
  profile: { gap: 12 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, lineHeight: 35, fontWeight: '700', color: colors.text },
  identity: { gap: 4 },
  name: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  caption: { fontSize: 12, lineHeight: 17, color: colors.muted },
  tagline: { fontSize: 13, lineHeight: 21, color: colors.muted },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, padding: 16, borderRadius: 16, backgroundColor: colors.surface },
  statContent: { alignItems: 'center', gap: 4 },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statHighlight: { backgroundColor: colors.primarySoft },
  statValue: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  logout: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: 15, lineHeight: 22, color: colors.danger },
  accountHead: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  field: { gap: 6 },
  fieldBox: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
