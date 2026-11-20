import { useEffect, useRef, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import {
  MAX_REMINDER_NOTE_LENGTH,
  type EndpointOutput,
  type TransferReminderResult,
} from '@tongzhang/contracts';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { InlineError, requestErrorMessage } from '@/components/Feedback';
import { ui } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { yuan } from '@/features/ledgers/presentation';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { colors } from '@/theme/tokens';
import { settlementsApi } from '../api';
import { reminderErrorFeedback } from '../reminder';

type Transfer = EndpointOutput<'getSettlement'>['data']['transfers'][number];

type RemindTransferSheetProps = {
  ledgerId: string;
  transfer: Transfer;
  name: (id: string) => string;
  onSuccess: (result: TransferReminderResult) => void;
  onRefresh: () => void;
  onCancel: () => void;
};

/**
 * In-page remind-confirm sheet (A32).
 * Enforces 6h cooldown feedback without leaking payer notification preferences,
 * preserves note + Idempotency-Key across uncertain / 401 outcomes, and forbids auto-retry.
 */
export function RemindTransferSheet({
  ledgerId,
  transfer,
  name,
  onSuccess,
  onRefresh,
  onCancel,
}: RemindTransferSheetProps) {
  const write = useIdempotentWrite();
  const [note, setNote] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkingLock = useRef(false);
  const mounted = useRef(true);
  const locked = write.busy || write.uncertain || checking;
  const feedback = write.error ? reminderErrorFeedback(write.error) : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => locked);
    return () => subscription.remove();
  }, [locked]);

  const trimmed = note.trim();
  const body = trimmed ? { note: trimmed } : {};

  async function submit() {
    if (write.busy || checkingLock.current) return;
    setCheckError(null);
    const result = await write.submit(body, (key) =>
      settlementsApi.remindTransfer(
        { params: { ledgerId, transferId: transfer.id }, query: {}, body },
        { idempotencyKey: key },
      ),
    );
    if (result) onSuccess(result.data);
  }

  async function verifySettlementState() {
    if (write.busy || checkingLock.current || !mounted.current) return;
    checkingLock.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const result = await settlementsApi.getSettlement({
        params: { ledgerId },
        query: {},
        body: undefined,
      });
      if (!mounted.current) return;
      const latest = result.data.transfers.find((item) => item.id === transfer.id);
      if (result.data.ledgerStatus !== 'SETTLING' || !latest || latest.status !== 'PENDING') {
        onRefresh();
        return;
      }
      setCheckError(
        '该笔转账仍为待还状态；为保留原请求标识避免重复触发冷却，请点击「手动重试催还」完成确认。',
      );
    } catch (cause) {
      if (mounted.current) setCheckError(requestErrorMessage(cause));
    } finally {
      checkingLock.current = false;
      if (mounted.current) setChecking(false);
    }
  }

  const needsRefresh =
    feedback !== null &&
    (feedback.kind === 'state_invalid' ||
      feedback.kind === 'idempotency_conflict' ||
      feedback.kind === 'not_found');

  return (
    <Sheet
      visible
      title="发送待还提醒"
      variant="join"
      hideClose
      onClose={() => {
        if (!locked) onCancel();
      }}
    >
      <View
        style={{
          backgroundColor: colors.background,
          borderRadius: 12,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={[ui.strong, { fontSize: 17, lineHeight: 25, fontWeight: '700' }]}>
          {name(transfer.payerMemberId)} → {name(transfer.payeeMemberId)}
        </Text>
        <Text style={[ui.heading, { fontSize: 22, lineHeight: 32 }]}>
          {yuan(transfer.amountCents)}
        </Text>
      </View>
      <Text style={[ui.muted, { fontSize: 13, lineHeight: 19 }]}>
        将向付款人发送站内待还提醒，不会改变消费、转账金额或账本版本。同一笔转账 6
        小时内仅可催还一次。
      </Text>
      <Field
        variant="panel"
        label="催还备注（选填）"
        placeholder="例如：方便时请确认这笔转账"
        value={note}
        maxLength={MAX_REMINDER_NOTE_LENGTH}
        editable={!locked}
        onChangeText={setNote}
      />
      <InlineError message={feedback?.message ?? null} />
      <InlineError message={checkError} />
      {needsRefresh && (
        <Button
          compact
          style={{ borderRadius: 12 }}
          title={feedback.actionLabel ?? '刷新结算页'}
          variant="secondary"
          disabled={write.busy || checking}
          onPress={onRefresh}
        />
      )}
      {!needsRefresh && feedback?.kind !== 'cooldown' && (
        <Button
          compact
          style={{ borderRadius: 12 }}
          labelStyle={{ fontSize: 15, lineHeight: 22, fontWeight: '700' }}
          title={write.uncertain ? (feedback?.actionLabel ?? '手动重试催还') : '确认发送提醒'}
          loading={write.busy}
          disabled={checking}
          onPress={() => {
            void submit();
          }}
        />
      )}
      {write.uncertain && (
        <Button
          compact
          style={{ borderRadius: 12 }}
          title="刷新结算页核对"
          variant="secondary"
          loading={checking}
          disabled={write.busy}
          onPress={() => {
            void verifySettlementState();
          }}
        />
      )}
      <Button
        compact
        style={{ borderRadius: 12 }}
        labelStyle={{ fontSize: 15, lineHeight: 22, fontWeight: '700' }}
        title="取消"
        variant="outlined"
        disabled={locked}
        onPress={onCancel}
      />
    </Sheet>
  );
}
