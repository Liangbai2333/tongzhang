import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { InlineError } from '@/components/Feedback';
import { colors } from '@/theme/tokens';

/** One editable value preserves paste, selection and the existing alphanumeric API contract. */
export function InviteCodeField({
  value,
  onChangeText,
  disabled,
  error,
}: {
  value: string;
  onChangeText: (value: string) => void;
  disabled: boolean;
  error: string | null;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <View style={styles.marker} />
        <Text style={styles.label}>6 位邀请码</Text>
      </View>
      <View style={[styles.field, error && styles.error, disabled && styles.disabled]}>
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.cells}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.cell,
                focused && i === Math.min(value.length, 5) && styles.currentCell,
              ]}
            >
              <Text style={styles.character}>{value[i] ?? ''}</Text>
            </View>
          ))}
        </View>
        <TextInput
          accessibilityLabel="6 位邀请码"
          accessibilityHint="输入或粘贴六位字母和数字邀请码"
          value={value}
          onChangeText={onChangeText}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={!disabled}
          caretHidden
          style={styles.input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          underlineColorAndroid="transparent"
        />
      </View>
      <InlineError message={error} />
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marker: { width: 4, height: 16, borderRadius: 2, backgroundColor: colors.primary },
  label: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: colors.text },
  field: {
    height: 88,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cells: { width: '100%', maxWidth: 280, flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 52,
    maxWidth: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentCell: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,200,106,0.25)',
  },
  character: { fontSize: 24, lineHeight: 35, fontWeight: '700', color: colors.text },
  input: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 24,
  },
  error: { borderColor: colors.danger },
  disabled: { opacity: 0.45 },
});
