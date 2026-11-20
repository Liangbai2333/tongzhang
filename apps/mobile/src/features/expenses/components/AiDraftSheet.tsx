import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Switch, Text, View } from 'react-native';
import { MAX_AI_DRAFT_TEXT_LENGTH, parseExpenseDraftBodySchema } from '@tongzhang/contracts';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { InlineError } from '@/components/Feedback';
import { Sheet } from '@/components/Sheet';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import {
  aiDraftErrorFeedback,
  applyExpenseDraftToForm,
  type AiDraftErrorFeedback,
  type AiDraftStatus,
  type AppliedExpenseDraft,
  type ExpenseFormDraftValues,
} from '../ai-draft';
import { expensesApi } from '../api';
import type { Ledger } from '../presentation';

type AiDraftSheetProps = {
  visible: boolean;
  ledger: Ledger;
  referenceDate: string;
  currentValues: ExpenseFormDraftValues;
  hasSelectedReceipt: boolean;
  uploadReceipt: () => Promise<string | null | undefined>;
  onApplyDraft: (applied: AppliedExpenseDraft) => void;
  onRefreshLedger?: () => void;
  onClose: () => void;
};

/**
 * In-page AI draft helper sheet (A31).
 * Only prefills editable ExpenseForm state; never persists or calls A13 createExpense.
 */
export function AiDraftSheet({
  visible,
  ledger,
  referenceDate,
  currentValues,
  hasSelectedReceipt,
  uploadReceipt,
  onApplyDraft,
  onRefreshLedger,
  onClose,
}: AiDraftSheetProps) {
  const [text, setText] = useState('');
  const [includeReceipt, setIncludeReceipt] = useState(true);
  const [status, setStatus] = useState<AiDraftStatus>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AiDraftErrorFeedback | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const busy = status === 'parsing';
  const hasReceipt = hasSelectedReceipt || currentValues.existingReceiptId !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => busy);
    return () => subscription.remove();
  }, [visible, busy]);

  async function parse() {
    if (locked.current || busy) return;
    setValidationError(null);
    setFeedback(null);

    const trimmed = text.trim();
    const shouldUseReceipt = includeReceipt && hasReceipt;
    if (!trimmed && !shouldUseReceipt) {
      setValidationError('请输入记账文本，或在表单中选择收据图片后再解析。');
      return;
    }

    locked.current = true;
    setStatus('parsing');
    try {
      let receiptImageId: string | undefined;
      if (shouldUseReceipt) {
        if (hasSelectedReceipt) {
          const uploaded = await uploadReceipt();
          if (!mounted.current) return;
          if (uploaded === undefined) {
            setStatus('error');
            setValidationError('收据图片上传未完成，已保留当前输入，请检查后重试或改用文字解析。');
            return;
          }
          if (uploaded) receiptImageId = uploaded;
        } else if (currentValues.existingReceiptId) {
          receiptImageId = currentValues.existingReceiptId;
        }
      }

      const parsedBody = parseExpenseDraftBodySchema.safeParse({
        ...(trimmed ? { text: trimmed } : {}),
        ...(receiptImageId ? { receiptImageId } : {}),
        referenceDate,
      });
      if (!parsedBody.success) {
        setStatus('error');
        setValidationError('请提供 1～500 字的记账文本或有效收据图片。');
        return;
      }

      const response = await expensesApi.parseExpenseDraft({
        params: { ledgerId: ledger.id },
        query: {},
        body: parsedBody.data,
      });
      if (!mounted.current) return;

      const applied = applyExpenseDraftToForm(response.data, ledger, currentValues);
      setStatus(applied.warnings.length > 0 ? 'degraded' : 'prefilled');
      onApplyDraft(applied);
    } catch (cause) {
      if (!mounted.current) return;
      const mapped = aiDraftErrorFeedback(cause);
      setFeedback(mapped);
      setStatus(mapped.kind === 'unavailable' ? 'degraded' : 'error');
    } finally {
      locked.current = false;
    }
  }

  return (
    <Sheet
      visible={visible}
      title="AI 辅助填写"
      variant="members"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Text style={ui.caption}>
        输入一句话消费描述或结合已选收据生成草稿。草稿仅回填当前表单，不会直接入账，需核对后手动点击「保存消费」。
      </Text>
      <Field
        label="消费描述"
        placeholder="例如：昨晚小安请大家吃火锅花了 120 元，4 个人均分"
        value={text}
        maxLength={MAX_AI_DRAFT_TEXT_LENGTH}
        multiline
        editable={!busy}
        onChangeText={(value) => {
          setText(value);
          setValidationError(null);
          if (feedback?.kind === 'validation') setFeedback(null);
        }}
      />
      {hasReceipt && (
        <View style={s.receiptToggle}>
          <View style={ui.grow}>
            <Text style={ui.strong}>附带当前已选收据图片解析</Text>
            <Text style={ui.caption}>解析时将复用已选收据，保存消费时不会重复上传。</Text>
          </View>
          <Switch
            accessibilityLabel="附带收据图片解析"
            value={includeReceipt}
            disabled={busy}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            onValueChange={setIncludeReceipt}
          />
        </View>
      )}
      <InlineError message={validationError} />
      <InlineError message={feedback?.message ?? null} />
      {feedback?.kind === 'frozen' && onRefreshLedger && (
        <Button
          compact
          title={feedback.actionLabel ?? '刷新账本状态'}
          variant="secondary"
          disabled={busy}
          onPress={() => {
            onRefreshLedger();
            onClose();
          }}
        />
      )}
      {feedback?.kind !== 'unavailable' && feedback?.kind !== 'frozen' && (
        <Button
          compact
          title={
            feedback?.manualRetryAllowed ? (feedback.actionLabel ?? '手动重试解析') : '生成消费草稿'
          }
          loading={busy}
          onPress={() => {
            void parse();
          }}
        />
      )}
      <Button
        compact
        title={feedback?.kind === 'unavailable' ? '改用手填' : '取消'}
        variant="quiet"
        disabled={busy}
        onPress={onClose}
      />
    </Sheet>
  );
}

const s = StyleSheet.create({
  receiptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
