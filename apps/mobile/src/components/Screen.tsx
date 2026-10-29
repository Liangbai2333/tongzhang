import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Touch } from './Touch';

export function Screen({
  title,
  children,
  footer,
  action,
  variant = 'default',
  back = true,
  backDisabled = false,
  contentStyle,
  refreshing = false,
  onRefresh,
  onBack,
  tabRoot = false,
}: PropsWithChildren<{
  title?: string;
  footer?: ReactNode;
  action?: ReactNode;
  back?: boolean;
  backDisabled?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  variant?: 'default' | 'ledger' | 'auth';
  refreshing?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
  /** A (tabs) screen: the persistent tab bar owns the bottom safe area. */
  tabRoot?: boolean;
}>) {
  const pull = usePullIndicator(refreshing);
  return (
    <SafeAreaView style={styles.root} edges={tabRoot ? ['top'] : ['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {title && (
          <View style={styles.header}>
            {back && (
              <Touch
                accessibilityLabel="返回"
                hitSlop={4}
                disabled={backDisabled}
                style={[styles.back, variant !== 'default' && styles.designBackTarget]}
                onPress={
                  onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))
                }
              >
                <View style={variant !== 'default' ? styles.designBack : undefined}>
                  <FigmaAsset asset={figmaAssets['5-30'].imgIconBack} />
                </View>
              </Touch>
            )}
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {action}
          </View>
        )}
        <ScrollView
          testID="screen-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={
            onRefresh ? (
              <FocusedRefreshControl
                refreshing={pull.visible}
                onRefresh={() => {
                  pull.start();
                  onRefresh();
                }}
                tintColor={colors.text}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
        {footer && (
          <View style={[styles.footer, variant === 'ledger' && styles.designFooter]}>{footer}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
/**
 * A spinner whose refresh ends while its page is off screen can stay stuck on iOS, so the
 * control only reports refreshing while its page is focused. ScrollView renders this element
 * itself (wrapping its content on Android), so every prop is forwarded.
 */
function FocusedRefreshControl({ refreshing, ...props }: RefreshControlProps) {
  const focused = useIsFocused();
  return <RefreshControl {...props} refreshing={refreshing && focused} />;
}
/**
 * Pages refetch whenever they gain focus. Only a refresh the user pulled for shows the spinner;
 * focus and tab refetches update the content quietly.
 */
function usePullIndicator(refreshing: boolean) {
  const [pulled, setPulled] = useState(false);
  const wasRefreshing = useRef(refreshing);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setPulled(false);
    wasRefreshing.current = refreshing;
  }, [refreshing]);
  return {
    visible: pulled && refreshing,
    start: () => {
      setPulled(true);
      // A pull that starts no fetch must not leave a pending spinner for the next focus refetch.
      setTimeout(() => {
        if (!wasRefreshing.current) setPulled(false);
      }, 1000);
    },
  };
}
export const ui = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 12 },
  bordered: { borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 24, lineHeight: 34, fontWeight: '700', color: colors.text },
  heading: { fontSize: 18, lineHeight: 27, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 23, color: colors.text },
  strong: { fontSize: 15, lineHeight: 23, color: colors.text, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, color: colors.muted },
  muted: { fontSize: 14, lineHeight: 22, color: colors.muted },
  amount: {
    fontSize: 36,
    lineHeight: 48,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  divider: { height: 1, backgroundColor: colors.border },
  gap: { gap: 12 },
});
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
  back: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 22,
  },
  designBackTarget: { backgroundColor: 'transparent', minWidth: 36, minHeight: 44 },
  designBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(0,0,0,0.06)',
  },
  designFooter: {
    paddingTop: 11,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, gap: 20 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: colors.background,
  },
});
