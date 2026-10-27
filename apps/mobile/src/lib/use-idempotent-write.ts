import { useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { ApiError } from './api-error';
import { createIdempotencyKey } from './api';

const RETRY_WINDOW = 24 * 60 * 60 * 1000;

/** One in-memory attempt per payload. Only an explicit user action can resend it. */
export function useIdempotentWrite() {
  const locked = useRef(false);
  const completed = useRef(false);
  const unresolved = useRef(false);
  const mounted = useRef(true);
  const attempt = useRef<{ payload: string; key: string; startedAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => busy);
    return () => subscription.remove();
  }, [busy]);

  async function submit<T>(
    body: unknown,
    send: (key: string) => Promise<T>,
  ): Promise<T | undefined> {
    if (locked.current || completed.current) return;
    const payload = JSON.stringify(body);
    if (attempt.current && Date.now() - attempt.current.startedAt >= RETRY_WINDOW) {
      setError(
        new ApiError(
          'RETRY_WINDOW_EXPIRED',
          '本次提交已超过 24 小时，请返回账本列表在线核对结果后再操作',
        ),
      );
      return;
    }
    if (unresolved.current && attempt.current?.payload !== payload) {
      setError(
        new ApiError('RESULT_UNKNOWN', '上次提交结果尚未确认，请先重试原提交或返回列表核对'),
      );
      return;
    }
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: createIdempotencyKey(), startedAt: Date.now() };
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await send(attempt.current!.key);
      if (!mounted.current) return;
      completed.current = true;
      unresolved.current = false;
      setUncertain(false);
      return result;
    } catch (cause) {
      if (mounted.current) {
        setError(cause);
        // A rejected retry says nothing about an earlier request that may have committed.
        // Only a confirmed success or the caller's explicit online reconciliation resolves it.
        unresolved.current =
          unresolved.current ||
          !(cause instanceof ApiError) ||
          ['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'HTTP_ERROR'].includes(
            cause.code,
          ) ||
          (cause.status ?? 0) >= 500;
        setUncertain(unresolved.current);
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function reset() {
    if (locked.current || unresolved.current) return;
    completed.current = false;
    attempt.current = null;
    setError(null);
  }
  return { busy, error, uncertain, submit, reset };
}
