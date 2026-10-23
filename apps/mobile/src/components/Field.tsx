import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { FigmaAsset, figmaAssets, type DesignAsset } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Touch } from './Touch';
import { ui } from './Screen';

export function Field({
  label,
  icon,
  secureTextEntry,
  ...props
}: TextInputProps & { label: string; icon?: DesignAsset }) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.caption}>{label}</Text>
      <View style={[styles.field, focused && styles.focused]}>
        {icon && <FigmaAsset asset={icon} />}
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry && !visible}
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
          ]}
        />
        {secureTextEntry && (
          <Touch
            accessibilityLabel={visible ? '隐藏密码' : '显示密码'}
            onPress={() => setVisible(!visible)}
            style={styles.eye}
          >
            <FigmaAsset
              asset={visible ? figmaAssets['5-30'].imgIconEye : figmaAssets['5-62'].imgIconEyeOff}
            />
          </Touch>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
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
