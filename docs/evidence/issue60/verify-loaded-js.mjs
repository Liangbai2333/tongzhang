import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const adb = process.env.ADB ?? '/Users/liangbai/Library/Android/sdk/platform-tools/adb';
const device = execFileSync(
  adb,
  [
    'exec-out',
    'run-as',
    'com.tongzhang.app',
    'cat',
    'files/DevLauncherApp-BridgelessReactNativeDevBundle.js',
  ],
  { maxBuffer: 30_000_000 },
);
const sourceMapUrl = device.toString('utf8').match(/sourceMappingURL=(.*)/)?.[1];
assert.ok(sourceMapUrl?.startsWith('http://127.0.0.1:8060/'));
const get = (url) =>
  execFileSync(
    'curl',
    ['-fsS', '--noproxy', '*', '--connect-to', '127.0.0.1:8060:[::1]:8060', url],
    {
      maxBuffer: 30_000_000,
    },
  );
const map = JSON.parse(get(sourceMapUrl));
const current = get(sourceMapUrl.replace('entry.map', 'entry.bundle'));
assert.ok(device.equals(current), 'Device bundle differs from Metro');
assert.ok(device.includes(Buffer.from('http://127.0.0.1:3360')));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const matched = [];
for (let i = 0; i < map.sources.length; i++) {
  const source = map.sources[i];
  const k = source.indexOf('/apps/mobile/');
  if (k === -1 || source.includes('node_modules') || !/\.(tsx?|jsx?)$/.test(source)) continue;
  const path = source.slice(k + 1);
  assert.equal(map.sourcesContent[i], readFileSync(path, 'utf8'), path);
  matched.push({ path, sha256: hash(map.sourcesContent[i]) });
}
assert.ok(matched.length >= 103);
writeFileSync(
  'docs/evidence/issue60/loaded-js.json',
  JSON.stringify(
    {
      verifiedAtUtc: new Date().toISOString(),
      candidate: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      deviceBundleSha256: hash(device),
      currentBundleSha256: hash(current),
      exactDeviceBundle: true,
      bytes: device.length,
      apiBaseUrl: 'http://127.0.0.1:3360',
      sourceMapUrl,
      matched,
      mismatches: [],
    },
    null,
    2,
  ) + '\n',
);
console.log(`${matched.length} source files and the exact device bundle match this worktree.`);
