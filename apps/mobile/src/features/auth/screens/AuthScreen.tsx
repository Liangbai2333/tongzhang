import { useEffect, useRef, useState } from 'react';
import { BackHandler, Text, View, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Screen, ui } from '@/components/Screen';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/providers/AuthProvider';
import { requestErrorMessage } from '@/components/Feedback';
import { createAuthResolver, emptyAuthForm, type AuthFormValues } from '../form';
import { AuthNotice, FormError } from '../components';
import { DocumentSheet } from '@/features/profile';

export default function AuthScreen({
  register = false,
  recovery = false,
}: {
  register?: boolean;
  recovery?: boolean;
}) {
  const auth = useAuth();
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const submitting = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    defaultValues: { ...emptyAuthForm, account: recovery ? (auth.user?.email ?? '') : '' },
    resolver: createAuthResolver(register),
  });
  const busy = isSubmitting || auth.operation !== null;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => busy);
    return () => subscription.remove();
  }, [busy]);
  const submit = handleSubmit(async (values) => {
    setRequestError(null);
    try {
      if (register)
        await auth.register({
          params: {},
          query: {},
          body: {
            username: values.account,
            email: values.email,
            password: values.password,
            acceptTerms: true,
          },
        });
      else
        await auth.login({
          params: {},
          query: {},
          body: { account: values.account, password: values.password },
        });
    } catch (error) {
      setRequestError(
        requestErrorMessage(
          error,
          register ? '暂时无法创建账号，请稍后手动重试' : '暂时无法完成登录，请稍后手动重试',
        ),
      );
    }
  });
  const send = () => {
    if (submitting.current || busy) return;
    submitting.current = true;
    void submit().finally(() => {
      submitting.current = false;
    });
  };
  const icons = figmaAssets['5-30'];
  return (
    <>
      {!recovery && <Stack.Screen options={{ gestureEnabled: !busy }} />}
      <Screen
        title={recovery ? '重新登录' : register ? '创建账号' : '欢迎回来'}
        variant={register ? 'default' : 'auth'}
        back={!recovery}
        backDisabled={busy}
        footer={
          <>
            <FormError message={requestError} />
            <View style={ui.divider} />
            <Button
              title={recovery ? '登录并继续' : register ? '注册并开始' : '登录'}
              loading={busy}
              onPress={send}
            />
            {recovery && (
              <Button
                title="放弃表单并返回登录"
                variant="quiet"
                disabled={busy}
                onPress={() => {
                  void auth.clearLocal();
                }}
              />
            )}
          </>
        }
      >
        {!recovery && <AuthNotice />}
        {!register && (
          <View style={styles.brand}>
            <View style={styles.logo}>
              <FigmaAsset asset={icons.imgIconLedger} />
            </View>
          </View>
        )}
        <View style={{ gap: 8, marginBottom: register ? 0 : 8 }}>
          <Text accessibilityRole="header" style={styles.headline}>
            {recovery
              ? '登录后继续本次操作'
              : register
                ? '从这里，一起算清。'
                : '继续你们的共同账本'}
          </Text>
          <Text style={ui.muted}>
            {recovery
              ? '登录已失效，请重新验证账号'
              : register
                ? '创建你的同账账号，开始共享记账之旅'
                : '使用账号与密码登录'}
          </Text>
        </View>
        <View style={{ gap: register ? 12 : 16 }}>
          <Controller
            control={control}
            name="account"
            render={({ field }) => (
              <Field
                label={register ? '用户名' : '账号'}
                variant={register ? 'default' : 'auth'}
                placeholder={register ? '你的名字' : '请输入邮箱 / 用户名'}
                icon={icons.imgIconUser}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.account?.message}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                returnKeyType="next"
              />
            )}
          />
          {register && (
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <Field
                  label="邮箱"
                  placeholder="请输入邮箱"
                  icon={figmaAssets['5-62'].imgMail}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.email?.message}
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
              )}
            />
          )}
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Field
                label="密码"
                variant={register ? 'default' : 'auth'}
                passwordHiddenIcon={register ? undefined : icons.imgIconEye}
                placeholder={register ? '至少 8 位字符' : '请输入密码'}
                icon={icons.imgIconLock}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.password?.message}
                editable={!busy}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={register ? 'newPassword' : 'password'}
                returnKeyType={register ? 'next' : 'go'}
                onSubmitEditing={register ? undefined : send}
              />
            )}
          />
          {register && (
            <Controller
              control={control}
              name="confirmation"
              render={({ field }) => (
                <Field
                  label="确认密码"
                  placeholder="再次输入密码"
                  icon={icons.imgIconLock}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.confirmation?.message}
                  editable={!busy}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={send}
                />
              )}
            />
          )}
        </View>
        {!recovery && (
          <View style={ui.between}>
            <Text style={ui.muted}>{register ? '已有账号？' : '还没有账号？'}</Text>
            <Touch
              disabled={busy}
              onPress={() => router.replace(register ? '/login' : '/register')}
              style={styles.link}
            >
              <Text style={ui.strong}>{register ? '登录同账 →' : '注册同账 →'}</Text>
            </Touch>
          </View>
        )}
        <View style={styles.legal}>
          <View style={[ui.row, { alignItems: 'flex-start' }]}>
            <View style={!register && { backgroundColor: colors.primary, borderRadius: 10 }}>
              <FigmaAsset asset={register ? figmaAssets['5-62'].imgIconInfo : icons.imgIconInfo} />
            </View>
            <Text style={[ui.muted, ui.grow, !register && styles.loginHint]}>
              {recovery
                ? '表单仅在本次运行中保留。使用原账号登录后可继续；登录其他账号会丢弃原表单，不会自动提交。'
                : register
                  ? '请阅读并同意用户协议与隐私说明。'
                  : '登录即表示你已阅读并同意用户协议与隐私说明。'}
            </Text>
          </View>
          {register && (
            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <Touch
                  accessibilityRole="checkbox"
                  accessibilityLabel="同意用户协议与隐私说明"
                  accessibilityState={{ checked: field.value, disabled: busy }}
                  disabled={busy}
                  onPress={() => field.onChange(!field.value)}
                  style={styles.consent}
                >
                  <View style={ui.row}>
                    <View
                      style={[styles.checkbox, field.value && { backgroundColor: colors.primary }]}
                    >
                      {field.value && <FigmaAsset asset={figmaAssets['5-62'].imgIconCheck} />}
                    </View>
                    <Text style={[ui.body, ui.grow]}>
                      {field.value ? '已同意' : '同意'}用户协议与隐私说明
                    </Text>
                  </View>
                </Touch>
              )}
            />
          )}
          <FormError message={errors.acceptTerms?.message} />
          <View style={ui.row}>
            <Touch disabled={busy} onPress={() => setLegal('terms')} style={styles.link}>
              <Text style={styles.legalLink}>用户协议</Text>
            </Touch>
            <Touch disabled={busy} onPress={() => setLegal('privacy')} style={styles.link}>
              <Text style={styles.legalLink}>隐私说明</Text>
            </Touch>
          </View>
        </View>
        <DocumentSheet document={legal} onClose={() => setLegal(null)} />
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  brand: { alignItems: 'center' },
  logo: {
    borderRadius: 36,
    width: 72,
    height: 72,
    borderWidth: 6,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { color: colors.text, fontWeight: '700', fontSize: 28, lineHeight: 40 },
  loginHint: { fontSize: 13, lineHeight: 19 },
  link: { minHeight: 44, justifyContent: 'center' },
  legal: { gap: 4, backgroundColor: colors.primarySoft, padding: 16, borderRadius: 20 },
  legalLink: { color: colors.text, fontSize: 13, textDecorationLine: 'underline' },
  consent: { paddingVertical: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
