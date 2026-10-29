import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { endpoints } from '../../../packages/contracts/dist/index.js';
const api = readFileSync('docs/api-reference.md', 'utf8');
const rows = api.split('\n').filter((s) => /^\| A\d\d [A-Za-z]+\s+\|/.test(s));
assert.equal(rows.length, 30);
for (const [name, e] of Object.entries(endpoints)) {
  const hits = rows.filter((s) => s.startsWith(`| ${e.id} `));
  assert.equal(hits.length, 1, e.id);
  const cells = hits[0]
    .split('|')
    .slice(1, -1)
    .map((x) => x.trim());
  assert.equal(cells[0], `${e.id} ${name}`);
  const loc = cells[1].match(/^(\w+) `([^`]+)`$/);
  assert.ok(loc, e.id);
  assert.equal(loc[1], e.method);
  assert.equal(loc[2].replace(/^L(?=\/|$)/, '/api/v1/ledgers/:ledgerId'), e.path);
  assert.equal(cells[4].startsWith('必需'), e.idempotent);
  assert.ok(cells[2].includes(String(e.statusCode)), e.id);
  assert.equal(!['A01', 'A02', 'A30'].includes(e.id), e.authenticated);
  assert.ok(
    readFileSync(`apps/server/src/modules/${e.module}/routes.ts`, 'utf8').includes(
      `'${name}', service.${name}`,
    ),
    name,
  );
}
let links = 0;
for (const file of [
  'README.md',
  'docs/app-user-guide.md',
  'docs/known-limitations.md',
  'docs/api-reference.md',
  'docs/development.md',
  'docs/environment-setup.md',
]) {
  for (const [, href] of readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    assert.ok(existsSync(resolve(dirname(file), href.split('#')[0])), `${file}: ${href}`);
    links++;
  }
}
const result = {
  source: 'df4d773c8d724b0cf453b0baa0764f6871f1a103',
  endpointRows: rows.length,
  localFileLinks: links,
  result: 'PASS',
};
writeFileSync(
  'docs/evidence/day7-delivery/document-audit.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(result);
