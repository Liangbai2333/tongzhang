import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Touch } from '@/components/Touch';
import { ui } from '@/components/Screen';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { colors } from '@/theme/tokens';

export function LedgerActionsMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭添加账本菜单遮罩"
        style={[styles.backdrop, { top: insets.top + 56 }]}
        onPress={onClose}
      />
      <View
        accessibilityViewIsModal
        style={[styles.menu, { top: insets.top + 56, width: Math.min(280, width - 48), right: 24 }]}
      >
        <View style={ui.between}>
          <Text accessibilityRole="header" style={ui.heading}>
            添加账本
          </Text>
          <Touch accessibilityLabel="关闭添加账本菜单" style={styles.close} onPress={onClose}>
            <FigmaAsset asset={figmaAssets['157-990'].imgIconClose} />
          </Touch>
        </View>
        {(
          [
            {
              title: '创建账本',
              label: '创建新账本',
              subtitle: '为新的活动开始记账',
              href: '/ledgers/create',
            },
            {
              title: '加入账本',
              label: '有邀请码？加入账本',
              subtitle: '使用邀请码加入已有账本',
              href: '/invitations/join',
            },
          ] as const
        ).map((item) => (
          <Touch
            key={item.href}
            accessibilityLabel={item.label}
            style={styles.option}
            onPress={() => {
              onClose();
              router.push(item.href);
            }}
          >
            <View style={ui.between}>
              <View style={ui.grow}>
                <Text style={ui.body}>{item.title}</Text>
                <Text style={ui.caption}>{item.subtitle}</Text>
              </View>
              <FigmaAsset asset={ledgerAssets.menuChevron} />
            </View>
          </Touch>
        ))}
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  menu: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D9D9D4',
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.16)',
  },
  close: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -12,
  },
  option: { minHeight: 72, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 16 },
});
