import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { Sheet } from '@/components/Sheet';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Avatar, Chips, Note, Row, usePreviewNotice } from '@/features/preview/PreviewUI';
import { categories, previewMembers } from '@/features/preview/fixtures';

export default function ExpenseScreen() {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('餐饮');
  const [payer, setPayer] = useState('小安');
  const [date, setDate] = useState('2026-10-10');
  const [mode, setMode] = useState('人均');
  const [members, setMembers] = useState<string[]>(previewMembers.map((m) => m.name));
  const [panel, setPanel] = useState('');
  const { notice, notify } = usePreviewNotice();
  const a = figmaAssets['3-134'];
  return (
    <Screen
      title="记一笔"
      preview
      contentStyle={{ gap: 12 }}
      footer={
        <>
          {notice}
          <Button
            title="保存消费"
            onPress={() => notify('尚未接入消费保存，没有创建或修改任何账目。')}
          />
        </>
      }
    >
      <View style={[ui.card, { borderRadius: 24, gap: 4 }]}>
        <Text style={ui.caption}>消费金额</Text>
        <View style={ui.row}>
          <Text style={[ui.heading, { fontSize: 28 }]}>¥</Text>
          <TextInput
            accessibilityLabel="消费金额"
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            value={amount}
            onChangeText={setAmount}
            maxLength={14}
            style={[ui.amount, ui.grow, { fontSize: 44, paddingVertical: 4 }]}
          />
        </View>
        <Text style={ui.caption}>金额须大于 0，最多两位小数</Text>
      </View>
      <Field
        label="消费名称"
        placeholder="这笔钱花在了哪里？"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <View style={[ui.card, { paddingVertical: 0 }]}>
        <Row title="消费类别" detail={category} onPress={() => setPanel('消费类别')} />
      </View>
      <Text style={ui.caption}>餐饮 · 交通 · 门票 · 住宿 · 购物 · 其他</Text>
      <View style={[ui.card, { paddingVertical: 0, gap: 0 }]}>
        <Row title="付款人" detail={payer} onPress={() => setPanel('付款人')} />
        <View style={ui.divider} />
        <Row title="日期" detail={date} onPress={() => setPanel('消费日期')} />
      </View>
      <View style={[ui.card, { paddingVertical: 0, gap: 0 }]}>
        <Row
          title="参与分摊"
          detail={`${members.length} 位`}
          onPress={() => setPanel('分摊设置')}
        />
        <View style={ui.divider} />
        <Row title="分摊方式" detail={mode} onPress={() => setPanel('分摊设置')} />
        <Text style={[ui.caption, { paddingBottom: 12, color: colors.success }]}>
          {members.length} 人参与 · 预览仅选择分摊方式
        </Text>
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>补充信息</Text>
        <Field
          label="备注（选填）"
          placeholder="写下这笔消费的补充说明"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
        />
        <Text style={ui.caption}>收据图片（选填）</Text>
        <View style={ui.row}>
          <View style={ui.grow}>
            <Button
              title="从相册选择"
              variant="secondary"
              icon={<FigmaAsset asset={a.imgLeadingIcon} />}
              onPress={() => notify('相册选择与上传尚未接入。')}
            />
          </View>
          <View style={ui.grow}>
            <Button
              title="拍摄收据"
              variant="secondary"
              icon={<FigmaAsset asset={a.imgLeadingIcon1} />}
              onPress={() => notify('拍摄收据尚未接入。')}
            />
          </View>
        </View>
        <View
          style={[ui.row, { backgroundColor: colors.primarySoft, padding: 16, borderRadius: 16 }]}
        >
          <FigmaAsset asset={a.imgIconReceipt} />
          <View style={ui.grow}>
            <Text style={ui.strong}>尚未选择收据</Text>
            <Text style={ui.caption}>最多添加 1 张，方便共同核对</Text>
          </View>
        </View>
      </View>
      <Sheet visible={!!panel} title={panel} onClose={() => setPanel('')}>
        {panel === '消费类别' && (
          <>
            <Chips options={categories} value={category} onChange={setCategory} />
            <Button title="完成" onPress={() => setPanel('')} />
          </>
        )}
        {panel === '付款人' && (
          <>
            {previewMembers.map((member, i) => (
              <Touch
                key={member.name}
                accessibilityRole="radio"
                accessibilityState={{ checked: payer === member.name }}
                onPress={() => {
                  setPayer(member.name);
                  setPanel('');
                }}
                style={{ paddingVertical: 10 }}
              >
                <View style={ui.row}>
                  <Avatar name={member.initial} index={i} />
                  <Text style={[ui.body, ui.grow]}>
                    {member.name}
                    {i === 0 ? '（我）' : ''}
                  </Text>
                  {payer === member.name && <FigmaAsset asset={a.imgIconCheck} />}
                </View>
              </Touch>
            ))}
          </>
        )}
        {panel === '消费日期' && (
          <>
            <Field
              label="日期"
              placeholder="YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />
            <Note>日期选择器暂用输入框预览，提交校验将在业务接入时完成。</Note>
            <Button title="完成" onPress={() => setPanel('')} />
          </>
        )}
        {panel === '分摊设置' && (
          <>
            <Text style={ui.strong}>分摊方式</Text>
            <Chips options={['人均', '按份', '按金额']} value={mode} onChange={setMode} />
            <View style={ui.between}>
              <Text style={ui.strong}>参与成员</Text>
              <Text style={ui.caption}>{members.length} 位参与</Text>
            </View>
            {previewMembers.map((member, i) => (
              <Touch
                key={member.name}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: members.includes(member.name) }}
                onPress={() =>
                  setMembers((current) =>
                    current.includes(member.name)
                      ? current.filter((m) => m !== member.name)
                      : [...current, member.name],
                  )
                }
                style={{ paddingVertical: 8 }}
              >
                <View style={ui.row}>
                  <View
                    style={[
                      styles.check,
                      members.includes(member.name) && { backgroundColor: colors.primary },
                    ]}
                  >
                    {members.includes(member.name) && (
                      <FigmaAsset asset={figmaAssets['87-831'].imgIconCheck} />
                    )}
                  </View>
                  <Avatar name={member.initial} index={i} size={28} />
                  <Text style={[ui.body, ui.grow]}>
                    {member.name}
                    {i === 0 ? '（我）' : ''}
                  </Text>
                </View>
              </Touch>
            ))}
            <Note>
              {mode === '人均'
                ? '已选择人均分摊。金额计算与服务端校验将在下一阶段接入。'
                : `已选择${mode}。逐人${mode === '按份' ? '份数' : '金额'}编辑将在下一阶段接入。`}
            </Note>
            <Button title="完成" disabled={members.length === 0} onPress={() => setPanel('')} />
            {members.length === 0 && (
              <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
                请至少选择一位分摊成员。
              </Text>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
const styles = StyleSheet.create({
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
