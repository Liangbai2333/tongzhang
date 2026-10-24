const shared = {
  testMatch: ['<rootDir>/tests/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|react-native-svg))',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
};
module.exports = {
  // Cold CI workers can spend more than 5 seconds loading React Native on the first render.
  testTimeout: 15_000,
  projects: [
    { ...shared, preset: 'jest-expo/ios', displayName: 'iOS' },
    { ...shared, preset: 'jest-expo/android', displayName: 'Android' },
  ],
};
