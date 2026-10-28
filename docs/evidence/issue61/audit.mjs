import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { format } from 'prettier';
import { endpoints } from '../../../packages/contracts/dist/index.js';

// Run from the repository root after pnpm build:shared. No network or database access.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const candidate = 'bade61230ee3434d5bba443a7e258289d1cec057';
const runtime = [
  'apps',
  'packages',
  'pnpm-lock.yaml',
  'package.json',
  'scripts',
  'infra',
  '.github',
];
const differences = (base, paths) => git('diff', '--name-only', base, 'HEAD', '--', ...paths);
assert.equal(differences(candidate, runtime), '');
assert.equal(differences('adff4d8', runtime), '');
assert.equal(git('diff', '--name-only', 'HEAD', '--', ...runtime), '');
assert.equal(git('ls-files', '--others', '--exclude-standard', '--', ...runtime), '');
assert.equal(differences('7616adb', ['packages', 'apps/server/src', 'apps/server/drizzle']), '');
const lifecycleChanges = differences('89d0166', runtime).split('\n');
assert.deepEqual(lifecycleChanges, [
  'apps/mobile/src/features/auth/controller.ts',
  'apps/mobile/tests/auth-controller.test.ts',
]);
const nativeInputs = [
  'apps/mobile/package.json',
  'pnpm-lock.yaml',
  'apps/mobile/app.config.ts',
  'apps/mobile/plugins',
  'apps/mobile/assets',
];
assert.equal(differences('2097271', nativeInputs), '');

const api = read('docs/api-reference.md');
const rows = api.split('\n').filter((line) => /^\| A\d\d [A-Za-z]+\s+\|/.test(line));
assert.equal(rows.length, 30);
const checkedEndpoints = Object.entries(endpoints)
  .sort(([, a], [, b]) => a.id.localeCompare(b.id))
  .map(([operation, endpoint]) => {
    const matched = rows.filter((line) => line.startsWith(`| ${endpoint.id} `));
    assert.equal(matched.length, 1, endpoint.id);
    const cells = matched[0]
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    assert.equal(cells[0], `${endpoint.id} ${operation}`);
    const location = cells[1].match(/^(\w+) `([^`]+)`$/);
    assert.ok(location, endpoint.id);
    assert.equal(location[1], endpoint.method);
    assert.equal(location[2].replace(/^L(?=\/|$)/, '/api/v1/ledgers/:ledgerId'), endpoint.path);
    assert.equal(cells[4].startsWith('必需'), endpoint.idempotent);
    assert.ok(cells[2].includes(String(endpoint.statusCode)), endpoint.id);
    assert.equal(!['A01', 'A02', 'A30'].includes(endpoint.id), endpoint.authenticated);
    const routes = read(`apps/server/src/modules/${endpoint.module}/routes.ts`);
    assert.ok(routes.includes(`'${operation}', service.${operation}`), operation);
    return {
      id: endpoint.id,
      operation,
      method: endpoint.method,
      path: endpoint.path,
      contractStatus: endpoint.statusCode,
      authenticated: endpoint.authenticated,
      idempotent: endpoint.idempotent,
      transport: endpoint.transport,
    };
  });
const manifestChecks = [];
for (const issue of ['issue49', 'issues58-59', 'issue60']) {
  const root = `docs/evidence/${issue}/`;
  const manifest = json(root + 'manifest.json');
  const files = Array.isArray(manifest.files)
    ? manifest.files.map((entry) => [entry.path, entry])
    : Object.entries(manifest.files);
  for (const [name, entry] of files) assert.equal(hash(root + name), entry.sha256, root + name);
  manifestChecks.push({ issue, checkedFiles: files.length, sha256: hash(root + 'manifest.json') });
}
const sourceChecks = [];
for (const issue of ['issues58-59', 'issue60']) {
  const loaded = json(`docs/evidence/${issue}/loaded-js.json`);
  assert.equal(loaded.exactDeviceBundle, true);
  for (const file of loaded.matched) assert.equal(hash(file.path), file.sha256, file.path);
  sourceChecks.push({
    issue,
    originalCandidate: loaded.candidate ?? json(`docs/evidence/${issue}/manifest.json`).candidate,
    matchedSources: loaded.matched.length,
  });
}

// Reuse the existing assertions while redirecting only their generated result to this issue.
// Historical reports, manifests and assertion outputs must remain byte-for-byte unchanged.
for (const [script, previousOutput, output] of [
  [
    'docs/evidence/issue60/verify-reuse.mjs',
    'docs/evidence/issue60/reuse-verification.json',
    'reuse.json',
  ],
  [
    'docs/evidence/issues58-59/verify-native-evidence.mjs',
    "root + 'native-verification.json'",
    'native-assertions.json',
  ],
]) {
  const source = read(script);
  const replacement = `'docs/evidence/issue61/${output}'`;
  const target = previousOutput.startsWith('root +') ? previousOutput : `'${previousOutput}'`;
  assert.equal(source.split(target).length, 2);
  execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    source.replace(target, replacement),
  ]);
}

function anchors(path) {
  const seen = new Map();
  return read(path)
    .split('\n')
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) => {
      const slug = line
        .replace(/^#+ /, '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
        .replace(/\s/g, '-');
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      return count ? `${slug}-${count}` : slug;
    });
}
const documents = [
  'README.md',
  'docs/app-user-guide.md',
  'docs/api-reference.md',
  'docs/known-limitations.md',
  'docs/environment-setup.md',
  'docs/issue61-candidate-documentation-validation.md',
  'docs/issue49-documentation-validation.md',
  'docs/issues58-59-final-acceptance.md',
  'docs/issue60-native-candidate-validation.md',
];
const linkChecks = documents.map((document) => {
  let localLinks = 0;
  let fragments = 0;
  for (const match of read(document).matchAll(/!?\[[^\]]*\]\(([^)\n]+)\)/g)) {
    const href = match[1];
    if (/^[a-z]+:/i.test(href)) continue;
    const [file, fragment] = href.split('#');
    const target = file ? resolve(dirname(document), decodeURIComponent(file)) : resolve(document);
    assert.ok(existsSync(target), `${document}: ${href}`);
    localLinks++;
    if (fragment) {
      assert.ok(anchors(target).includes(decodeURIComponent(fragment)), `${document}: ${href}`);
      fragments++;
    }
  }
  return { document, localLinks, fragments };
});
writeFileSync(
  'docs/evidence/issue61/audit.json',
  JSON.stringify(
    {
      checkedAtUtc: new Date().toISOString(),
      candidate,
      executedHead: git('rev-parse', 'HEAD'),
      changedRuntimeFilesSinceFinalDay6: [],
      unchangedServerAndContractsSince: '7616adb',
      lifecycleChanges,
      unchangedNativeInputsSince: '2097271',
      historicalEvidenceIsNewExecution: false,
      endpoints: checkedEndpoints,
      manifestChecks,
      sourceChecks,
      linkChecks,
      checksPassed: true,
    },
    null,
    2,
  ) + '\n',
);
for (const name of ['audit.json', 'reuse.json', 'native-assertions.json']) {
  const path = `docs/evidence/issue61/${name}`;
  writeFileSync(path, await format(read(path), { ...json('.prettierrc.json'), filepath: path }));
}
console.log(
  `PASS: ${checkedEndpoints.length} endpoints, ${documents.length} documents, historical hashes and SQL/HTTP assertions. No device or business request executed.`,
);
