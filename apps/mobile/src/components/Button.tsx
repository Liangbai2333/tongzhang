import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Touch } from './Touch';
import { colors } from '@/theme/tokens';

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
  style,
  compact = false,
  labelStyle,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'soft' | 'outlined';
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  labelStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      disabled={loading || disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'quiet' && styles.quiet,
        variant === 'danger' && styles.danger,
        variant === 'soft' && styles.soft,
        variant === 'outlined' && styles.outlined,
        compact && styles.compact,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.text, variant === 'danger' && { color: colors.danger }, labelStyle]}>
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
  text: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondary: { backgroundColor: colors.surface },
  quiet: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.peach },
  soft: { backgroundColor: colors.primarySoft },
  outlined: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  compact: { minHeight: 48, borderRadius: 12, paddingHorizontal: 12 },
});
