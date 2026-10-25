import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import { ApiError } from '@/lib/api-error';

/** Only app-cache files created for the active selection are removed; never touch library originals. */
export function removeReceiptFile(uri: string) {
  if (!uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* Best-effort removal of temporary media. */
  }
}
export async function selectReceipt(
  camera: boolean,
): Promise<{ uri: string; byteSize: number } | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
    throw new ApiError('CAMERA_PERMISSION', '未获得相机权限，可从相册选择收据');
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
  };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || asset.width < 1 || asset.height < 1) {
    if (asset) removeReceiptFile(asset.uri);
    throw new ApiError('INVALID_IMAGE', '无法读取图片，请重新选择');
  }
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let output:
    Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | undefined;
  try {
    context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > 2048)
      context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
    output = await context.renderAsync();
    for (const compress of [0.8, 0.6, 0.4, 0.2]) {
      const image = await output.saveAsync({ format: SaveFormat.JPEG, compress });
      const size = new File(image.uri).size;
      if (size > 0 && size <= MAX_IMAGE_BYTES) return { uri: image.uri, byteSize: size };
      removeReceiptFile(image.uri);
    }
    throw new ApiError('IMAGE_TOO_LARGE', '压缩后图片仍超过 1 MiB，请选择尺寸更小的图片');
  } finally {
    output?.release();
    context?.release();
    removeReceiptFile(asset.uri);
  }
}
