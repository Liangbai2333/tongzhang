import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/tokens';

/**
 * Locks the app until the session is verified online. `compact` dims the retained page while a
 * kept session re-verifies; failures always use the full page with explicit retry.
 */
export default function SessionRecovery({ compact = false }: { compact?: boolean }) {
  const { operation, status, error, restore, logout } = useAuth();
  // A suspended session waiting for its next check has not failed yet.
  const verifying = operation !== null || (status === 'restoring' && !error);
  if (compact)
    return (
      <View style={styles.overlay}>
        <View accessible accessibilityLiveRegion="polite" style={styles.card}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.text}>正在核验登录状态</Text>
        </View>
      </View>
    );
  return (
    <Screen back={false}>
      <RequestState
        loading={verifying}
        title="暂时无法核验登录状态"
        loadingTitle="正在核验登录状态"
        description="请检查网络后重试。"
        loadingDescription="请稍候，正在安全恢复你的账号。"
        error={error}
        retryLabel="重新核验"
        onRetry={() => {
          void restore();
        }}
      >
        <Button
          title="退出并返回登录"
          variant="quiet"
          onPress={() => {
            void logout();
          }}
        />
      </RequestState>
    </Screen>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,249,246,0.72)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    boxShadow: '0px 4px 16px rgba(0,0,0,0.08)',
  },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
});
