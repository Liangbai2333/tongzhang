import { colors } from '@/theme/tokens';
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { EndpointOutput } from '@tongzhang/contracts';
import { OnlineWriteSheet } from '@/components/OnlineWriteSheet';
import { Field } from '@/components/Field';
import { ui } from '@/components/Screen';
import { yuan } from '@/features/ledgers/presentation';
import { settlementsApi } from '../api';

type Transfer = EndpointOutput<'getSettlement'>['data']['transfers'][number];
export function SettlementActionSheet({
  ledgerId,
  transfer,
  name,
  ledgerName,
  transferCount,
  onDone,
  onCancel,
}: {
  ledgerId: string;
  transfer: Transfer | null;
  name: (id: string) => string;
  ledgerName: string;
  transferCount: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const body = transfer ? { note: note.trim() } : {};
  return (
    <OnlineWriteSheet
      title={transfer ? '登记这笔还款' : '确认整本结清？'}
      confirmTitle={transfer ? '确认登记已还' : '确认结清'}
      plain={!transfer}
      cancelTitle={transfer ? '取消' : '返回核对'}
      payload={body}
      send={(key) =>
        transfer
          ? settlementsApi.markTransferPaid(
              { params: { ledgerId, transferId: transfer.id }, query: {}, body },
              { idempotencyKey: key },
            )
          : settlementsApi.settleLedger(
              { params: { ledgerId }, query: {}, body: undefined },
              { idempotencyKey: key },
            )
      }
      check={async () => {
        const result = await settlementsApi.getSettlement({
          params: { ledgerId },
          query: {},
          body: undefined,
        });
        return transfer
          ? result.data.transfers.some((item) => item.id === transfer.id && item.status === 'PAID')
          : result.data.ledgerStatus === 'SETTLED';
      }}
      onDone={onDone}
      onCancel={onCancel}
    >
      {(locked) => (
        <>
          {transfer ? (
            <>
              <View
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 12,
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text style={[ui.strong, { fontSize: 17, lineHeight: 25 }]}>
                  {name(transfer.payerMemberId)} → {name(transfer.payeeMemberId)}
                </Text>
                <Text style={[ui.heading, { fontSize: 22, lineHeight: 32 }]}>
                  {yuan(transfer.amountCents)}
                </Text>
              </View>
              <Text style={ui.muted}>
                请确认这笔转账已在应用外完成。 同账不会验证真实到账；仅整笔登记，不可撤销。
              </Text>
              <Field
                label="登记说明（选填）"
                placeholder="线下转账，已核实"
                value={note}
                maxLength={200}
                editable={!locked}
                onChangeText={setNote}
              />
            </>
          ) : (
            <>
              <Text style={ui.body}>
                {ledgerName} · {transferCount} 笔转账已登记
              </Text>
              <Text style={ui.muted}>结清后，账单与结算记录仅供查看。此操作不可撤销。</Text>
            </>
          )}
        </>
      )}
    </OnlineWriteSheet>
  );
}
