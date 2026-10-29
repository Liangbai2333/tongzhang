import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/lib/api-error';
import { colors } from '@/theme/tokens';
import { Button } from './Button';
import { ui } from './Screen';

export function InlineError({ message }: { message?: string | null }) {
  return message ? (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      {message}
    </Text>
  ) : null;
}

/** Unknown exceptions use a safe fallback; API errors carry a user-facing server message. */
export function requestErrorMessage(error: unknown, fallback = '请求暂时失败，请稍后重试') {
  return error instanceof ApiError ? error.message : fallback;
}

/** A state inside the current container. Retrying only happens on an explicit press. */
export function RequestState({
  loading,
  title,
  loadingTitle = '正在加载',
  description,
  loadingDescription = '请稍候。',
  error,
  onRetry,
  retryLabel = '重试',
  children,
}: PropsWithChildren<{
  loading: boolean;
  title: string;
  loadingTitle?: string;
  description: string;
  loadingDescription?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
}>) {
  return (
    <View style={styles.state}>
      {loading && (
        <ActivityIndicator
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={loadingTitle}
          color={colors.text}
          size="large"
        />
      )}
      <Text accessibilityRole="header" style={ui.title}>
        {loading ? loadingTitle : title}
      </Text>
      <Text accessibilityLiveRegion="polite" style={ui.muted}>
        {loading ? loadingDescription : requestErrorMessage(error, description)}
      </Text>
      {!loading && (
        <>
          {onRetry && <Button title={retryLabel} onPress={onRetry} />}
          {children}
        </>
      )}
    </View>
  );
}

/** The caller supplies the actual empty/unavailable state; no fabricated business values. */
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={ui.card}>
      <Text accessibilityRole="header" style={ui.heading}>
        {title}
      </Text>
      <Text style={ui.muted}>{description}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  state: { flex: 1, justifyContent: 'center', gap: 20 },
});
