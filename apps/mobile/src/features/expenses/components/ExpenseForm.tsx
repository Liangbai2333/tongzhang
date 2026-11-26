import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  createExpenseBodySchema,
  updateExpenseBodySchema,
  type Category,
} from '@tongzhang/contracts';
import { formatYuan } from '@tongzhang/domain';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Touch } from '@/components/Touch';
import { InlineError, requestErrorMessage } from '@/components/Feedback';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { useReceipt } from '@/features/images/use-receipt';
import { ReceiptImage } from '@/features/images/components/ReceiptImage';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { colors } from '@/theme/tokens';
import { expensesApi } from '../api';
import {
  categories,
  categoryLabel,
  expenseCents,
  expenseWriteConflict,
  splitInput,
  splitLabels,
  splitPreview,
  splitSettingsFromExpense,
  today,
  type ExpenseDetail,
  type ExpenseWriteConflict,
  type Ledger,
  type SplitSettings,
} from '../presentation';
import { ChoiceSheet } from './ChoiceSheet';
import { DateSheet } from './DateSheet';
import { SplitEditorSheet } from './SplitEditorSheet';
import { ExpenseRow, MemberAvatar, expenseStyles } from './ExpenseUI';
import { AiDraftSheet } from './AiDraftSheet';
import type { AppliedExpenseDraft } from '../ai-draft';

type ExpenseFormProps = {
  ledger: Ledger;
  userId: string;
  expense?: ExpenseDetail;
  onCancel?: () => void;
  onSaved?: (saved: ExpenseDetail) => void;
  onConflictRefresh?: (kind: ExpenseWriteConflict['kind']) => void;
  onRefreshLedger?: () => void;
};

export function ExpenseForm({
  ledger,
  userId,
  expense,
  onCancel,
  onSaved,
  onConflictRefresh,
  onRefreshLedger,
}: ExpenseFormProps) {
  const editing = expense !== undefined;
  const client = useQueryClient();
  const write = useIdempotentWrite();
  const receipt = useReceipt(ledger.id);
  const initialSplit = useRef<SplitSettings>(
    expense
      ? splitSettingsFromExpense(expense)
      : { mode: 'EQUAL', memberIds: ledger.members.map((m) => m.id), values: {} },
  );
  const initialDate = useRef(expense ? expense.occurredOn : today());
  const initialAmount = useRef(expense ? formatYuan(BigInt(expense.amountCents)) : '');
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(initialAmount.current);
  const [category, setCategory] = useState<Category>(expense?.category ?? 'DINING');
  const [date, setDate] = useState(initialDate.current);
  const [payer, setPayer] = useState(expense?.payerMemberId ?? ledger.myMemberId);
  const [note, setNote] = useState(expense?.note ?? '');
  const [split, setSplit] = useState<SplitSettings>(initialSplit.current);
  const [existingReceiptId, setExistingReceiptId] = useState<string | null>(
    expense?.receiptImageId ?? null,
  );
  const [panel, setPanel] = useState<
    'category' | 'payer' | 'date' | 'split' | 'receipt' | 'discard' | 'ai-draft' | null
  >(null);
  const [draftApplied, setDraftApplied] = useState(false);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);
  const busy = submitting || write.busy || receipt.busy;
  const disabled = busy || write.uncertain;
  const conflict = editing ? expenseWriteConflict(write.error) : null;
  const dirty = editing
    ? Boolean(
        title !== expense.title ||
        amount !== initialAmount.current ||
        category !== expense.category ||
        date !== initialDate.current ||
        payer !== expense.payerMemberId ||
        note !== (expense.note ?? '') ||
        receipt.value !== null ||
        existingReceiptId !== expense.receiptImageId ||
        JSON.stringify(split) !== JSON.stringify(initialSplit.current),
      )
    : Boolean(
        title ||
        amount ||
        note ||
        receipt.value ||
        existingReceiptId !== null ||
        category !== 'DINING' ||
        date !== initialDate.current ||
        payer !== ledger.myMemberId ||
        split.mode !== 'EQUAL' ||
        split.memberIds.length !== ledger.members.length,
      );
  const leave = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/ledgers/[ledgerId]', params: { ledgerId: ledger.id } });
  };
  const back = () => {
    if (busy || write.uncertain) return;
    if (dirty) {
      Keyboard.dismiss();
      setPanel('discard');
    } else leave();
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => subscription.remove();
  });
  let total = 0n;
  let preview: ReturnType<typeof splitPreview> = [];
  try {
    total = expenseCents(amount);
    preview = splitPreview(total, split);
  } catch {
    /* Unfinished form has no fabricated monetary preview. */
  }
  const payerName = ledger.members.find((m) => m.id === payer)?.username ?? '';
  const open = (next: typeof panel) => {
    if (disabled) return;
    Keyboard.dismiss();
    if (next === 'split' && total === 0n) {
      setError('请先填写有效消费金额');
      return;
    }
    setPanel(next);
  };
  async function save() {
    if (locked.current || busy) return;
    setError(null);
    let parsedBody: ReturnType<typeof createExpenseBodySchema.safeParse>['data'];
    let parsedUpdateBody: ReturnType<typeof updateExpenseBodySchema.safeParse>['data'];
    try {
      const raw = {
        title: title.trim(),
        amountCents: expenseCents(amount).toString(),
        category,
        occurredOn: date,
        payerMemberId: payer,
        note: note.trim() || null,
        ...splitInput(split),
      };
      if (editing) {
        const parsed = updateExpenseBodySchema.safeParse({ ...raw, version: expense.version });
        if (!parsed.success) {
          setError('请核对消费名称、日期、付款人、备注和分摊设置');
          return;
        }
        parsedUpdateBody = parsed.data;
      } else {
        const parsed = createExpenseBodySchema.safeParse(raw);
        if (!parsed.success) {
          setError('请核对消费名称、日期、付款人、备注和分摊设置');
          return;
        }
        parsedBody = parsed.data;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请核对消费信息');
      return;
    }
    locked.current = true;
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      let receiptImageId: string | null = existingReceiptId;
      if (receipt.value) {
        const uploaded = await receipt.upload();
        if (uploaded === undefined) return;
        receiptImageId = uploaded;
      }
      if (editing && parsedUpdateBody) {
        const payload = { ...parsedUpdateBody, receiptImageId };
        const result = await write.submit(payload, (key) =>
          expensesApi.updateExpense(
            { params: { ledgerId: ledger.id, expenseId: expense.id }, query: {}, body: payload },
            { idempotencyKey: key },
          ),
        );
        if (result) {
          void client.invalidateQueries({ queryKey: ['user', userId] });
          onSaved?.(result.data);
        }
      } else if (parsedBody) {
        const payload = { ...parsedBody, receiptImageId };
        const result = await write.submit(payload, (key) =>
          expensesApi.createExpense(
            { params: { ledgerId: ledger.id }, query: {}, body: payload },
            { idempotencyKey: key },
          ),
        );
        if (result) {
          void client.invalidateQueries({ queryKey: ['user', userId] });
          if (onSaved) onSaved(result.data);
          else
            router.replace({
              pathname: '/ledgers/[ledgerId]/expenses/[expenseId]',
              params: { ledgerId: ledger.id, expenseId: result.data.id },
            });
        }
      }
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }
  function applyDraft(applied: AppliedExpenseDraft) {
    setTitle(applied.values.title);
    setAmount(applied.values.amount);
    setCategory(applied.values.category);
    setDate(applied.values.date);
    setPayer(applied.values.payer);
    setNote(applied.values.note);
    setSplit(applied.values.split);
    setExistingReceiptId(applied.values.existingReceiptId);
    setDraftWarnings(applied.warnings);
    setDraftApplied(true);
    setError(null);
    setPanel(null);
  }
  const hasReceipt = Boolean(receipt.value || existingReceiptId);
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Screen
        title={editing ? '编辑消费' : '记一笔'}
        variant="ledger"
        contentStyle={expenseStyles.content}
        backDisabled={disabled}
        onBack={back}
        footer={
          <>
            <InlineError message={error} />
            <InlineError
              message={
                conflict ? conflict.message : write.error ? requestErrorMessage(write.error) : null
              }
            />
            <InlineError message={receipt.error} />
            {conflict && onConflictRefresh && (
              <Button
                compact
                title={conflict.actionLabel}
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  write.reset();
                  onConflictRefresh(conflict.kind);
                }}
              />
            )}
            {write.uncertain && (
              <Text style={ui.caption}>
                {editing
                  ? '网络中断，修改结果未确认。重试不会重复提交。'
                  : '网络中断，结果未确认。重试不会重复记账。'}
              </Text>
            )}
            <Button
              title={write.uncertain ? '重试保存' : editing ? '保存修改' : '保存消费'}
              loading={busy}
              onPress={() => {
                void save();
              }}
            />
            {write.uncertain && (
              <Button
                compact
                title="回到账本查看"
                variant="quiet"
                disabled={busy}
                onPress={() =>
                  router.replace({
                    pathname: '/ledgers/[ledgerId]',
                    params: { ledgerId: ledger.id },
                  })
                }
              />
            )}
          </>
        }
      >
        {!editing && (
          <View style={s.aiCard}>
            <View style={ui.between}>
              <View style={ui.grow}>
                <Text style={ui.strong}>AI 辅助填写</Text>
                <Text style={ui.caption}>一句话或收据生成草稿，仅回填表单，需核对后手动保存。</Text>
              </View>
              <Button
                compact
                title="AI 生成草稿"
                variant="secondary"
                disabled={disabled}
                onPress={() => open('ai-draft')}
              />
            </View>
            {draftApplied && (
              <View style={s.draftNotice}>
                <View style={s.draftNoticeHeader}>
                  <Text
                    accessibilityLiveRegion="polite"
                    numberOfLines={1}
                    style={s.draftNoticeTitle}
                  >
                    AI 草稿已回填，请核对后手动点击「保存消费」
                  </Text>
                  <Touch
                    accessibilityRole="button"
                    accessibilityLabel="收起草稿提示"
                    onPress={() => setDraftApplied(false)}
                  >
                    <Text style={ui.caption}>收起</Text>
                  </Touch>
                </View>
                {draftWarnings.map((warning, index) => (
                  <Text key={`${index}-${warning}`} style={s.draftWarning}>
                    · {warning}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
        <View style={s.amountCard}>
          <Text style={expenseStyles.label}>消费金额</Text>
          <View style={s.amountRow}>
            <Text style={s.currency}>¥</Text>
            <TextInput
              accessibilityLabel="消费金额"
              placeholder="0.00"
              value={amount}
              keyboardType="decimal-pad"
              editable={!disabled}
              onChangeText={(value) => {
                setAmount(value);
                setError(null);
              }}
              style={s.amount}
            />
          </View>
          <Text style={s.hint}>金额须大于 0，最多两位小数</Text>
        </View>
        <Field
          label="消费名称"
          value={title}
          maxLength={60}
          editable={!disabled}
          onChangeText={setTitle}
          placeholder="这笔钱花在了哪里？"
          trailingIcon={expenseAssets.edit}
          variant="compact"
        />
        <View style={expenseStyles.infoCard}>
          <ExpenseRow label="消费类别" disabled={disabled} onPress={() => open('category')}>
            <Text style={ui.strong}>{categoryLabel(category)}</Text>
          </ExpenseRow>
        </View>
        <View style={expenseStyles.infoCard}>
          <ExpenseRow label="付款人" disabled={disabled} onPress={() => open('payer')}>
            <MemberAvatar name={payerName} />
            <Text style={[ui.strong, { flexShrink: 1 }]}>{payerName}</Text>
          </ExpenseRow>
          <View style={ui.divider} />
          <ExpenseRow label="日期" disabled={disabled} onPress={() => open('date')}>
            <Text style={ui.strong}>{date}</Text>
          </ExpenseRow>
        </View>
        <View style={expenseStyles.infoCard}>
          <ExpenseRow label="参与分摊" disabled={disabled} onPress={() => open('split')}>
            <Text style={ui.strong}>{split.memberIds.length} 位成员</Text>
          </ExpenseRow>
          <View style={ui.divider} />
          <ExpenseRow label="分摊方式" disabled={disabled} onPress={() => open('split')}>
            <Text style={s.splitBadge}>{splitLabels[split.mode]}</Text>
          </ExpenseRow>
          <View style={ui.divider} />
          <View style={s.summary}>
            <Text style={[ui.caption, { color: colors.success, flex: 1 }]}>
              {preview.length
                ? `${preview.length} 人参与 · 合计 ¥${formatYuan(preview.reduce((sum, m) => sum + m.amountCents, 0n))}`
                : '填写金额并核对分摊设置'}
            </Text>
            {preview.length > 0 && <FigmaAsset asset={expenseAssets.summaryCheck} />}
          </View>
        </View>
        <View style={expenseStyles.card}>
          <Text style={ui.heading}>补充信息</Text>
          <Field
            label="备注（选填）"
            value={note}
            maxLength={500}
            multiline
            editable={!disabled}
            onChangeText={setNote}
          />
          <Text style={expenseStyles.label}>收据图片（选填，最多 1 张）</Text>
          <View style={ui.row}>
            <Button
              style={s.receiptButton}
              title="从相册选择"
              variant="secondary"
              icon={<FigmaAsset asset={expenseAssets.album} />}
              disabled={disabled}
              onPress={() => {
                void receipt.select(false);
              }}
            />
            <Button
              style={s.receiptButton}
              title="拍摄收据"
              variant="secondary"
              icon={<FigmaAsset asset={expenseAssets.camera} />}
              disabled={disabled}
              onPress={() => {
                void receipt.select(true);
              }}
            />
          </View>
          {hasReceipt && (
            <View style={s.receipt}>
              <View style={ui.row}>
                <Touch
                  accessibilityLabel="收据预览"
                  disabled={busy}
                  style={ui.grow}
                  onPress={() => open('receipt')}
                >
                  <View style={ui.row}>
                    {receipt.value ? (
                      <Image
                        source={{ uri: receipt.value.uri }}
                        cachePolicy="none"
                        contentFit="cover"
                        style={s.thumbnail}
                      />
                    ) : (
                      <View style={s.existingReceiptBadge}>
                        <FigmaAsset asset={expenseAssets.album} />
                      </View>
                    )}
                    <View style={ui.grow}>
                      <Text style={ui.strong}>{receipt.value ? '已添加收据' : '已关联收据'}</Text>
                      <Text style={ui.caption}>点按查看大图</Text>
                    </View>
                  </View>
                </Touch>
                <Touch
                  accessibilityLabel="移除收据"
                  disabled={disabled}
                  onPress={() => {
                    receipt.remove();
                    setExistingReceiptId(null);
                  }}
                  style={s.remove}
                >
                  <FigmaAsset asset={expenseAssets.remove} />
                </Touch>
              </View>
            </View>
          )}
        </View>
        <ChoiceSheet
          visible={panel === 'category'}
          title="选择消费类别"
          value={category}
          options={categories}
          onSelect={(value) => {
            setCategory(value as Category);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
        <ChoiceSheet
          visible={panel === 'payer'}
          title="谁付的钱？"
          value={payer}
          options={ledger.members.map((m) => ({
            value: m.id,
            label: m.username + (m.userId === userId ? '（我）' : ''),
          }))}
          onSelect={(value) => {
            setPayer(value);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
        <DateSheet
          visible={panel === 'date'}
          value={date}
          onApply={(value) => {
            setDate(value);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
        <SplitEditorSheet
          visible={panel === 'split'}
          value={split}
          total={total}
          title={title}
          members={ledger.members}
          onApply={(value) => {
            setSplit(value);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
        <Sheet
          visible={panel === 'receipt'}
          title="收据预览"
          variant="members"
          onClose={() => setPanel(null)}
        >
          {receipt.value ? (
            <Image
              accessibilityLabel="待上传收据图片"
              source={{ uri: receipt.value.uri }}
              cachePolicy="none"
              contentFit="contain"
              style={{ height: 340, width: '100%' }}
            />
          ) : (
            existingReceiptId && <ReceiptImage imageId={existingReceiptId} />
          )}
        </Sheet>
        {!editing && (
          <AiDraftSheet
            visible={panel === 'ai-draft'}
            ledger={ledger}
            referenceDate={date}
            currentValues={{
              title,
              amount,
              category,
              date,
              payer,
              note,
              split,
              existingReceiptId,
            }}
            hasSelectedReceipt={receipt.value !== null}
            uploadReceipt={receipt.upload}
            onApplyDraft={applyDraft}
            onRefreshLedger={onRefreshLedger}
            onClose={() => setPanel(null)}
          />
        )}
        <Sheet
          visible={panel === 'discard'}
          title={editing ? '放弃未保存的修改？' : '放弃未保存的消费？'}
          variant="members"
          onClose={() => setPanel(null)}
        >
          <Text style={ui.body}>
            {editing ? '离开后，本次修改的内容不会保存。' : '离开后，已填写的内容不会保存。'}
          </Text>
          <Button compact title="继续填写" onPress={() => setPanel(null)} />
          <Button compact title="放弃并返回" variant="quiet" onPress={leave} />
        </Sheet>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  aiCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  draftNotice: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  draftNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  draftNoticeTitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.warning,
  },
  draftWarning: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text,
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 3,
    boxShadow: '0px 4px 8px rgba(0,0,0,0.05)',
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  currency: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.text },
  amount: {
    flex: 1,
    minWidth: 0,
    fontSize: 44,
    lineHeight: 53,
    fontWeight: '700',
    padding: 0,
    color: colors.text,
  },
  hint: { fontSize: 11, lineHeight: 16, color: colors.muted },
  splitBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  summary: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  receiptButton: { flex: 1, paddingHorizontal: 8 },
  receipt: { backgroundColor: colors.primarySoft, padding: 12, gap: 8, borderRadius: 16 },
  thumbnail: { width: 56, height: 56, borderRadius: 12 },
  existingReceiptBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
