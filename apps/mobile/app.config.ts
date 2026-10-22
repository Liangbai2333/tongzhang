import type { ExpoConfig } from 'expo/config';

const variant = process.env.APP_VARIANT ?? 'development';
if (!['development', 'production'].includes(variant))
  throw new Error('APP_VARIANT 必须为 development 或 production');
const development = variant === 'development';
if (!development) {
  let valid = false;
  try {
    const url = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? '');
    valid = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    /* Report only the variable name, never the value. */
  }
  if (!valid)
    throw new Error(
      '发布构建必须设置有效的 HTTPS EXPO_PUBLIC_API_BASE_URL（不含凭据、查询参数或片段）',
    );
}

const config: ExpoConfig = {
  name: '同账',
  slug: 'tongzhang',
  version: '0.1.0',
  platforms: ['android', 'ios'],
  orientation: 'portrait',
  scheme: 'tongzhang',
  userInterfaceStyle: 'light',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'com.tongzhang.app',
    infoPlist: development ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {},
  },
  android: {
    package: 'com.tongzhang.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#FFF8EC',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-camera',
      {
        cameraPermission: '允许同账使用相机扫描账本邀请码',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: '允许同账选择账本封面和消费收据',
        cameraPermission: '允许同账拍摄消费收据',
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      { backgroundColor: '#FAF9F6', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    [
      'expo-build-properties',
      {
        ios: { enableSceneSupport: true },
        android: { usesCleartextTraffic: development },
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
