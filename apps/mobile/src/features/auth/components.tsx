import { Text, View, StyleSheet } from 'react-native';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/providers/AuthProvider';

export function AuthNotice() {
  const { notice, dismissNotice, clearLocal, operation } = useAuth();
  if (!notice) return null;
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Text style={ui.body}>{notice}</Text>
      {notice.includes('未能完全清除') ? (
        <Button
          title="重试清除本机凭据"
          loading={operation === 'logout'}
          onPress={() => {
            void clearLocal();
          }}
        />
      ) : (
        <Button title="知道了" variant="quiet" onPress={dismissNotice} />
      )}
    </View>
  );
}
export function FormError({ message }: { message?: string | null }) {
  return message ? (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      {message}
    </Text>
  ) : null;
}
export function LegalSheet({
  document,
  onClose,
}: {
  document: 'terms' | 'privacy' | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={document !== null}
      title={document === 'privacy' ? '隐私说明 · 课程联调版' : '用户协议 · 课程联调版'}
      onClose={onClose}
    >
      <Text style={ui.caption}>
        以下说明适用于当前课程联调版本；正式协议正文由项目维护者后续发布。
      </Text>
      {document === 'privacy' ? (
        <>
          <Text style={ui.heading}>账号与登录凭据</Text>
          <Text style={ui.body}>
            注册时服务端保存用户名、邮箱和密码哈希，不保存明文密码。设备安全存储只保存用于续期登录的凭据；用户资料在每次启动时联网核验。
          </Text>
          <Text style={ui.heading}>共同账目与图片</Text>
          <Text style={ui.body}>
            账本、消费、分摊及收据等内容保存于服务端，同一账本的成员可按权限访问。业务数据不作为离线缓存长期保存在设备上。
          </Text>
          <Text style={ui.heading}>退出与数据处理</Text>
          <Text style={ui.body}>
            在线退出撤销当前会话并清除本机凭据，不会删除已保存的账号或账目。当前版本尚未提供账号注销入口，如需处理数据，请联系项目维护者。
          </Text>
        </>
      ) : (
        <>
          <Text style={ui.heading}>使用范围</Text>
          <Text style={ui.body}>
            同账用于共同消费的记录、分摊和结算方案。请使用你有权使用的邮箱注册，并妥善保管账号密码。
          </Text>
          <Text style={ui.heading}>账目与还款</Text>
          <Text style={ui.body}>
            请核对金额、付款人与分摊成员后再保存。“登记已还”仅是成员人工记录，不代表银行或支付平台确认到账。本应用不提供真实支付。
          </Text>
          <Text style={ui.heading}>在线使用</Text>
          <Text style={ui.body}>
            账号核验和业务操作需要联网。提交失败或超时时，请核对结果后手动重试。请勿上传无权分享的个人信息或收据。
          </Text>
        </>
      )}
      <Button title="返回表单" onPress={onClose} />
    </Sheet>
  );
}
const styles = StyleSheet.create({
  notice: { backgroundColor: colors.primarySoft, padding: 16, borderRadius: 16, gap: 4 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
