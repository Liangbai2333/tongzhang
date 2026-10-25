import { Text } from 'react-native';
import { Button } from '@/components/Button';
import { InlineError, requestErrorMessage } from '@/components/Feedback';
import { ui } from '@/components/Screen';

export function ResetInvitationContent({
  busy,
  uncertain,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  uncertain: boolean;
  error: unknown;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Text style={ui.body}>旧邀请码和二维码将立即失效。已加入的成员不受影响。</Text>
      <InlineError message={error ? requestErrorMessage(error) : null} />
      {uncertain && <Text style={ui.muted}>结果尚未确认，请重试原重置，或返回账本在线核对。</Text>}
      <Button
        compact
        title={uncertain ? '重试原重置' : '确认重置'}
        loading={busy}
        onPress={onSubmit}
      />
      <Button
        compact
        title={uncertain ? '返回账本核对' : '取消'}
        variant="quiet"
        disabled={busy}
        onPress={onCancel}
      />
    </>
  );
}
