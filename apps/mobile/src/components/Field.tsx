import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { FigmaAsset, figmaAssets, type DesignAsset } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Touch } from './Touch';
import { ui } from './Screen';
import { InlineError } from './Feedback';

export function Field({
  label,
  icon,
  trailingIcon,
  secureTextEntry,
  error,
  passwordHiddenIcon,
  variant = 'default',
  ...props
}: TextInputProps & {
  label: string;
  icon?: DesignAsset;
  trailingIcon?: DesignAsset;
  error?: string;
  passwordHiddenIcon?: DesignAsset;
  variant?: 'default' | 'inset' | 'compact' | 'panel';
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const input = (
    <TextInput
      {...props}
      accessibilityLabel={label}
      placeholderTextColor={colors.muted}
      secureTextEntry={Boolean(secureTextEntry && !visible)}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        props.multiline && { minHeight: 76, textAlignVertical: 'top' },
        props.style,
        variant === 'inset' && styles.insetInput,
        variant === 'compact' && styles.compactInput,
        variant === 'panel' && styles.panelInput,
      ]}
    />
  );
  return (
    <View style={{ gap: variant === 'compact' ? 4 : variant === 'panel' ? 12 : 8 }}>
      <View style={variant === 'inset' ? styles.labelRow : undefined}>
        {variant === 'inset' && <View style={styles.labelMarker} />}
        <Text
          style={[
            variant === 'inset' ? ui.muted : ui.caption,
            variant === 'panel' && styles.panelLabel,
          ]}
        >
          {label}
        </Text>
      </View>
      <View
        style={[
          styles.field,
          variant === 'inset' && styles.inset,
          variant === 'compact' && styles.compactField,
          variant === 'panel' && styles.panelField,
          focused && styles.focused,
          error && { borderColor: colors.danger },
        ]}
      >
        {icon && <FigmaAsset asset={icon} />}
        {variant === 'inset' ? (
          <View style={ui.grow}>
            <Text style={ui.caption}>{label}</Text>
            {input}
          </View>
        ) : (
          input
        )}
        {trailingIcon && <FigmaAsset asset={trailingIcon} />}
        {secureTextEntry && (
          <Touch
            accessibilityLabel={visible ? '隐藏密码' : '显示密码'}
            disabled={props.editable === false}
            onPress={() => setVisible(!visible)}
            style={styles.eye}
          >
            <FigmaAsset
              asset={
                visible
                  ? passwordHiddenIcon
                    ? figmaAssets['5-62'].imgIconEyeOff
                    : figmaAssets['5-30'].imgIconEye
                  : (passwordHiddenIcon ?? figmaAssets['5-62'].imgIconEyeOff)
              }
            />
          </Touch>
        )}
      </View>
      <InlineError message={error} />
    </View>
  );
}
const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelMarker: { width: 3, height: 14, borderRadius: 2, backgroundColor: colors.primary },
  inset: { borderWidth: 1.5, borderColor: colors.surface, paddingVertical: 12, minHeight: 72 },
  insetInput: { flex: undefined, paddingVertical: 0 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  panelField: { minHeight: 50, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14 },
  panelInput: { paddingVertical: 14, fontSize: 14, lineHeight: 20 },
  panelLabel: { fontSize: 13, lineHeight: 19 },
  compactField: { minHeight: 44 },
  compactInput: { paddingVertical: 8 },
  focused: { borderColor: colors.primary },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
});
