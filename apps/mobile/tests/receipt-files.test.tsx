import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as ImagePicker from 'expo-image-picker';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import { removeReceiptFile, selectReceipt } from '../src/features/images/receipt-files';
const mockDelete = jest.fn<(uri: string) => void>();
let mockSizes: Record<string, number> = {};
const mockSave =
  jest.fn<(options: unknown) => Promise<{ uri: string; width: number; height: number }>>();
const mockOutput = { saveAsync: mockSave, release: jest.fn() };
const mockContext = {
  resize: jest.fn(),
  renderAsync: jest.fn(async () => mockOutput),
  release: jest.fn(),
};
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: () => mockContext },
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    constructor(public mockUri: string) {}
    get size() {
      return mockSizes[this.mockUri] ?? 100;
    }
    get exists() {
      return true;
    }
    delete() {
      mockDelete(this.mockUri);
    }
  },
}));
const gallery = jest.mocked(ImagePicker.launchImageLibraryAsync);
beforeEach(() => {
  jest.clearAllMocks();
  mockSizes = {};
  mockSave.mockReset();
  mockSave.mockResolvedValue({ uri: 'file:///cache/compressed.jpg', width: 1536, height: 2048 });
  mockContext.renderAsync.mockResolvedValue(mockOutput);
  gallery.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/picker.png', width: 3000, height: 4000 }],
  });
});
describe('receipt preparation using native API replacements (not a device test)', () => {
  it('preserves cancellation without creating or deleting media', async () => {
    gallery.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await selectReceipt(false)).toBeNull();
    expect(mockContext.renderAsync).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
  it('enforces the byte limit, discards oversized intermediates and strips the picker copy while preserving the accepted temporary output', async () => {
    mockSizes = {
      'file:///cache/large.jpg': MAX_IMAGE_BYTES + 1,
      'file:///cache/compressed.jpg': MAX_IMAGE_BYTES,
    };
    mockSave.mockResolvedValueOnce({ uri: 'file:///cache/large.jpg', width: 1536, height: 2048 });
    expect(await selectReceipt(false)).toEqual({
      uri: 'file:///cache/compressed.jpg',
      byteSize: MAX_IMAGE_BYTES,
    });
    expect(mockContext.resize).toHaveBeenCalledWith({ height: 2048 });
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/large.jpg');
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/picker.png');
    expect(mockDelete).not.toHaveBeenCalledWith('file:///cache/compressed.jpg');
    expect(mockOutput.release).toHaveBeenCalledTimes(1);
  });
  it('cleans up the selection even if native decoding fails and never deletes a library original', async () => {
    mockContext.renderAsync.mockRejectedValueOnce(new Error('decode failed'));
    await expect(selectReceipt(false)).rejects.toThrow('decode failed');
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/picker.png');
    expect(mockContext.release).toHaveBeenCalled();
    removeReceiptFile('ph://library-original');
    expect(mockDelete).not.toHaveBeenCalledWith('ph://library-original');
  });
  it('rejects invalid metadata and clears its cache copy', async () => {
    gallery.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cache/invalid.png', width: 0, height: 0 }],
    });
    await expect(selectReceipt(false)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/invalid.png');
  });
  it('denies camera access without launching capture when permission is refused', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false } as Awaited<
        ReturnType<typeof ImagePicker.requestCameraPermissionsAsync>
      >);
    await expect(selectReceipt(true)).rejects.toMatchObject({ code: 'CAMERA_PERMISSION' });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
