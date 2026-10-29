import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';

export default function SessionRecovery() {
  const { operation, error, restore, logout } = useAuth();
  const busy = operation !== null;
  return (
    <Screen back={false}>
      <RequestState
        loading={busy}
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
