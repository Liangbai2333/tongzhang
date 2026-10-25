import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { InlineError, RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useOnlineQuery } from '@/lib/use-online-query';
import { ledgersApi } from '@/features/ledgers/api';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { invitationAssets } from '@/icons/invitation-assets';
import { colors } from '@/theme/tokens';
import { invitationsApi } from '../api';
import { invitationsKeys } from '../query-keys';
import { useInvitationReset } from '../use-invitation-reset';
import { ResetInvitationContent } from '../components/ResetInvitationContent';

export default function InvitationScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    invitationsKeys.ledger(user!.id, ledgerId),
    async () => {
      const [invitation, ledger] = await Promise.all([
        invitationsApi.getInvitation({ params: { ledgerId }, query: {}, body: undefined }),
        ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
      ]);
      return { ...invitation, ledger: ledger.data };
    },
    valid,
  );
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const write = useInvitationReset(ledgerId);
  const loading = valid && (query.isPending || query.isFetching);
  const invitation = query.data?.data;
  const ready = valid && !loading && !query.isError && invitation;
  const expired =
    invitation && (invitation.expired || Date.parse(invitation.expiresAt) <= Date.now());
  const busy = acting || write.busy;
  const ledger = query.data?.ledger;
  const creator = ledger?.members.find((member) => member.userId === ledger.creatorUserId);
  async function copyOrShare(share: boolean) {
    if (!invitation || busy) return;
    if (invitation.expired || Date.parse(invitation.expiresAt) <= Date.now()) {
      setActionError('邀请码已过期，请重置后再邀请');
      return;
    }
    setActing(true);
    setNotice(null);
    setActionError(null);
    try {
      if (share)
        await Share.share({
          message: `邀请你加入同账「${ledger?.name}」，邀请码：${invitation.code}。在同账 App 中输入邀请码，核对账本后加入。`,
        });
      else {
        const copied = await Clipboard.setStringAsync(invitation.code);
        if (!copied) throw new Error('copy failed');
        setNotice('邀请码已复制');
      }
    } catch {
      setActionError(share ? '分享失败，请稍后手动重试' : '复制失败，请稍后手动重试');
    } finally {
      setActing(false);
    }
  }
  async function reset() {
    const result = await write.submit();
    if (result) {
      setConfirm(false);
      setNotice('邀请码已重置，旧码已失效');
      void query.refetch();
    }
  }
  const enter = () => router.replace({ pathname: '/ledgers/[ledgerId]', params: { ledgerId } });
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <Screen
        title="邀请一起记账"
        variant="ledger"
        backDisabled={busy}
        contentStyle={styles.content}
        footer={ready ? <Button title="进入账本" disabled={busy} onPress={enter} /> : undefined}
      >
        {!ready ? (
          <RequestState
            loading={loading}
            title={valid ? '暂时无法读取邀请' : '账本地址无效'}
            description="仅创建者可管理邀请。请返回账本核对。"
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
            <Text style={styles.ledgerName}>{ledger?.name}</Text>
            <View style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {Array.from(creator?.username ?? '我').at(-1)}
                </Text>
              </View>
              <View style={ui.grow}>
                <Text style={styles.creator}>
                  {creator?.username ?? '创建者'}
                  {creator?.userId === user!.id ? '（我）' : ''}
                </Text>
                <Text style={ui.caption}>当前 {ledger?.memberCount} / 12 人</Text>
              </View>
            </View>
            <View style={styles.inviteCard}>
              <View style={styles.codePill}>
                <Text style={styles.codeLabel}>邀请码</Text>
              </View>
              <View style={styles.codeBlock}>
                <Text
                  selectable
                  accessibilityLabel={`邀请码 ${invitation.code}`}
                  style={styles.code}
                >
                  {invitation.code.slice(0, 3)} {invitation.code.slice(3)}
                </Text>
                <View style={styles.codeUnderline} />
              </View>
              <View style={styles.divider} />
              {!expired && (
                <View
                  style={styles.qr}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <QRCode value={invitation.qrPayload} size={140} />
                </View>
              )}
              <View style={styles.qrCaption}>
                <FigmaAsset asset={invitationAssets.scanCaption} />
                <Text style={ui.caption}>
                  {expired ? '邀请码已过期，请重置后再邀请' : '在同账 App 中输入邀请码加入'}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                title="复制邀请码"
                variant="secondary"
                style={styles.copyButton}
                labelStyle={styles.bold}
                icon={<FigmaAsset asset={invitationAssets.copy} />}
                disabled={busy || expired}
                onPress={() => {
                  void copyOrShare(false);
                }}
              />
              <Button
                title="分享邀请"
                variant="soft"
                style={styles.shareButton}
                labelStyle={styles.shareLabel}
                icon={<FigmaAsset asset={invitationAssets.share} />}
                disabled={busy || expired}
                onPress={() => {
                  void copyOrShare(true);
                }}
              />
            </View>
            {notice && (
              <Text accessibilityLiveRegion="polite" style={ui.strong}>
                {notice}
              </Text>
            )}
            <InlineError message={actionError} />
            <View style={styles.notice}>
              <View style={styles.infoBadge}>
                <FigmaAsset asset={invitationAssets.invitationInfo} />
              </View>
              <View style={[ui.grow, styles.noticeCopy]}>
                <Text style={styles.noticeTitle}>邀请码有效期 7 天</Text>
                <Text style={styles.noticeText}>请仅分享给参与此账本的朋友。</Text>
                <Text style={ui.caption}>
                  有效期至 {new Date(invitation.expiresAt).toLocaleString()}
                </Text>
              </View>
            </View>
            <Button
              title="重置邀请码"
              variant="quiet"
              compact
              disabled={busy}
              onPress={() => {
                write.reset();
                setConfirm(true);
              }}
            />
            <Sheet
              visible={confirm}
              title="重置邀请码？"
              variant="members"
              onClose={() => {
                if (!write.busy && !write.uncertain) setConfirm(false);
              }}
            >
              <ResetInvitationContent
                busy={write.busy}
                uncertain={write.uncertain}
                error={write.error}
                onSubmit={() => {
                  void reset();
                }}
                onCancel={() => {
                  if (write.uncertain) enter();
                  else setConfirm(false);
                }}
              />
            </Sheet>
          </>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  content: { paddingTop: 4, gap: 12, paddingBottom: 12 },
  ledgerName: { fontSize: 22, lineHeight: 32, fontWeight: '700', color: colors.text },
  memberRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.text },
  creator: { fontSize: 14, lineHeight: 21, fontWeight: '700', color: colors.text },
  inviteCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 10,
    alignItems: 'center',
    boxShadow: '0px 4px 20px rgba(38,33,20,0.07)',
  },
  codePill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: colors.primarySoft,
  },
  codeLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 1,
  },
  codeBlock: { alignItems: 'center', gap: 4 },
  code: {
    fontSize: 36,
    lineHeight: 52,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.text,
  },
  codeUnderline: {
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  divider: { height: 1, width: '100%', backgroundColor: colors.border },
  qr: {
    width: 176,
    height: 176,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCaption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  copyButton: { flexGrow: 200, flexBasis: 180, paddingHorizontal: 12 },
  shareButton: { flexGrow: 133, flexBasis: 120, paddingHorizontal: 12 },
  bold: { fontWeight: '700' },
  shareLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 16,
  },
  infoBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCopy: { gap: 4 },
  noticeTitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: colors.text },
  noticeText: { fontSize: 13, lineHeight: 19, color: colors.muted },
});
