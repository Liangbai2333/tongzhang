import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Note, PreviewTabs, Row, usePreviewNotice } from '@/features/preview/PreviewUI';

export default function ProfileScreen() {
  const [panel, setPanel] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [name, setName] = useState('小安');
  const { notice, notify } = usePreviewNotice();
  const a = figmaAssets['5-358'];
  return (
    <Screen
      title="我的"
      back={false}
      preview
      contentStyle={{ gap: 10 }}
      footer={<PreviewTabs active="profile" />}
    >
      <View style={ui.card}>
        <View style={ui.row}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.primarySoft,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={ui.title}>安</Text>
          </View>
          <View style={ui.grow}>
            <Text style={ui.heading}>小安</Text>
            <Text style={ui.caption}>@xiaoan</Text>
          </View>
        </View>
        <View style={ui.divider} />
        <Text style={ui.caption}>每一笔共同消费，都有清楚的记录。</Text>
      </View>
      <View style={ui.row}>
        <View
          style={[
            ui.card,
            ui.grow,
            { alignItems: 'center', backgroundColor: colors.primarySoft, padding: 16, gap: 4 },
          ]}
        >
          <Text style={ui.heading}>3</Text>
          <Text style={ui.caption}>我参与的账本</Text>
        </View>
        <View style={[ui.card, ui.grow, { alignItems: 'center', padding: 16, gap: 4 }]}>
          <Text style={ui.heading}>1</Text>
          <Text style={ui.caption}>历史账本</Text>
        </View>
      </View>
      <View style={[ui.card, { padding: 16, gap: 0 }]}>
        <Text style={ui.caption}>我的账本</Text>
        <Row
          title="我的账本"
          detail="全部 3 本"
          icon={a.imgIconLedger1}
          onPress={() => router.replace('/preview')}
        />
        <View style={ui.divider} />
        <Row
          title="历史记录"
          detail="1 本历史账本"
          icon={a.imgGlyph}
          onPress={() => setPanel('历史记录')}
        />
      </View>
      <View style={[ui.card, { padding: 16, gap: 0 }]}>
        <Text style={ui.caption}>账号设置</Text>
        <Row
          title="账户信息"
          detail="xiaoan"
          icon={a.imgGlyph1}
          onPress={() => setPanel('账户信息')}
        />
        <View style={ui.divider} />
        <Row title="设置" icon={a.imgGlyph2} onPress={() => setPanel('设置')} />
        <View style={ui.divider} />
        <Row title="关于同账" icon={a.imgGlyph3} onPress={() => setPanel('关于同账')} />
      </View>
      <Button title="退出预览" variant="quiet" onPress={() => router.dismissTo('/')} />
      <Sheet visible={!!panel} title={panel} onClose={() => setPanel('')}>
        {panel === '账户信息' && (
          <>
            <Field label="用户名" value={name} onChangeText={setName} />
            <Text style={ui.caption}>邮箱首版只读 · 尚未载入真实账号</Text>
            <Button title="保存" onPress={() => notify('尚未接入资料保存，未修改真实账号。')} />
          </>
        )}
        {panel === '设置' && (
          <>
            <View style={ui.between}>
              <View style={ui.grow}>
                <Text style={ui.strong}>通知提醒</Text>
                <Text style={ui.caption}>仅预览开关，不申请通知权限</Text>
              </View>
              <Switch
                accessibilityLabel="通知提醒预览"
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <Row title="隐私政策" onPress={() => setPanel('隐私政策')} />
            <Row title="用户协议" onPress={() => setPanel('用户协议')} />
            <Row
              title="工程联调"
              onPress={() => {
                setPanel('');
                router.push('/connection');
              }}
            />
          </>
        )}
        {panel === '关于同账' && (
          <>
            <Text style={ui.title}>同账 TongZhang</Text>
            <Text style={ui.muted}>一起花的钱，一本账算清。</Text>
            <Text style={ui.caption}>移动端界面预览 · v0.1.0</Text>
            <Note>本次包含 Figma 首批页面与交互，不代表账本、分摊或结算业务已实现。</Note>
          </>
        )}
        {panel === '历史记录' && (
          <Note>历史账本列表将在下一阶段接入。个人归档不改变账本的财务状态。</Note>
        )}
        {['隐私政策', '用户协议'].includes(panel) && (
          <Note>正式协议尚未接入。此处仅预览阅读面板，不构成有效协议正文。</Note>
        )}
        {notice}
      </Sheet>
    </Screen>
  );
}
