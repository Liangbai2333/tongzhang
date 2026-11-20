import { useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import {
  MAX_REMINDER_NOTE_LENGTH,
  type EndpointOutput,
  type TransferReminderResult,
} from '@tongzhang/contracts';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { InlineError } from '@/components/Feedback';
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
  const locked = write.busy || write.uncertain;
  const feedback = write.error ? reminderErrorFeedback(write.error) : null;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => locked);
    return () => subscription.remove();
  }, [locked]);

  const trimmed = note.trim();
  const body = trimmed ? { note: trimmed } : {};

  async function submit() {
    if (write.busy) return;
    const result = await write.submit(body, (key) =>
      settlementsApi.remindTransfer(
        { params: { ledgerId, transferId: transfer.id }, query: {}, body },
        { idempotencyKey: key },
      ),
    );
    if (result) onSuccess(result.data);
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
      {needsRefresh && (
        <Button
          compact
          style={{ borderRadius: 12 }}
          title={feedback.actionLabel ?? '刷新结算页'}
          variant="secondary"
          disabled={write.busy}
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
          disabled={write.busy}
          onPress={onRefresh}
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
