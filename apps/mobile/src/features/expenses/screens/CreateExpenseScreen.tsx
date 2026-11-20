import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { uuidSchema } from '@tongzhang/contracts';
import { Screen, ui } from '@/components/Screen';
import { RequestState } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { blocksContent, useOnlineQuery } from '@/lib/use-online-query';
import { ledgersApi } from '@/features/ledgers/api';
import { ledgersKeys } from '@/features/ledgers/query-keys';
import { ExpenseForm } from '../components/ExpenseForm';

export default function CreateExpenseScreen() {
  const { ledgerId } = useLocalSearchParams<{ ledgerId: string }>();
  const { user } = useAuth();
  const valid = uuidSchema.safeParse(ledgerId).success;
  const query = useOnlineQuery(
    ledgersKeys.ledger(user!.id, ledgerId),
    () => ledgersApi.getLedger({ params: { ledgerId }, query: {}, body: undefined }),
    valid,
  );
  const loading = valid && blocksContent(query);
  if (!valid || loading || query.isError || !query.data)
    return (
      <Screen title="记一笔" variant="ledger">
        <RequestState
          loading={loading}
          title={valid ? '暂时无法读取账本' : '账本地址无效'}
          description="需要在线核验成员和账本状态。"
          error={query.error}
          onRetry={
            valid
              ? () => {
                  void query.refetch();
                }
              : undefined
          }
        />
      </Screen>
    );
  if (query.data.data.status !== 'ACTIVE')
    return (
      <Screen title="记一笔" variant="ledger">
        <Text style={ui.body}>账本已冻结，无法新增消费。</Text>
      </Screen>
    );
  return (
    <ExpenseForm
      ledger={query.data.data}
      userId={user!.id}
      onRefreshLedger={() => {
        void query.refetch();
      }}
    />
  );
}
