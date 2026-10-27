import { StyleSheet, Text, View } from 'react-native';
import type { EndpointOutput } from '@tongzhang/contracts';
import { ui } from '@/components/Screen';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { yuan } from '@/features/ledgers/presentation';
import { completionAssets } from '../completion-assets';

type Transfer = EndpointOutput<'getSettlement'>['data']['transfers'][number];
export function SettledTransferCard({
  transfer,
  name,
}: {
  transfer: Transfer;
  name: (id: string) => string;
}) {
  return (
    <View style={s.card}>
      <View style={[ui.row, { gap: 12 }]}>
        <View style={[s.avatar, { backgroundColor: colors.peach }]}>
          <Text style={s.initial}>{Array.from(name(transfer.payerMemberId)).at(-1)}</Text>
        </View>
        <Text accessibilityLabel={`付款人：${name(transfer.payerMemberId)}`} style={s.name}>
          {name(transfer.payerMemberId)}
        </Text>
        <FigmaAsset
          asset={completionAssets.arrow}
          style={{ transform: [{ rotate: '180deg' }, { scaleY: -1 }] }}
        />
        <View style={[s.avatar, { backgroundColor: colors.mint }]}>
          <Text style={s.initial}>{Array.from(name(transfer.payeeMemberId)).at(-1)}</Text>
        </View>
        <Text accessibilityLabel={`收款人：${name(transfer.payeeMemberId)}`} style={s.name}>
          {name(transfer.payeeMemberId)}
        </Text>
      </View>
      <View style={ui.between}>
        <Text style={[ui.muted, { lineHeight: 20 }]}>转账金额</Text>
        <Text style={s.amount}>{yuan(transfer.amountCents)}</Text>
      </View>
      {transfer.registeredAt && (
        <Text style={ui.caption}>登记时间 {new Date(transfer.registeredAt).toLocaleString()}</Text>
      )}
      {transfer.registeredByMemberId && (
        <Text style={ui.caption}>登记人：{name(transfer.registeredByMemberId)}</Text>
      )}
      {transfer.registrationNote && <Text style={ui.body}>备注：{transfer.registrationNote}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  amount: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initial: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 23 },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    flexShrink: 1,
    minWidth: 0,
  },
});
