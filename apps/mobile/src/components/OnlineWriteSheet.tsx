import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Text } from 'react-native';
import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { InlineError, requestErrorMessage } from './Feedback';
import { ui } from './Screen';

/** Keep an uncertain write mounted with its original payload/key until explicitly resolved. */
export function OnlineWriteSheet({
  title,
  confirmTitle,
  payload,
  send,
  check,
  onDone,
  onCancel,
  children,
  cancelTitle = '取消',
  plain = false,
}: {
  cancelTitle?: string;
  plain?: boolean;
  title: string;
  confirmTitle: string;
  payload: unknown;
  send: (key: string) => Promise<unknown>;
  check: () => Promise<boolean>;
  onDone: () => void;
  onCancel: () => void;
  children: (locked: boolean) => ReactNode;
}) {
  const write = useIdempotentWrite();
  const checkingLock = useRef(false);
  const mounted = useRef(true);
  const resolved = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const locked = write.busy || write.uncertain || checking;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => locked);
    return () => subscription.remove();
  }, [locked]);
  function finish() {
    if (!mounted.current || resolved.current) return;
    resolved.current = true;
    onDone();
  }
  async function submit() {
    if (checkingLock.current || resolved.current || !mounted.current) return;
    const result = await write.submit(payload, send);
    if (result) finish();
  }
  async function verify() {
    if (write.busy || checkingLock.current || resolved.current || !mounted.current) return;
    checkingLock.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const confirmed = await check();
      if (!mounted.current) return;
      if (confirmed) finish();
      else setCheckError('暂未确认操作完成；原提交已保留，请显式重试或再次在线核对。');
    } catch (cause) {
      if (mounted.current) setCheckError(requestErrorMessage(cause));
    } finally {
      checkingLock.current = false;
      if (mounted.current) setChecking(false);
    }
  }
  return (
    <Sheet
      visible
      title={title}
      variant={plain ? 'members' : 'join'}
      hideClose={!plain}
      onClose={() => {
        if (!locked) onCancel();
      }}
    >
      {children(locked)}
      <InlineError message={write.error ? requestErrorMessage(write.error) : null} />
      <InlineError message={checkError} />
      {write.uncertain && (
        <Text style={ui.body}>
          提交结果尚未确认，原内容和请求标识已保留，请显式重试或在线核对。
        </Text>
      )}
      <Button
        compact
        style={{ borderRadius: plain ? 16 : 12 }}
        title={write.uncertain ? '重试原提交' : confirmTitle}
        loading={write.busy}
        disabled={checking}
        onPress={() => {
          void submit();
        }}
      />
      {write.uncertain && (
        <Button
          title="在线核对结果"
          variant="secondary"
          loading={checking}
          disabled={write.busy}
          onPress={() => {
            void verify();
          }}
        />
      )}
      <Button
        title={cancelTitle}
        compact
        style={{ borderRadius: plain ? 16 : 12 }}
        variant={plain ? 'quiet' : 'outlined'}
        disabled={locked}
        onPress={onCancel}
      />
    </Sheet>
  );
}
