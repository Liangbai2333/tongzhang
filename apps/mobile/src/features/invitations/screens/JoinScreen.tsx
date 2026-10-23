import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Note, usePreviewNotice } from '@/features/preview/PreviewUI';

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const { notice, notify } = usePreviewNotice();
  const a = figmaAssets['87-1713'];
  return (
    <Screen
      title="加入账本"
      preview
      footer={
        <>
          {notice}
          <Button
            title="查看账本"
            disabled={code.length !== 6}
            onPress={() => notify('邀请码查询尚未接入，没有加入任何账本。')}
          />
        </>
      }
    >
      <View style={styles.hero}>
        <FigmaAsset asset={a.imgBgCircle} style={{ position: 'absolute', right: -25, top: -30 }} />
        <FigmaAsset asset={a.imgBgCircle2} style={{ position: 'absolute', right: 5, top: 60 }} />
        <View style={[ui.grow, { gap: 8 }]}>
          <Text style={ui.caption}>你被邀请加入</Text>
          <Text style={ui.heading}>朋友的共同账本 ✨</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FigmaAsset asset={a.imgEllipse} />
            <FigmaAsset asset={a.imgEllipse1} />
            <Text style={ui.caption}>已有成员在等你</Text>
          </View>
        </View>
        <View style={styles.book}>
          <FigmaAsset asset={a.imgIconLedger} />
        </View>
      </View>
      <Text style={ui.strong}>6 位邀请码</Text>
      <View style={styles.codeField}>
        <View pointerEvents="none" accessible={false} style={styles.digits}>
          {Array.from({ length: 6 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.digit,
                code.length === i && { borderWidth: 2, borderColor: colors.primary },
              ]}
            >
              <Text style={styles.digitText}>{code[i] ?? ' '}</Text>
            </View>
          ))}
        </View>
        <TextInput
          accessibilityLabel="6 位邀请码"
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
          keyboardType="number-pad"
          caretHidden
          style={styles.input}
        />
      </View>
      <View style={ui.row}>
        <View style={[ui.divider, ui.grow]} />
        <Text style={ui.caption}>或</Text>
        <View style={[ui.divider, ui.grow]} />
      </View>
      <Button
        title="在 App 内扫码"
        variant="secondary"
        icon={<FigmaAsset asset={a.imgLeadingIcon} />}
        onPress={() => notify('扫码功能尚未接入。')}
      />
      <Note title="如何获取邀请码？">向创建者获取邀请码。查看账本信息后，再确认加入。</Note>
    </Screen>
  );
}
const styles = StyleSheet.create({
  hero: {
    minHeight: 148,
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  book: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeField: {
    height: 88,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: 20,
    justifyContent: 'center',
  },
  digits: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, alignItems: 'center' },
  digit: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: { fontSize: 26, fontWeight: '700', color: colors.text },
  input: { position: 'absolute', inset: 0, color: 'transparent', fontSize: 26 },
});
