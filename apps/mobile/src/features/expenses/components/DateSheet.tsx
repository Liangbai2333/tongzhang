import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { localDateSchema } from '@tongzhang/contracts';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Touch } from '@/components/Touch';
import { InlineError } from '@/components/Feedback';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
export function DateSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onApply: (date: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setMonth(value.slice(0, 7));
      setError(null);
    }
  }, [visible, value]);
  const [year, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(0);
  first.setFullYear(year, m - 1, 1);
  const start = (first.getDay() + 6) % 7;
  const last = new Date(0);
  last.setFullYear(year, m, 0);
  const days = last.getDate();
  function shift(delta: number) {
    const d = new Date(0);
    d.setFullYear(year, m - 1 + delta, 1);
    if (d.getFullYear() < 1 || d.getFullYear() > 9999) return;
    setMonth(
      `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }
  return (
    <Sheet visible={visible} title="消费日期" variant="members" onClose={onClose}>
      <View style={ui.between}>
        <Button compact title="上月" variant="quiet" onPress={() => shift(-1)} />
        <Text style={ui.strong}>
          {year} 年 {m} 月
        </Text>
        <Button compact title="下月" variant="quiet" onPress={() => shift(1)} />
      </View>
      <View style={s.grid}>
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <View key={day} style={s.cell}>
            <Text style={ui.caption}>{day}</Text>
          </View>
        ))}
        {Array.from({ length: start + days }, (_, i) => {
          const day = i - start + 1;
          if (day < 1) return <View key={i} style={s.cell} />;
          const date = `${month}-${String(day).padStart(2, '0')}`;
          return (
            <Touch
              key={i}
              accessibilityRole="radio"
              accessibilityLabel={date}
              accessibilityState={{ selected: date === draft }}
              style={[s.cell, date === draft && s.selected]}
              onPress={() => {
                setDraft(date);
                setError(null);
              }}
            >
              <Text style={ui.body}>{day}</Text>
            </Touch>
          );
        })}
      </View>
      <Field
        label="日期 YYYY-MM-DD"
        value={draft}
        maxLength={10}
        autoCorrect={false}
        onChangeText={setDraft}
      />
      <InlineError message={error} />
      <Button
        compact
        title="完成日期选择"
        onPress={() => {
          if (!localDateSchema.safeParse(draft).success || draft.startsWith('0000')) {
            setError('请输入有效日期 YYYY-MM-DD');
            return;
          }
          onApply(draft);
        }}
      />
    </Sheet>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary, borderRadius: 20 },
});
