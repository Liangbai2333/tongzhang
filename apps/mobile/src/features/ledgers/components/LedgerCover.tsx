import { AuthorizedImage } from '@/features/images/components/ReceiptImage';
import { StyleSheet, Text, View } from 'react-native';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { ledgerAssets } from '@/icons/ledger-assets';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { covers, type CoverKey } from '../presentation';

export function LedgerCover({
  coverKey,
  imageId,
  preview = false,
}: {
  coverKey: CoverKey | null;
  imageId?: string | null;
  preview?: boolean;
}) {
  if (imageId)
    return (
      <View style={{ width: preview ? '100%' : 36, borderRadius: 12, overflow: 'hidden' }}>
        <AuthorizedImage imageId={imageId} label="账本封面" height={preview ? 180 : 36} />
      </View>
    );
  const cover = covers[coverKey ?? 'plain'];
  const asset =
    coverKey === 'mountain'
      ? ledgerAssets.mountain
      : coverKey === 'dining'
        ? ledgerAssets.dining
        : coverKey === 'plain'
          ? ledgerAssets.daily
          : ledgerAssets.ledger;
  if (!preview)
    return (
      <View style={styles.tile}>
        <FigmaAsset asset={asset} />
      </View>
    );
  return (
    <View style={styles.preview}>
      <View style={styles.previewIcon}>
        {coverKey === 'mountain' ? (
          <FigmaAsset asset={ledgerAssets.coverMountain} />
        ) : (
          <View style={{ transform: [{ scale: 56 / asset.width }] }}>
            <FigmaAsset asset={asset} />
          </View>
        )}
      </View>
      <Text style={ui.heading}>{coverKey === 'mountain' ? '山野一日' : cover.label}</Text>
      <Text style={ui.caption}>预设封面</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: 20,
    gap: 8,
  },
  previewIcon: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
});
