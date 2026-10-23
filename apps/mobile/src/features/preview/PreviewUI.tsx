import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme/tokens';
import { ui } from '@/components/Screen';
import { Touch } from '@/components/Touch';
import { FigmaAsset, figmaAssets, type DesignAsset } from '@/icons/FigmaAsset';

export function Avatar({
  name,
  index = 0,
  size = 40,
}: {
  name: string;
  index?: number;
  size?: number;
}) {
  const palette = [colors.mint, colors.sky, colors.peach, colors.lavender];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette[index % 4],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size < 32 ? 12 : 17, fontWeight: '700', color: colors.text }}>
        {name}
      </Text>
    </View>
  );
}
export function AvatarGroup() {
  return (
    <View style={{ flexDirection: 'row', paddingLeft: 6 }}>
      {['安', '白', '陈', '丁'].map((name, i) => (
        <View
          key={name}
          style={{ marginLeft: -6, borderWidth: 2, borderColor: colors.surface, borderRadius: 18 }}
        >
          <Avatar name={name} index={i} size={24} />
        </View>
      ))}
    </View>
  );
}
export function Note({ title, children }: { title?: string; children: string }) {
  return (
    <View style={styles.note}>
      <FigmaAsset asset={figmaAssets['5-100'].imgIconInfo} />
      <View style={[ui.grow, { gap: 4 }]}>
        {title && <Text style={ui.strong}>{title}</Text>}
        <Text style={ui.muted}>{children}</Text>
      </View>
    </View>
  );
}
export function Chips({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Touch
          key={option}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === option }}
          onPress={() => onChange(option)}
          style={[styles.chip, value === option && styles.selected]}
        >
          <Text style={[ui.body, value === option && { fontWeight: '600' }]}>{option}</Text>
        </Touch>
      ))}
    </View>
  );
}
export function Row({
  title,
  detail,
  icon,
  onPress,
}: {
  title: string;
  detail?: string;
  icon?: DesignAsset;
  onPress: () => void;
}) {
  return (
    <Touch onPress={onPress} style={styles.row}>
      <View style={ui.row}>
        {icon && (
          <View style={styles.tile}>
            <FigmaAsset asset={icon} />
          </View>
        )}
        <Text style={[ui.strong, ui.grow]}>{title}</Text>
        {detail && <Text style={ui.muted}>{detail}</Text>}
        <FigmaAsset asset={figmaAssets['5-358'].imgIconChevronRight} />
      </View>
    </Touch>
  );
}
export function PreviewTabs({ active }: { active: 'books' | 'profile' }) {
  return (
    <View style={styles.tabs}>
      {(['books', 'profile'] as const).map((tab) => (
        <Touch
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab }}
          onPress={() => {
            if (tab !== active) router.replace(tab === 'books' ? '/preview' : '/preview/profile');
          }}
          style={{ flex: 1 }}
        >
          <View style={styles.tab}>
            <FigmaAsset
              asset={
                tab === 'books'
                  ? active === 'books'
                    ? figmaAssets['3-2'].imgIconLedger
                    : figmaAssets['5-358'].imgIconLedger
                  : active === 'profile'
                    ? figmaAssets['5-358'].imgIconUser
                    : figmaAssets['3-2'].imgIconUser
              }
            />
            <Text style={[ui.caption, active === tab && { color: colors.text, fontWeight: '700' }]}>
              {tab === 'books' ? '账本' : '我的'}
            </Text>
          </View>
        </Touch>
      ))}
    </View>
  );
}
export function usePreviewNotice() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  return {
    notify: (text = '当前为界面预览，尚未接入此功能。') => setMessage(text),
    notice: message ? (
      <View accessibilityLiveRegion="polite" style={styles.notice}>
        <Text style={ui.muted}>{message}</Text>
      </View>
    ) : null,
  };
}
const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    gap: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    minWidth: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primarySoft },
  row: { minHeight: 54, justifyContent: 'center', paddingVertical: 8 },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 },
  tab: { minHeight: 52, gap: 2, alignItems: 'center', justifyContent: 'center' },
  notice: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12 },
});
