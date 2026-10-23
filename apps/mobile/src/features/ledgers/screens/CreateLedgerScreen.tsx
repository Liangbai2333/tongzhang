import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Chips, Note, Row, usePreviewNotice } from '@/features/preview/PreviewUI';

export default function CreateLedgerScreen() {
  const [name, setName] = useState('');
  const [cover, setCover] = useState('山野');
  const { notice, notify } = usePreviewNotice();
  const a = figmaAssets['5-100'];
  return (
    <Screen
      title="创建账本"
      preview
      footer={
        <>
          {notice}
          <Button
            title="创建并邀请成员"
            onPress={() => notify('尚未接入创建账本，输入仅保留在本页。')}
          />
        </>
      }
    >
      <Text style={ui.title}>给这次相聚起个名字</Text>
      <Field
        label="账本名称"
        placeholder="例如：鼓山一日"
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      <Text style={ui.muted}>账本封面</Text>
      <View
        style={[
          ui.card,
          {
            minHeight: 160,
            justifyContent: 'center',
            backgroundColor:
              cover === '山野' ? colors.primarySoft : cover === '聚餐' ? colors.peach : colors.mint,
            borderColor: colors.primary,
            borderWidth: 2,
          },
        ]}
      >
        <FigmaAsset
          asset={
            cover === '山野'
              ? a.imgIconMountain
              : cover === '聚餐'
                ? figmaAssets['3-2'].imgGlyph
                : figmaAssets['3-2'].imgGlyph1
          }
        />
        <Text style={ui.heading}>
          {cover === '山野' ? '山野一日' : cover === '聚餐' ? '一桌好时光' : '日常小确幸'}
        </Text>
        <Text style={ui.caption}>预设封面</Text>
      </View>
      <Chips options={['山野', '聚餐', '日常']} value={cover} onChange={setCover} />
      <View style={[ui.card, { paddingVertical: 0 }]}>
        <Row
          title="上传自己的封面图片"
          icon={a.imgIconAdd}
          onPress={() => notify('封面上传将在接入图片功能后可用。')}
        />
      </View>
      <Note>创建后可邀请成员，最多 12 人。</Note>
    </Screen>
  );
}
