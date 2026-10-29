import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Touch } from '@/components/Touch';
import { FigmaAsset, type DesignAsset } from '@/icons/FigmaAsset';
import { profileAssets } from '@/icons/profile-assets';
import { colors } from '@/theme/tokens';

export type MenuItem = {
  key: string;
  title: string;
  icon: DesignAsset;
  subtitle?: string;
  value?: string;
  onPress: () => void;
};

/** Figma 09.01 grouped list: 36 px warm icon tiles, inset dividers and a trailing chevron. */
export function MenuGroup({
  title,
  items,
  disabled = false,
}: {
  title: string;
  items: MenuItem[];
  disabled?: boolean;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text style={styles.caption}>{title}</Text>
      </View>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <View style={styles.divider} />}
          <Touch
            accessibilityLabel={item.title}
            accessibilityValue={
              item.subtitle || item.value ? { text: item.subtitle ?? item.value } : undefined
            }
            disabled={disabled}
            onPress={item.onPress}
          >
            {/* Touch wraps children in its own animated view, so the row layout lives inside. */}
            <View style={styles.row}>
              <IconTile icon={item.icon} />
              <View style={styles.text}>
                <Text numberOfLines={1} style={styles.title}>
                  {item.title}
                </Text>
                {item.subtitle && <Text style={styles.caption}>{item.subtitle}</Text>}
              </View>
              {item.value && (
                <Text numberOfLines={1} style={styles.value}>
                  {item.value}
                </Text>
              )}
              <FigmaAsset asset={profileAssets.chevron} />
            </View>
          </Touch>
        </Fragment>
      ))}
    </View>
  );
}

export function IconTile({ icon }: { icon: DesignAsset }) {
  return (
    <View style={styles.tile}>
      <FigmaAsset asset={icon} />
    </View>
  );
}

/** Panel row: 24 px line icon, label, trailing value and an optional entry chevron. */
export function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: DesignAsset;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content: ReactNode = (
    <View style={styles.setting}>
      <FigmaAsset asset={icon} />
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={onPress ? styles.settingAction : styles.value}>{value}</Text>
      {onPress && <FigmaAsset asset={profileAssets.chevron} />}
    </View>
  );
  return onPress ? (
    <Touch accessibilityLabel={label} onPress={onPress}>
      {content}
    </Touch>
  ) : (
    <View accessible accessibilityLabel={`${label}，${value}`}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    paddingBottom: 6,
  },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  caption: { fontSize: 12, lineHeight: 17, color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.text },
  value: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: colors.muted },
  divider: { height: 1, marginLeft: 64, marginRight: 16, backgroundColor: colors.border },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  settingLabel: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
  settingAction: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
});
