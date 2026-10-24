import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api-error';
import { colors } from '@/theme/tokens';

export default function SessionRecovery() {
  const { operation, error, restore, logout } = useAuth();
  const busy = operation !== null;
  return (
    <Screen back={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
        {busy && <ActivityIndicator color={colors.text} size="large" />}
        <Text accessibilityRole="header" style={ui.title}>
          {busy ? '正在核验登录状态' : '暂时无法核验登录状态'}
        </Text>
        <Text accessibilityLiveRegion="polite" style={ui.muted}>
          {busy
            ? '请稍候，正在安全恢复你的账号。'
            : error instanceof ApiError
              ? error.message
              : '请确认网络连接后手动重试。'}
        </Text>
        {!busy && (
          <>
            <Button
              title="重新核验"
              onPress={() => {
                void restore();
              }}
            />
            <Button
              title="退出并返回登录"
              variant="quiet"
              onPress={() => {
                void logout();
              }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
