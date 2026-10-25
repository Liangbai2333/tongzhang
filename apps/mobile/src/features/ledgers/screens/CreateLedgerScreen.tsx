import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { createLedgerBodySchema } from '@tongzhang/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Touch } from '@/components/Touch';
import { InlineError, requestErrorMessage } from '@/components/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { colors } from '@/theme/tokens';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { ledgersApi } from '../api';
import { ledgersKeys } from '../query-keys';
import { covers, type CoverKey } from '../presentation';
import { LedgerCover } from '../components/LedgerCover';

export default function CreateLedgerScreen() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [coverKey, setCoverKey] = useState<CoverKey>('mountain');
  const [fieldError, setFieldError] = useState<string>();
  const write = useIdempotentWrite();
  async function create() {
    const body = createLedgerBodySchema.safeParse({ name, coverKey });
    if (!body.success) {
      setFieldError('请输入 1–40 个字符的账本名称');
      return;
    }
    setFieldError(undefined);
    const result = await write.submit(body.data, (key) =>
      ledgersApi.createLedger({ params: {}, query: {}, body: body.data }, { idempotencyKey: key }),
    );
    if (result) {
      void client.invalidateQueries({ queryKey: ledgersKeys.root(user!.id) });
      router.replace({
        pathname: '/ledgers/[ledgerId]/invitation',
        params: { ledgerId: result.data.ledger.id },
      });
    }
  }
  const locked = write.busy || write.uncertain;
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !write.busy }} />
      <Screen
        title="创建账本"
        variant="ledger"
        contentStyle={{ paddingTop: 8 }}
        backDisabled={write.busy}
        footer={
          <>
            <InlineError message={write.error ? requestErrorMessage(write.error) : null} />
            {write.uncertain && (
              <Text style={ui.muted}>
                提交结果尚未确认。重试会核对原提交；也可返回列表在线查看。
              </Text>
            )}
            <Button
              title={write.uncertain ? '重试原提交' : '创建并邀请成员'}
              loading={write.busy}
              onPress={() => {
                void create();
              }}
            />
          </>
        }
      >
        <Text style={ui.title}>给这次相聚起个名字</Text>
        <Field
          label="账本名称"
          placeholder="例如：鼓山一日"
          variant="inset"
          value={name}
          maxLength={40}
          editable={!locked}
          error={fieldError}
          onChangeText={(value) => {
            setName(value);
            setFieldError(undefined);
          }}
        />
        <View style={styles.coverSection}>
          <View style={styles.label}>
            <View style={styles.marker} />
            <Text style={ui.muted}>账本封面</Text>
          </View>
          <LedgerCover coverKey={coverKey} preview />
          <View style={styles.choices}>
            {(Object.keys(covers) as CoverKey[]).map((key) => (
              <Touch
                key={key}
                accessibilityRole="radio"
                accessibilityLabel={covers[key].label}
                accessibilityState={{ selected: key === coverKey, disabled: locked }}
                disabled={locked}
                onPress={() => setCoverKey(key)}
                style={styles.choice}
              >
                <View style={styles.choiceContent}>
                  <Text style={[styles.choiceText, key === coverKey && styles.selectedText]}>
                    {
                      ({ mountain: '山野', dining: '聚餐', city: '城市', plain: '日常' } as const)[
                        key
                      ]
                    }
                  </Text>
                  {key === coverKey && <FigmaAsset asset={ledgerAssets.check} />}
                </View>
              </Touch>
            ))}
          </View>
          <View style={styles.upload} accessibilityLabel="上传自己的封面图片，暂未开放">
            <View style={styles.addTile}>
              <FigmaAsset asset={ledgerAssets.add} />
            </View>
            <Text style={[ui.muted, ui.grow]}>上传自己的封面图片</Text>
            <Text style={ui.caption}>暂未开放</Text>
          </View>
        </View>
        <View style={styles.notice}>
          <FigmaAsset asset={ledgerAssets.info} />
          <Text style={[ui.caption, ui.grow]}>创建后可邀请成员，最多 12 人。</Text>
        </View>
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marker: { width: 3, height: 14, borderRadius: 2, backgroundColor: colors.primary },
  coverSection: { gap: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  choiceContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  choiceText: { fontSize: 13, lineHeight: 19, color: colors.muted },
  selectedText: { fontWeight: '700', color: colors.text },
  upload: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addTile: {
    width: 28,
    height: 28,
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
