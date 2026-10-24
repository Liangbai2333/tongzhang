import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion } from '@/theme/tokens';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { Touch } from './Touch';
import { useReducedMotion } from './motion';
import { ui } from './Screen';

export function Sheet({
  visible,
  title,
  onClose,
  children,
  contentKey,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  contentKey?: string;
}>) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  // Retain the visible panel while its exit animation completes.
  const lastVisible = useRef({ title, children, contentKey });
  useEffect(() => {
    if (visible) lastVisible.current = { title, children, contentKey };
  }, [visible, title, children, contentKey]);
  const content = visible ? { title, children, contentKey } : lastVisible.current;
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduced ? 0 : motion.sheet,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress, reduced]);
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#262626',
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
            },
          ]}
        />
        <Pressable
          accessibilityLabel="关闭面板遮罩"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reduced ? 0 : 450, 0],
                  }),
                },
              ],
              opacity: progress,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[ui.heading, ui.grow]}>
              {content.title}
            </Text>
            <Touch accessibilityLabel="关闭面板" onPress={onClose} style={styles.close}>
              <FigmaAsset asset={figmaAssets['157-990'].imgIconClose} />
            </Touch>
          </View>
          <ScrollView
            key={content.contentKey}
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator
          >
            {content.children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 12,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  content: { padding: 24, paddingTop: 16, gap: 16 },
});
