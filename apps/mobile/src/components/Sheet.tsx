import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
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
  variant = 'default',
  headerAction,
  hideClose = false,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  contentKey?: string;
  variant?: 'default' | 'members' | 'join';
  headerAction?: ReactNode;
  hideClose?: boolean;
}>) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  // Retain the visible panel while its exit animation completes.
  const lastVisible = useRef({ title, children, contentKey, variant, headerAction });
  useEffect(() => {
    if (visible) lastVisible.current = { title, children, contentKey, variant, headerAction };
  }, [visible, title, children, contentKey, variant, headerAction]);
  const content = visible
    ? { title, children, contentKey, variant, headerAction }
    : lastVisible.current;
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
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, content.variant === 'join' ? 0.22 : 0.3],
              }),
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
            content.variant !== 'default' && styles.designSheet,
            content.variant === 'join' && styles.joinSheet,
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
          {content.variant !== 'members' && (
            <View style={[styles.handle, content.variant === 'join' && styles.joinHandle]} />
          )}
          <View
            style={[
              styles.header,
              content.variant === 'members' && styles.membersHeader,
              content.variant === 'join' && styles.joinHeader,
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[ui.heading, ui.grow, content.variant === 'join' && styles.joinTitle]}
            >
              {content.title}
            </Text>
            {content.headerAction}
            {!hideClose && (
              <Touch accessibilityLabel="关闭面板" onPress={onClose} style={styles.close}>
                <FigmaAsset asset={figmaAssets['157-990'].imgIconClose} />
              </Touch>
            )}
          </View>
          <ScrollView
            key={content.contentKey}
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              content.variant === 'members' && styles.membersContent,
              content.variant === 'join' && styles.joinContent,
            ]}
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
  designSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16 },
  membersHeader: { paddingTop: 0 },
  membersContent: { paddingTop: 12, paddingBottom: 0, gap: 12 },
  joinSheet: { paddingTop: 24 },
  joinHandle: { alignSelf: 'flex-start', marginLeft: 24, width: 40, backgroundColor: '#E5E5E0' },
  joinHeader: { paddingTop: 14 },
  joinTitle: { fontSize: 20, lineHeight: 29 },
  joinContent: { paddingTop: 14, paddingBottom: 0, gap: 14 },
});
