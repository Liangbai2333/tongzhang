import { useEffect, useRef, useState } from 'react';
import { requestErrorMessage } from '@/components/Feedback';
import { imagesApi } from './api';
import { removeReceiptFile, selectReceipt } from './receipt-files';
export type ReceiptSelection = { uri: string; byteSize: number; imageId?: string };
export function useReceipt(ledgerId: string) {
  const [value, setValue] = useState<ReceiptSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(value);
  const locked = useRef(false);
  const mounted = useRef(true);
  function update(next: ReceiptSelection | null) {
    current.current = next;
    setValue(next);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (current.current) removeReceiptFile(current.current.uri);
    };
  }, []);
  async function select(camera: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const selected = await selectReceipt(camera);
      if (!selected) return;
      if (!mounted.current) {
        removeReceiptFile(selected.uri);
        return;
      }
      if (current.current) removeReceiptFile(current.current.uri);
      update(selected);
    } catch (cause) {
      if (mounted.current) setError(requestErrorMessage(cause));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function upload(): Promise<string | null | undefined> {
    if (locked.current) return undefined;
    const selected = current.current;
    if (!selected) return null;
    if (selected.imageId) return selected.imageId;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await imagesApi.upload(
        { kind: 'RECEIPT', ledgerId },
        { uri: selected.uri, name: 'receipt.jpg', type: 'image/jpeg' },
      );
      if (!mounted.current) return undefined;
      update({ ...selected, imageId: result.data.imageId });
      return result.data.imageId;
    } catch (cause) {
      if (mounted.current) setError(requestErrorMessage(cause));
      return undefined;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function remove() {
    if (locked.current) return;
    if (current.current) removeReceiptFile(current.current.uri);
    update(null);
    setError(null);
  }
  return { value, busy, error, select, upload, remove };
}
