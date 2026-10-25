import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatYuan } from '@tongzhang/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { ui } from '@/components/Screen';
import { InlineError } from '@/components/Feedback';
import { colors } from '@/theme/tokens';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { MemberAvatar, expenseStyles } from './ExpenseUI';
import { splitLabels, splitPreview, type Ledger, type SplitSettings } from '../presentation';
export function SplitEditorSheet({
  visible,
  value,
  total,
  title,
  members,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: SplitSettings;
  total: bigint;
  title: string;
  members: Ledger['members'];
  onClose: () => void;
  onApply: (value: SplitSettings) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setError(null);
    }
  }, [visible, value]);
  let preview: ReturnType<typeof splitPreview> = [];
  let previewError: string | null = null;
  try {
    preview = splitPreview(total, draft);
  } catch (cause) {
    previewError = cause instanceof Error ? cause.message : '分摊无效';
  }
  return (
    <Sheet visible={visible} title="分摊设置" variant="members" onClose={onClose}>
      <View style={expenseStyles.card}>
        <View style={ui.between}>
          <Text style={[ui.strong, ui.grow]}>{title || '本次消费'}</Text>
          <Text style={ui.heading}>¥{formatYuan(total)}</Text>
        </View>
        <Text style={ui.caption}>预览仅供核对，保存时由服务端重新计算</Text>
      </View>
      <View style={s.modes}>
        {(Object.keys(splitLabels) as SplitSettings['mode'][]).map((mode) => (
          <Touch
            key={mode}
            accessibilityRole="radio"
            accessibilityLabel={splitLabels[mode]}
            accessibilityState={{ selected: draft.mode === mode }}
            onPress={() => {
              setDraft({ ...draft, mode, values: {} });
              setError(null);
            }}
            style={[s.mode, draft.mode === mode && s.active]}
          >
            <View style={[ui.row, { gap: 6 }]}>
              <FigmaAsset
                asset={
                  mode === 'EQUAL'
                    ? draft.mode === mode
                      ? expenseAssets.equalSelected
                      : expenseAssets.equal
                    : mode === 'SHARES'
                      ? draft.mode === mode
                        ? expenseAssets.sharesSelected
                        : expenseAssets.shares
                      : draft.mode === mode
                        ? expenseAssets.amountSelected
                        : expenseAssets.amount
                }
              />
              <Text style={s.modeLabel}>{splitLabels[mode]}</Text>
            </View>
          </Touch>
        ))}
      </View>
      <View style={s.members}>
        <View style={ui.between}>
          <Text style={ui.strong}>参与成员</Text>
          <Text style={ui.caption}>{draft.memberIds.length} 位参与</Text>
        </View>
        {members.map((member, i) => {
          const selected = draft.memberIds.includes(member.id);
          return (
            <View key={member.id} style={s.memberRow}>
              <Touch
                accessibilityRole="checkbox"
                accessibilityLabel={`参与分摊 ${member.username}`}
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  setDraft({
                    ...draft,
                    memberIds: selected
                      ? draft.memberIds.filter((id) => id !== member.id)
                      : [...draft.memberIds, member.id],
                  });
                  setError(null);
                }}
                style={s.memberTarget}
              >
                <View style={[ui.row, { gap: 10 }]}>
                  <View style={[s.checkbox, selected && s.active]}>
                    {selected && <FigmaAsset asset={expenseAssets.check} />}
                  </View>
                  <MemberAvatar name={member.username} index={i} />
                  <Text style={[ui.body, ui.grow]}>{member.username}</Text>
                </View>
              </Touch>
              {selected && draft.mode !== 'EQUAL' && (
                <TextInput
                  accessibilityLabel={`${member.username}${draft.mode === 'SHARES' ? '份数' : '分摊金额'}`}
                  keyboardType={draft.mode === 'SHARES' ? 'number-pad' : 'decimal-pad'}
                  value={draft.values[member.id] ?? (draft.mode === 'SHARES' ? '1' : '')}
                  placeholder={draft.mode === 'SHARES' ? '份' : '0.00'}
                  onChangeText={(text) =>
                    setDraft({ ...draft, values: { ...draft.values, [member.id]: text } })
                  }
                  style={s.input}
                />
              )}
              {(draft.mode !== 'AMOUNT' || !selected) && (
                <Text style={selected ? ui.strong : ui.caption}>
                  {selected
                    ? preview.find((p) => p.memberId === member.id)
                      ? `¥${formatYuan(preview.find((p) => p.memberId === member.id)!.amountCents)}`
                      : '—'
                    : '不参与'}
                </Text>
              )}
            </View>
          );
        })}
        <View style={s.total}>
          <Text style={ui.body}>应摊合计</Text>
          <Text style={ui.strong}>
            {previewError
              ? '待核对'
              : `¥${formatYuan(preview.reduce((sum, p) => sum + p.amountCents, 0n))}`}
          </Text>
        </View>
      </View>
      <InlineError message={error} />
      <Button
        title="完成分摊设置"
        onPress={() => {
          if (previewError) {
            setError(previewError);
            return;
          }
          onApply(draft);
        }}
      />
    </Sheet>
  );
}
const s = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 8 },
  mode: {
    flex: 1,
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: colors.primary },
  modeLabel: { fontSize: 13, fontWeight: '700', color: colors.warning },
  members: { padding: 16, borderRadius: 20, gap: 8, backgroundColor: colors.background },
  memberRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  memberTarget: { flex: 1, minHeight: 48, justifyContent: 'center' },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  input: {
    width: 76,
    minHeight: 44,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    textAlign: 'right',
    fontSize: 14,
    color: colors.text,
  },
  total: {
    backgroundColor: colors.mint,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
});
