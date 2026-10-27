import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useImageSelection } from '@/features/images/use-receipt';
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
  const cover = useImageSelection('COVER');
  const submitLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || write.busy || cover.busy;
  const locked = busy || write.uncertain;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => locked);
    return () => subscription.remove();
  }, [locked]);
  async function create() {
    if (submitLock.current || cover.busy) return;
    if (!name.trim() || name.trim().length > 40) {
      setFieldError('请输入 1–40 个字符的账本名称');
      return;
    }
    setFieldError(undefined);
    submitLock.current = true;
    setSubmitting(true);
    try {
      const imageId = await cover.upload();
      if (imageId === undefined) return;
      const body = createLedgerBodySchema.parse({
        name,
        ...(imageId ? { coverImageId: imageId } : { coverKey }),
      });
      const result = await write.submit(body, (key) =>
        ledgersApi.createLedger({ params: {}, query: {}, body }, { idempotencyKey: key }),
      );
      if (result) {
        void client.invalidateQueries({ queryKey: ledgersKeys.root(user!.id) });
        router.replace({
          pathname: '/ledgers/[ledgerId]/invitation',
          params: { ledgerId: result.data.ledger.id },
        });
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !locked }} />
      <Screen
        title="创建账本"
        variant="ledger"
        contentStyle={{ paddingTop: 8 }}
        backDisabled={locked}
        footer={
          <>
            <InlineError message={cover.error} />
            <InlineError message={write.error ? requestErrorMessage(write.error) : null} />
            {write.uncertain && (
              <Text style={ui.muted}>
                提交结果尚未确认。重试会核对原提交；也可返回列表在线查看。
              </Text>
            )}
            <Button
              title={write.uncertain ? '重试原提交' : '创建并邀请成员'}
              loading={busy}
              onPress={() => {
                void create();
              }}
            />
            {write.uncertain && (
              <Button
                title="返回账本列表在线核对"
                variant="secondary"
                disabled={busy}
                onPress={() => router.replace('/ledgers')}
              />
            )}
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
          {cover.value ? (
            <View style={{ gap: 8 }}>
              <Image
                accessibilityLabel="自定义封面预览"
                source={{ uri: cover.value.uri }}
                cachePolicy="none"
                contentFit="cover"
                style={{ width: '100%', height: 180, borderRadius: 20 }}
              />
              <Text style={ui.caption}>
                自定义封面 · {cover.value.byteSize} 字节
                {cover.value.imageId ? ' · 已上传，待创建绑定' : ''}
              </Text>
            </View>
          ) : (
            <LedgerCover coverKey={coverKey} preview />
          )}
          <View style={styles.choices}>
            {(Object.keys(covers) as CoverKey[]).map((key) => (
              <Touch
                key={key}
                accessibilityRole="radio"
                accessibilityLabel={covers[key].label}
                accessibilityState={{
                  selected: !cover.value && key === coverKey,
                  disabled: locked,
                }}
                disabled={locked}
                onPress={() => {
                  cover.remove();
                  setCoverKey(key);
                }}
                style={styles.choice}
              >
                <View style={styles.choiceContent}>
                  <Text
                    style={[
                      styles.choiceText,
                      !cover.value && key === coverKey && styles.selectedText,
                    ]}
                  >
                    {
                      ({ mountain: '山野', dining: '聚餐', city: '城市', plain: '日常' } as const)[
                        key
                      ]
                    }
                  </Text>
                  {!cover.value && key === coverKey && <FigmaAsset asset={ledgerAssets.check} />}
                </View>
              </Touch>
            ))}
          </View>
          <Touch
            style={styles.upload}
            accessibilityRole="button"
            accessibilityLabel="从相册选择自定义封面"
            disabled={locked}
            onPress={() => {
              void cover.select(false);
            }}
          >
            <View style={[ui.row, { gap: 8 }]}>
              <View style={styles.addTile}>
                <FigmaAsset asset={ledgerAssets.add} />
              </View>
              <Text style={[ui.muted, ui.grow]}>上传自己的封面图片</Text>
              <Text style={ui.caption}>{cover.busy ? '处理中' : '选择图片'}</Text>
            </View>
          </Touch>
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
