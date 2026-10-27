import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const {
  configureMainApplication,
} = require('../../apps/mobile/plugins/with-explicit-network-retries.cjs');

it('configures the shared native fetch factory before React starts, and survives repeated Prebuild', () => {
  const application =
    'override fun onCreate() {\n    super.onCreate()\n    loadReactNative(this)\n}';
  const generated = configureMainApplication(application, 'kt');
  expect(generated.indexOf('setOkHttpClientFactory')).toBeLessThan(
    generated.indexOf('loadReactNative'),
  );
  expect(generated).toContain('.retryOnConnectionFailure(false)');
  expect(generated).toContain('.followRedirects(false)');
  expect(generated).toContain('.followSslRedirects(false)');
  expect(configureMainApplication(generated, 'kt')).toBe(generated);
});
it('fails Prebuild rather than silently leaving automatic retries enabled on an unknown native template', () => {
  expect(() => configureMainApplication('class OtherApplication {}', 'kt')).toThrow('anchor');
  expect(() => configureMainApplication('super.onCreate()', 'java')).toThrow('Kotlin');
});
