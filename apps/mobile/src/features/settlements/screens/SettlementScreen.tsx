import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar, Note, usePreviewNotice } from '@/features/preview/PreviewUI';

export default function SettlementScreen() {
  const [confirm, setConfirm] = useState(false);
  const { notice, notify } = usePreviewNotice();
  const a = figmaAssets['96-341'];
  return (
    <Screen
      title="结算预览"
      preview
      footer={
        <>
          {notice}
          <Button
            title="复制完整方案"
            variant="secondary"
            onPress={() => notify('当前是示例方案，复制功能尚未接入。')}
          />
          <Button
            title="正式发起结算"
            icon={<FigmaAsset asset={a.imgLeadingIcon} />}
            onPress={() => setConfirm(true)}
          />
        </>
      }
    >
      <View style={[ui.card, ui.bordered]}>
        <Text style={ui.caption}>待转账总额</Text>
        <Text style={[ui.amount, { fontSize: 30 }]}>¥90.00</Text>
        <View style={ui.row}>
          <View style={ui.grow}>
            <Text style={ui.caption}>账本总支出</Text>
            <Text style={ui.heading}>¥300.00</Text>
          </View>
          <View style={{ width: 1, height: 36, backgroundColor: colors.border }} />
          <View style={ui.grow}>
            <Text style={ui.caption}>转账笔数</Text>
            <Text style={ui.heading}>2 笔</Text>
          </View>
        </View>
      </View>
      <Text style={ui.muted}>转账明细</Text>
      {[
        {
          from: '陈',
          payer: '小陈',
          index: 2,
          to: '安',
          payee: '小安',
          target: 0,
          amount: '30.00',
        },
        {
          from: '丁',
          payer: '小丁',
          index: 3,
          to: '白',
          payee: '小白',
          target: 1,
          amount: '60.00',
        },
      ].map((transfer) => (
        <View
          key={transfer.payer}
          style={[
            ui.card,
            ui.bordered,
            ui.between,
            { paddingHorizontal: 16, paddingVertical: 18, gap: 8 },
          ]}
        >
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Avatar name={transfer.from} index={transfer.index} size={44} />
            <View>
              <Text style={ui.caption}>付款人</Text>
              <Text style={ui.strong}>{transfer.payer}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View
              style={{
                backgroundColor: colors.primarySoft,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
              }}
            >
              <Text style={[ui.heading, { fontSize: 22, color: colors.warning }]}>
                ¥{transfer.amount}
              </Text>
            </View>
            <FigmaAsset asset={a.imgIconBack1} style={{ transform: [{ rotate: '180deg' }] }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Avatar name={transfer.to} index={transfer.target} size={44} />
            <View>
              <Text style={ui.caption}>收款人</Text>
              <Text style={ui.strong}>{transfer.payee}</Text>
            </View>
          </View>
        </View>
      ))}
      <Note title="结算后账单将冻结">
        结算后无法新增、编辑或删除原始消费。转账在应用外完成，同账仅计算与登记。
      </Note>
      <Sheet visible={confirm} title="确认正式结算？" onClose={() => setConfirm(false)}>
        <Note title="账本将进入结算中">
          正式结算会保存方案并冻结消费。本次仅展示确认面板，不改变账本状态。
        </Note>
        <Button
          title="确认结算（预览）"
          onPress={() => {
            setConfirm(false);
            notify('仅预览确认交互，未发起结算或冻结账本。');
          }}
        />
        <Button title="继续记账" variant="secondary" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
