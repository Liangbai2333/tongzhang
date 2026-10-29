import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { createExpenseBodySchema, uuidSchema, type Category } from '@tongzhang/contracts';
import { formatYuan } from '@tongzhang/domain';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Touch } from '@/components/Touch';
import { InlineError, RequestState, requestErrorMessage } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { ledgersApi } from '@/features/ledgers/api';
import { ledgersKeys } from '@/features/ledgers/query-keys';
import { useReceipt } from '@/features/images/use-receipt';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { colors } from '@/theme/tokens';
import { expensesApi } from '../api';
import {
  categories,
  categoryLabel,
  expenseCents,
  splitInput,
  splitLabels,
  splitPreview,
  today,
  type Ledger,
  type SplitSettings,
} from '../presentation';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { DateSheet } from '../components/DateSheet';
import { SplitEditorSheet } from '../components/SplitEditorSheet';
import { ExpenseRow, MemberAvatar, expenseStyles } from '../components/ExpenseUI';

export default function CreateExpenseScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    ledgersKeys.ledger(user!.id, ledgerId),
    () => ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
    valid,
  );
  const loading = valid && blocksContent(query);
  if (!valid || loading || query.isError || !query.data)
    return (
      <Screen title="记一笔" variant="ledger">
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取账本' : '账本地址无效'}
          description="需要在线核验成员和账本状态。"
          error={query.error}
          onRetry={
            valid
              ? () => {
                  void query.refetch();
                }
              : undefined
          }
        />
      </Screen>
    );
  if (query.data.data.status !== 'ACTIVE')
    return (
      <Screen title="记一笔" variant="ledger">
        <Text style={ui.body}>账本已冻结，无法新增消费。</Text>
      </Screen>
    );
  return <ExpenseForm ledger={query.data.data} userId={user!.id} />;
}
function ExpenseForm({ ledger, userId }: { ledger: Ledger; userId: string }) {
  const client = useQueryClient();
  const write = useIdempotentWrite();
  const receipt = useReceipt(ledger.id);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('DINING');
  const [date, setDate] = useState(today);
  const [payer, setPayer] = useState(ledger.myMemberId);
  const [note, setNote] = useState('');
  const [split, setSplit] = useState<SplitSettings>({
    mode: 'EQUAL',
    memberIds: ledger.members.map((m) => m.id),
    values: {},
  });
  const [panel, setPanel] = useState<
    'category' | 'payer' | 'date' | 'split' | 'receipt' | 'discard' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);
  const busy = submitting || write.busy || receipt.busy;
  const disabled = busy || write.uncertain;
  const dirty = Boolean(
    title ||
    amount ||
    note ||
    receipt.value ||
    category !== 'DINING' ||
    date !== today() ||
    payer !== ledger.myMemberId ||
    split.mode !== 'EQUAL' ||
    split.memberIds.length !== ledger.members.length,
  );
  const leave = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/ledgers/[ledgerId]', params: { ledgerId: ledger.id } });
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
    let body;
    try {
      body = createExpenseBodySchema.safeParse({
        title: title.trim(),
        amountCents: expenseCents(amount).toString(),
        category,
        occurredOn: date,
        payerMemberId: payer,
        note: note.trim() || null,
        ...splitInput(split),
      });
      if (!body.success) {
        setError('请核对消费名称、日期、付款人、备注和分摊设置');
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请核对消费信息');
      return;
    }
    locked.current = true;
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      const receiptImageId = await receipt.upload();
      if (receiptImageId === undefined) return;
      const payload = { ...body.data, receiptImageId };
      const result = await write.submit(payload, (key) =>
        expensesApi.createExpense(
          { params: { ledgerId: ledger.id }, query: {}, body: payload },
          { idempotencyKey: key },
        ),
      );
      if (result) {
        void client.invalidateQueries({ queryKey: ['user', userId] });
        router.replace({
          pathname: '/ledgers/[ledgerId]/expenses/[expenseId]',
          params: { ledgerId: ledger.id, expenseId: result.data.id },
        });
      }
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Screen
        title="记一笔"
        variant="ledger"
        contentStyle={expenseStyles.content}
        backDisabled={disabled}
        onBack={back}
        footer={
          <>
            <InlineError message={error} />
            <InlineError message={write.error ? requestErrorMessage(write.error) : null} />
            <InlineError message={receipt.error} />
            {write.uncertain && (
              <Text style={ui.caption}>网络中断，结果未确认。重试不会重复记账。</Text>
            )}
            <Button
              title={write.uncertain ? '重试保存' : '保存消费'}
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
          {receipt.value && (
            <View style={s.receipt}>
              <View style={ui.row}>
                <Touch
                  accessibilityLabel="收据预览"
                  disabled={busy}
                  style={ui.grow}
                  onPress={() => open('receipt')}
                >
                  <View style={ui.row}>
                    <Image
                      source={{ uri: receipt.value.uri }}
                      cachePolicy="none"
                      contentFit="cover"
                      style={s.thumbnail}
                    />
                    <View style={ui.grow}>
                      <Text style={ui.strong}>已添加收据</Text>
                      <Text style={ui.caption}>点按查看大图</Text>
                    </View>
                  </View>
                </Touch>
                <Touch
                  accessibilityLabel="移除收据"
                  disabled={disabled}
                  onPress={receipt.remove}
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
          {receipt.value && (
            <Image
              accessibilityLabel="待上传收据图片"
              source={{ uri: receipt.value.uri }}
              cachePolicy="none"
              contentFit="contain"
              style={{ height: 340, width: '100%' }}
            />
          )}
        </Sheet>
        <Sheet
          visible={panel === 'discard'}
          title="放弃未保存的消费？"
          variant="members"
          onClose={() => setPanel(null)}
        >
          <Text style={ui.body}>离开后，已填写的内容不会保存。</Text>
          <Button compact title="继续填写" onPress={() => setPanel(null)} />
          <Button compact title="放弃并返回" variant="quiet" onPress={leave} />
        </Sheet>
      </Screen>
    </>
  );
}
const s = StyleSheet.create({
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
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
