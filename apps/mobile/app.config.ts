import type { ExpoConfig } from 'expo/config';

const development = process.env.APP_VARIANT !== 'production';

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
      'expo-splash-screen',
      { backgroundColor: '#FAF9F6', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    ['expo-build-properties', { android: { usesCleartextTraffic: development } }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
