import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Touch } from './Touch';
import { colors } from '@/theme/tokens';

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <Touch
      accessibilityRole="button"
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      disabled={loading || disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'quiet' && styles.quiet,
        variant === 'danger' && styles.danger,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.text, variant === 'danger' && { color: colors.danger }]}>
            {title}
          </Text>
        </View>
      )}
    </Touch>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  text: { fontSize: 16, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondary: { backgroundColor: colors.surface },
  quiet: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.peach },
});
