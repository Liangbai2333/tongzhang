import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Run from the repository root after collecting loaded-js.json from the device.
// A matching old screenshot proves integrity, not a new device execution.
const day5 = 'af03672fb929caa26db1b407039a436e9cbf4e4e';
const base = 'cf6058a3452cb7bf886dbdeae2d2c2a0489882b1';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const retestedPaths = [
  'apps/mobile/app/_layout.tsx',
  'apps/mobile/src/components/Field.tsx',
  'apps/mobile/src/components/Screen.tsx',
  'apps/mobile/src/features/auth/controller.ts',
  'apps/mobile/src/features/auth/screens/AuthScreen.tsx',
  'apps/mobile/src/features/images/api.ts',
  'apps/mobile/src/lib/api.ts',
  'apps/mobile/src/lib/auth-session.ts',
  'apps/mobile/src/lib/session-admission.ts',
  'apps/mobile/src/providers/AuthProvider.tsx',
];
const runtimePaths = [
  'apps/mobile/app',
  'apps/mobile/src',
  'apps/mobile/assets',
  'apps/mobile/plugins',
  'apps/mobile/app.config.ts',
  'apps/mobile/package.json',
  'apps/server/src',
  'apps/server/drizzle',
  'packages',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];
const changed = git('diff', '--name-only', day5, '--', ...runtimePaths)
  .split('\n')
  .filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...runtimePaths)
  .split('\n')
  .filter(Boolean);
for (const path of [...changed, ...untracked]) assert.ok(retestedPaths.includes(path), path);
const loaded = json('docs/evidence/issue48/loaded-js.json');
const small = json('docs/evidence/issues46-47/native-manifest.json');
const fresh = json('docs/evidence/issues58-59/loaded-js.json');
assert.equal(fresh.exactDeviceBundle, true);
assert.equal(fresh.deviceBundleSha256, fresh.currentBundleSha256);
assert.equal(fresh.matched.length, 103);
for (const file of fresh.matched) assert.equal(hash(file.path), file.sha256, file.path);
for (const path of retestedPaths)
  assert.ok(
    fresh.matched.some((f) => f.path === path),
    path,
  );
const sourceChecks = [
  ...loaded.sourceMapMatchingFiles.map(({ path, sha256 }) => ({ path, expected: sha256 })),
  ...Object.entries(small.sourceSha256).map(([path, expected]) => ({ path, expected })),
].map((item) => ({
  ...item,
  actual: hash(item.path),
  retested: retestedPaths.includes(item.path),
}));
for (const item of sourceChecks)
  if (!item.retested) assert.equal(item.actual, item.expected, item.path);
const oldManifest = json('docs/evidence/issue48/manifest.json');
const screenshotChecks = [
  ...Object.entries(oldManifest.files)
    .filter(([name]) => name.endsWith('.png'))
    .map(([name, value]) => ({ path: `docs/evidence/issue48/${name}`, expected: value.sha256 })),
  ...Object.entries(small.screenshots).map(([name, expected]) => ({
    path: `docs/evidence/issues46-47/${name}`,
    expected,
  })),
].map((item) => ({ ...item, actual: hash(item.path) }));
for (const item of screenshotChecks) assert.equal(item.actual, item.expected, item.path);
assert.equal(sourceChecks.length, 204);
assert.equal(screenshotChecks.length, 65);
writeFileSync(
  'docs/evidence/issues58-59/reuse-verification.json',
  JSON.stringify(
    {
      verifiedAtUtc: new Date().toISOString(),
      base,
      verificationHead: git('rev-parse', 'HEAD'),
      reusedDay5Candidate: day5,
      retestedPaths,
      changedRuntimeFiles: [...new Set([...changed, ...untracked])],
      newNativeExecution: true,
      freshDeviceBundleSha256: fresh.deviceBundleSha256,
      old401EvidenceSuperseded: true,
      sourceChecks,
      screenshotChecks,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  '103 current native sources match; unchanged Day5 sources and 65 original screenshots verified.',
);
