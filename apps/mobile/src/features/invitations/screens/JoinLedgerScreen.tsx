import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { inviteCodeSchema, type EndpointOutput } from '@tongzhang/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, ui } from '@/components/Screen';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { invitationAssets } from '@/icons/invitation-assets';
import { colors } from '@/theme/tokens';
import { InviteCodeField } from '../components/InviteCodeField';
import { JoinInvitationHero } from '../components/JoinInvitationHero';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { InlineError, requestErrorMessage } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { ledgersKeys } from '@/features/ledgers/query-keys';
import { invitationsApi } from '../api';

type Preview = EndpointOutput<'previewJoin'>['data'] & { code: string };

export default function JoinLedgerScreen() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const write = useIdempotentWrite();
  const busy = checking || write.busy;
  async function check() {
    if (checkingRef.current || busy) return;
    setError(null);
    if (!inviteCodeSchema.safeParse(code).success) {
      setError('请输入 6 位邀请码（不含 0、1、I、O）');
      return;
    }
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await invitationsApi.previewJoin({ params: {}, query: {}, body: { code } });
      Keyboard.dismiss();
      setPreview({ ...result.data, code });
    } catch (cause) {
      setError(requestErrorMessage(cause));
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }
  function dismissPreview() {
    if (write.busy || write.uncertain) return;
    write.reset();
    setPreview(null);
  }
  async function join() {
    if (!preview || busy) return;
    if (preview.alreadyMember) {
      router.replace({ pathname: '/ledgers/[ledgerId]', params: { ledgerId: preview.ledgerId } });
      return;
    }
    const body = { code: preview.code };
    const result = await write.submit(body, (key) =>
      invitationsApi.joinLedger({ params: {}, query: {}, body }, { idempotencyKey: key }),
    );
    if (result) {
      void client.invalidateQueries({ queryKey: ledgersKeys.root(user!.id) });
      router.replace({
        pathname: '/ledgers/[ledgerId]',
        params: { ledgerId: result.data.ledgerId },
      });
    }
  }
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <Screen
        title="加入账本"
        variant="ledger"
        contentStyle={styles.content}
        backDisabled={busy}
        footer={
          <Button
            title="查看账本"
            loading={checking}
            disabled={write.busy}
            onPress={() => {
              void check();
            }}
          />
        }
      >
        <JoinInvitationHero />
        <InviteCodeField
          value={code}
          disabled={busy || write.uncertain}
          onChangeText={(value) => {
            setCode(value.trim().toUpperCase());
            setError(null);
          }}
          error={error}
        />
        <View style={styles.separator}>
          <View style={styles.line} />
          <Text style={styles.or}>或</Text>
          <View style={styles.line} />
        </View>
        <Button
          title="在 App 内扫码（暂未开放）"
          variant="secondary"
          disabled
          onPress={() => {}}
          icon={<FigmaAsset asset={invitationAssets.scan} />}
          labelStyle={styles.scanLabel}
        />
        <View style={styles.notice}>
          <FigmaAsset asset={invitationAssets.joinInfo} />
          <View style={ui.grow}>
            <Text style={styles.noticeTitle}>如何获取邀请码？</Text>
            <Text style={styles.noticeText}>
              请联系账本创建者，在账本中选择「邀请成员」获取邀请码或二维码。
            </Text>
          </View>
        </View>
        <Sheet
          visible={preview !== null}
          title="确认加入这个账本？"
          variant="join"
          onClose={dismissPreview}
        >
          {preview && (
            <>
              <View style={styles.previewCard}>
                <Text style={styles.previewName}>{preview.name}</Text>
                <Text style={styles.previewMeta}>创建者：{preview.creatorName}</Text>
                <Text style={styles.previewMeta}>账本成员：{preview.memberCount} / 12 人</Text>
              </View>
              <Text style={styles.description}>
                {preview.alreadyMember
                  ? '你已是成员，可直接进入账本。'
                  : preview.canJoin
                    ? '加入后可以查看账本中的记录。已有消费的分摊不会因加入改变。'
                    : preview.memberCount >= 12
                      ? '成员已满，暂时无法加入。'
                      : '账本已不接受加入，请联系创建者。'}
              </Text>
              <InlineError message={write.error ? requestErrorMessage(write.error) : null} />
              {write.uncertain && (
                <Text style={ui.muted}>结果尚未确认，重试会核对原提交。也可返回列表在线核对。</Text>
              )}
              <Button
                compact
                title={
                  preview.alreadyMember
                    ? '进入账本'
                    : write.uncertain
                      ? '重试原提交'
                      : `加入${preview.name}`
                }
                disabled={!preview.canJoin && !preview.alreadyMember}
                loading={write.busy}
                onPress={() => {
                  void join();
                }}
              />
              <Button
                compact
                title={write.uncertain ? '返回列表核对' : '暂不加入'}
                variant="outlined"
                disabled={write.busy}
                onPress={() => {
                  if (write.uncertain) router.replace('/ledgers');
                  else dismissPreview();
                }}
              />
            </>
          )}
        </Sheet>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, gap: 16 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { fontSize: 12, lineHeight: 18, color: colors.muted },
  scanLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 16,
  },
  noticeTitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  noticeText: { fontSize: 13, lineHeight: 19, color: colors.muted },
  previewCard: { borderRadius: 12, padding: 16, gap: 6, backgroundColor: colors.background },
  previewName: { fontSize: 19, lineHeight: 28, fontWeight: '700', color: colors.text },
  previewMeta: { fontSize: 13, lineHeight: 19, color: colors.muted },
  description: { fontSize: 13, lineHeight: 19, color: colors.muted },
});
