import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { figmaAssets } from './figma-assets';

export { figmaAssets };
export type DesignAsset = { source: number; width: number; height: number };

export function FigmaAsset({ asset, style }: { asset: DesignAsset; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} accessible={false} pointerEvents="none">
      <Image
        source={asset.source}
        contentFit="contain"
        // Bundled icons never need a disk cache; a poisoned one kept rendering blank strokes.
        cachePolicy="memory"
        style={{ width: asset.width, height: asset.height }}
      />
    </View>
  );
}
