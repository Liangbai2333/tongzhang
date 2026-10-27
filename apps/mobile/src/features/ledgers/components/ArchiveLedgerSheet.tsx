import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { EndpointOutput } from '@tongzhang/contracts';
import { OnlineWriteSheet } from '@/components/OnlineWriteSheet';
import { colors } from '@/theme/tokens';
import { yuan } from '../presentation';
import { ui } from '@/components/Screen';
import { ledgersApi } from '../api';

export function ArchiveLedgerSheet({
  ledger,
  userId,
  onCancel,
}: {
  ledger: EndpointOutput<'getLedger'>['data'];
  userId: string;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  return (
    <OnlineWriteSheet
      title="确认归档账本？"
      confirmTitle="确认归档"
      cancelTitle="暂不归档"
      payload={{ ledgerId: ledger.id }}
      send={(key) =>
        ledgersApi.archiveLedger(
          { params: { ledgerId: ledger.id }, query: {}, body: undefined },
          { idempotencyKey: key },
        )
      }
      check={async () => {
        const result = await ledgersApi.getLedger({
          params: { ledgerId: ledger.id },
          query: {},
          body: undefined,
        });
        return result.data.archivedAt !== null;
      }}
      onDone={() => {
        void client.invalidateQueries({ queryKey: ['user', userId] });
        router.replace({ pathname: '/ledgers', params: { archivedNotice: ledger.id } });
      }}
      onCancel={onCancel}
    >
      {() => (
        <>
          <View
            style={{ backgroundColor: colors.background, padding: 16, borderRadius: 12, gap: 8 }}
          >
            <Text style={ui.strong}>
              {ledger.name} · 已结清 · {yuan(ledger.expenseTotalCents)}
            </Text>
            <Text style={ui.caption}>{ledger.memberCount} 位成员</Text>
          </View>
          <Text style={ui.muted}>
            仅从你的当前列表移入「已归档账本」，其他成员的列表和财务状态不变。历史中仍可查看消费、收据和正式结算记录。
          </Text>
        </>
      )}
    </OnlineWriteSheet>
  );
}
