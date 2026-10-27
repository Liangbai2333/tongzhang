import { ActivityIndicator, Text, View } from 'react-native';
import { Touch } from '@/components/Touch';
import { colors } from '@/theme/tokens';
import { Image } from 'expo-image';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import { RequestState } from '@/components/Feedback';
import { useOnlineQuery } from '@/lib/use-online-query';
import { ApiError } from '@/lib/api-error';
import { useAuth } from '@/providers/AuthProvider';
import { imagesApi } from '../api';
/** In-memory encoding keeps authorized business images out of file and image caches. */
export function imageDataUri(content: Uint8Array, mimeType: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < content.length; i += 3) {
    const a = content[i]!;
    const b = content[i + 1];
    const c = content[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    base64 +=
      alphabet[(n >>> 18) & 63]! +
      alphabet[(n >>> 12) & 63]! +
      (b === undefined ? '=' : alphabet[(n >>> 6) & 63]!) +
      (c === undefined ? '=' : alphabet[n & 63]!);
  }
  return `data:${mimeType};base64,${base64}`;
}
export function AuthorizedImage({
  imageId,
  label = '收据图片',
  height = 340,
}: {
  imageId: string;
  label?: string;
  height?: number;
}) {
  const { user } = useAuth();
  const query = useOnlineQuery(['user', user!.id, 'image', imageId], async () => {
    const result = await imagesApi.read(imageId);
    if (result.content.byteLength > MAX_IMAGE_BYTES)
      throw new ApiError('INVALID_IMAGE', '图片超过允许大小');
    return imageDataUri(result.content, result.mimeType);
  });
  if (height <= 60 && (query.isPending || query.isFetching || query.isError))
    return (
      <View style={{ height, width: height, alignItems: 'center', justifyContent: 'center' }}>
        {query.isError ? (
          <Touch
            accessibilityRole="button"
            accessibilityLabel="重新读取账本封面"
            onPress={() => {
              void query.refetch();
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 10 }}>重试</Text>
          </Touch>
        ) : (
          <ActivityIndicator size="small" color={colors.muted} />
        )}
      </View>
    );
  if (query.isPending || query.isFetching || query.isError)
    return (
      <RequestState
        loading={query.isPending || query.isFetching}
        title={`暂时无法读取${label}`}
        description="图片需在线核验成员权限，请手动重试。"
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  return (
    <Image
      accessible
      accessibilityLabel={label}
      source={{ uri: query.data }}
      cachePolicy="none"
      contentFit="contain"
      style={{ width: '100%', height }}
    />
  );
}

export function ReceiptImage({ imageId }: { imageId: string }) {
  return <AuthorizedImage imageId={imageId} />;
}
