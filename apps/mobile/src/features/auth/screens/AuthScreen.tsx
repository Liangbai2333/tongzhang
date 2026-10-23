import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { Sheet } from '@/components/Sheet';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { Note, usePreviewNotice } from '@/features/preview/PreviewUI';

export default function AuthScreen({ register = false }: { register?: boolean }) {
  const [account, setAccount] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [legal, setLegal] = useState('');
  const { notice, notify } = usePreviewNotice();
  const icons = figmaAssets['5-30'];
  return (
    <Screen
      title={register ? '创建账号' : '欢迎回来'}
      footer={
        <>
          {notice}
          <View style={ui.divider} />
          <Button
            title={register ? '注册并开始' : '登录'}
            onPress={() => notify('当前仅预览表单，未提交账号信息。可返回欢迎页浏览界面预览。')}
          />
        </>
      }
    >
      {!register && (
        <View style={{ alignItems: 'center', marginBottom: 0 }}>
          <View
            style={{
              borderRadius: 36,
              width: 72,
              height: 72,
              borderWidth: 6,
              borderColor: colors.primary,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FigmaAsset asset={icons.imgIconLedger} />
          </View>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Text style={[ui.title, { fontSize: 28, lineHeight: 40 }]}>
          {register ? '从这里，一起算清。' : '继续你们的共同账本'}
        </Text>
        <Text style={ui.muted}>
          {register ? '创建你的同账账号，开始共享记账之旅' : '使用账号与密码登录'}
        </Text>
      </View>
      <View style={{ gap: 16 }}>
        <Field
          label={register ? '用户名' : '账号'}
          placeholder={register ? '你的名字' : '请输入邮箱 / 用户名'}
          icon={icons.imgIconUser}
          value={account}
          onChangeText={setAccount}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
        />
        {register && (
          <Field
            label="邮箱"
            placeholder="请输入邮箱"
            icon={figmaAssets['5-62'].imgMail}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        )}
        <Field
          label="密码"
          placeholder={register ? '至少 8 位字符' : '请输入密码'}
          icon={icons.imgIconLock}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          textContentType={register ? 'newPassword' : 'password'}
        />
        {register && (
          <Field
            label="确认密码"
            placeholder="再次输入密码"
            icon={icons.imgIconLock}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
          />
        )}
      </View>
      {!register && (
        <View style={ui.between}>
          <Text style={ui.muted}>还没有账号？</Text>
          <Touch
            onPress={() => router.replace('/register')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={ui.strong}>注册同账 →</Text>
          </Touch>
        </View>
      )}
      <View style={{ gap: 4, backgroundColor: colors.primarySoft, padding: 16, borderRadius: 20 }}>
        <Text style={ui.muted}>
          {register
            ? '勾选同意《用户协议》与《隐私政策》后即可注册。'
            : '登录即表示你已阅读并同意《用户协议》与《隐私政策》。'}
        </Text>
        {register && (
          <Touch
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed(!agreed)}
            style={{ paddingVertical: 10 }}
          >
            <View style={ui.row}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  backgroundColor: agreed ? colors.primary : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {agreed && <FigmaAsset asset={figmaAssets['5-62'].imgIconCheck} />}
              </View>
              <Text style={ui.body}>{agreed ? '已同意' : '同意'}用户协议与隐私政策</Text>
            </View>
          </Touch>
        )}
        <View style={ui.row}>
          {['用户协议', '隐私政策'].map((title) => (
            <Touch
              key={title}
              onPress={() => setLegal(title)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={[ui.caption, { textDecorationLine: 'underline' }]}>{title}</Text>
            </Touch>
          ))}
        </View>
      </View>
      <Text style={ui.caption}>表单界面预览 · 暂不提交账号信息</Text>
      <Sheet visible={!!legal} title={legal} onClose={() => setLegal('')}>
        <Note title="阅读面板预览">
          正式协议内容尚未接入，此处仅展示面板交互，不构成用户协议或隐私政策。
        </Note>
        <Button title="我知道了" onPress={() => setLegal('')} />
      </Sheet>
    </Screen>
  );
}
