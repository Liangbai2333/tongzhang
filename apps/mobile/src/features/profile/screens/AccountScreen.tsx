import { useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { updateProfileBodySchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { Touch } from '@/components/Touch';
import { InlineError, requestErrorMessage } from '@/components/Feedback';
import { useOnlineQuery } from '@/lib/use-online-query';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { profileAssets } from '@/icons/profile-assets';
import { useAuth } from '@/providers/AuthProvider';
import { ledgersApi, ledgersKeys } from '@/features/ledgers';
import { colors } from '@/theme/tokens';
import { profileApi } from '../api';
import { DocumentBody } from '../components/DocumentSheet';
import { NotificationsSheet } from '../components/NotificationsSheet';
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

const panelTitles: Record<
  Exclude<ProfilePanel['kind'], 'closed' | 'document' | 'notifications'>,
  string
> = {
  account: '账户信息',
  settings: '设置',
  'logout-confirm': '退出登录？',
};

export default function AccountScreen() {
  const { user, operation, logout, restore, syncUser } = useAuth();
  const client = useQueryClient();
  const [panel, setPanel] = useState<ProfilePanel>({ kind: 'closed' });
  const [usernameDraft, setUsernameDraft] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);
  const profileLocked = useRef(false);
  const prefLocked = useRef(false);
  const current = useLedgerCount(user?.id, false);
  const history = useLedgerCount(user?.id, true);
  const busy = operation !== null || profileSaving || prefSaving;
  if (!user) return null;
  const initial = Array.from(user.username).at(-1);
  const close = () => {
    if (!busy) {
      setProfileError(null);
      setProfileSaved(false);
      setPrefError(null);
      setPanel({ kind: 'closed' });
    }
  };
  const openAccount = () => {
    setUsernameDraft(user.username);
    setProfileError(null);
    setProfileSaved(false);
    setPanel({ kind: 'account' });
  };
  const openSettings = () => {
    setPrefError(null);
    setPanel({ kind: 'settings' });
  };

  async function saveUsername() {
    if (!user || profileLocked.current || busy) return;
    setProfileError(null);
    setProfileSaved(false);
    const trimmed = usernameDraft.trim();
    const codePoints = Array.from(trimmed).length;
    const parsed = updateProfileBodySchema.safeParse({ username: trimmed });
    if (!parsed.success || codePoints < 2 || codePoints > 30 || trimmed.includes('\0')) {
      setProfileError('用户名长度需为 2～30 个字符');
      return;
    }
    profileLocked.current = true;
    setProfileSaving(true);
    try {
      const result = await profileApi.updateProfile({
        params: {},
        query: {},
        body: parsed.data,
      });
      syncUser?.(result.data);
      setUsernameDraft(result.data.username);
      setProfileSaved(true);
      void client.invalidateQueries({ queryKey: ['user', user.id] });
    } catch (cause) {
      setProfileError(requestErrorMessage(cause));
    } finally {
      profileLocked.current = false;
      setProfileSaving(false);
    }
  }

  async function toggleNotification(next: boolean) {
    if (!user || prefLocked.current || busy) return;
    setPrefError(null);
    prefLocked.current = true;
    setPrefSaving(true);
    try {
      const result = await profileApi.updatePreferences({
        params: {},
        query: {},
        body: { notificationEnabled: next },
      });
      syncUser?.({ notificationEnabled: result.data.notificationEnabled });
      void client.invalidateQueries({ queryKey: ['user', user.id] });
    } catch (cause) {
      setPrefError(requestErrorMessage(cause));
    } finally {
      prefLocked.current = false;
      setPrefSaving(false);
    }
  }

  const countText = (entry: typeof current, format: (count: string) => string) =>
    entry.count !== undefined ? format(entry.count) : entry.failed ? '暂时无法读取' : '正在读取';
  const title =
    panel.kind === 'closed' || panel.kind === 'notifications'
      ? ''
      : panel.kind === 'document'
        ? readingDocuments[panel.document].title
        : panelTitles[panel.kind];
  const usernameChanged = usernameDraft.trim() !== user.username;
  return (
    <Screen
      title="我的"
      variant="ledger"
      back={false}
      contentStyle={styles.content}
      tabRoot
      refreshing={current.query.isRefetching || history.query.isRefetching}
      onRefresh={
        !busy && panel.kind === 'closed'
          ? () => {
              void current.query.refetch();
              void history.query.refetch();
            }
          : undefined
      }
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
            onPress: openAccount,
          },
          {
            key: 'notifications',
            title: '站内提醒',
            icon: profileAssets.bell,
            value: '待还催还',
            onPress: () => setPanel({ kind: 'notifications' }),
          },
          {
            key: 'settings',
            title: '设置',
            icon: profileAssets.settings,
            value: user.notificationEnabled ? '通知已开启' : '通知已关闭',
            onPress: openSettings,
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
        visible={panel.kind !== 'closed' && panel.kind !== 'notifications'}
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
            <Field
              label="用户名"
              value={usernameDraft}
              maxLength={30}
              editable={!busy}
              onChangeText={(value) => {
                setUsernameDraft(value);
                setProfileError(null);
                setProfileSaved(false);
              }}
              placeholder="请输入 2～30 个字符的用户名"
              error={profileError ?? undefined}
            />
            {profileSaved && (
              <Text style={styles.savedHint}>用户名已更新，账本成员展示将同步刷新。</Text>
            )}
            <Button
              compact
              title="保存用户名"
              loading={profileSaving}
              disabled={busy || !usernameChanged}
              onPress={() => {
                void saveUsername();
              }}
            />
            <ReadonlyField label="邮箱" value={user.email} />
            <Text style={ui.caption}>邮箱暂不支持修改。</Text>
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
            <View style={styles.switchRow}>
              <FigmaAsset asset={profileAssets.bell} />
              <View style={ui.grow}>
                <Text style={styles.switchLabel}>通知</Text>
                <Text style={styles.caption}>
                  {user.notificationEnabled ? '已开启站内提醒通知' : '已关闭站内提醒通知'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="通知开关"
                value={user.notificationEnabled}
                disabled={busy}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
                onValueChange={(next) => {
                  void toggleNotification(next);
                }}
              />
            </View>
            <InlineError message={prefError} />
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
      <NotificationsSheet
        visible={panel.kind === 'notifications'}
        userId={user.id}
        onClose={close}
      />
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
  savedHint: { fontSize: 13, lineHeight: 19, color: colors.success },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 15, lineHeight: 22, color: colors.text },
});
