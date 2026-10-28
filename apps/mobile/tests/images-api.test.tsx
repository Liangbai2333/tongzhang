import { beforeEach, describe, expect, it, jest } from '@jest/globals';
const { installFormDataPatch } = jest.requireActual<typeof import('expo/src/winter/FormData')>(
  'expo/src/winter/FormData',
);
const { convertFormDataAsync } = jest.requireActual<
  typeof import('expo/src/winter/fetch/convertFormData')
>('expo/src/winter/fetch/convertFormData');
import { imagesApi } from '../src/features/images/api';
import { requestJson } from '../src/lib/http';
import { sessionAdmission } from '../src/lib/session-admission';
import { callOperation } from '../src/lib/api';
const mockBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
jest.mock('expo-file-system', () => ({
  File: class {
    name = 'receipt.jpg';
    type = 'image/jpeg';
    bytes = async () => mockBytes;
    constructor(public mockUri: string) {}
  },
}));
jest.mock('../src/lib/http', () => ({ requestJson: jest.fn(), requestImage: jest.fn() }));
jest.mock('../src/lib/session-token', () => ({
  sessionToken: {
    authorized: (send: (token: string) => Promise<unknown>) => send('test-access-token'),
  },
}));
beforeEach(() => {
  sessionAdmission.set(true);
  jest.clearAllMocks();
  const NativeFormData = jest.requireActual<{ default: typeof FormData }>(
    'react-native/Libraries/Network/FormData',
  ).default;
  global.FormData = installFormDataPatch(NativeFormData) as unknown as typeof FormData;
  jest.mocked(requestJson).mockResolvedValue({
    data: {
      imageId: '00000000-0000-4000-8000-000000000001',
      mimeType: 'image/jpeg',
      byteSize: 4,
      width: 1,
      height: 1,
    },
  });
});
describe('image multipart transport with the installed SDK 57 encoder', () => {
  it('blocks JSON business writes while allowing the explicit identity verification request', async () => {
    sessionAdmission.set(false);
    await expect(
      callOperation(
        'createLedger',
        { params: {}, query: {}, body: { name: 'retained', coverKey: 'plain' } },
        { idempotencyKey: '00000000-0000-4000-8000-000000000003' },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_VERIFICATION_REQUIRED' });
    expect(requestJson).not.toHaveBeenCalled();
    await callOperation('getMe', { params: {}, query: {}, body: undefined });
    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(jest.mocked(requestJson).mock.calls[0]![0]).toBe('/api/v1/me');
  });
  it('blocks an upload while reauthentication has credentials but no verified admission', async () => {
    sessionAdmission.set(false);
    await expect(
      imagesApi.upload(
        { kind: 'COVER' },
        { uri: 'file:///cache/cover.jpg', name: 'cover.jpg', type: 'image/jpeg' },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_VERIFICATION_REQUIRED' });
    expect(requestJson).not.toHaveBeenCalled();
  });
  it('encodes real File bytes, metadata and MIME instead of the unsupported URI-only FormData part', async () => {
    await imagesApi.upload(
      { kind: 'RECEIPT', ledgerId: '00000000-0000-4000-8000-000000000002' },
      { uri: 'file:///cache/receipt.jpg', name: 'receipt.jpg', type: 'image/jpeg' },
    );
    const call = jest.mocked(requestJson).mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/images');
    expect(call[2]).toEqual(
      expect.objectContaining({ method: 'POST', token: 'test-access-token' }),
    );
    const encoded = await convertFormDataAsync(call[2]!.formData!, 'test-boundary');
    const bytes = Array.from(encoded.body);
    expect(bytes.join(',')).toContain(Array.from(mockBytes).join(','));
    const ascii = String.fromCharCode(...encoded.body);
    expect(ascii).toContain('name="kind"\r\n\r\nRECEIPT');
    expect(ascii).toContain('name="file"; filename="receipt.jpg"');
    expect(ascii).toContain('content-type: image/jpeg');
    expect(ascii).not.toContain('file:///cache/receipt.jpg');
  });
});
