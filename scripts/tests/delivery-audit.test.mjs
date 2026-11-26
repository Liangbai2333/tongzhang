import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { endpoints } from '../../packages/contracts/dist/index.js';
import {
  auditApiReference,
  auditMarkdownLinks,
  auditStale501,
  extractMarkdownAnchors,
  runDeliveryAudit,
  slugifyHeading,
} from '../audit-delivery.mjs';

describe('delivery audit script (B22 preflight)', () => {
  it('slugifies headings using GitHub anchor rules including CJK and repeated separators', () => {
    expect(slugifyHeading('#58：T16 / T27 正反路径')).toBe('58t16--t27-正反路径');
    expect(slugifyHeading('3. 组外真实用户调查（≥ 12 人）候选同学安排（衔接 `B18` / `B19`）')).toBe(
      '3-组外真实用户调查-12-人候选同学安排衔接-b18--b19',
    );
    expect(slugifyHeading('独立 Android APK 下载校验与安装')).toBe(
      '独立-android-apk-下载校验与安装',
    );

    const anchors = extractMarkdownAnchors('# Title\n\n## Repeat\n\n## Repeat\n');
    expect(anchors.has('title')).toBe(true);
    expect(anchors.has('repeat')).toBe(true);
    expect(anchors.has('repeat-1')).toBe(true);
  });

  it('detects missing endpoints, mismatched method/path/status/idempotency in api-reference', () => {
    const brokenDoc = [
      '| ID / 操作 | 方法与路径 | 请求 → 成功 data | 实际权限 / 状态 / App 范围 | 键 |',
      '| --- | --- | --- | --- | --- |',
      '| A01 register | GET `/api/v1/auth/wrong` | `{}` → AuthResult，200 | 无需登录 | 必需 |',
    ].join('\n');

    const result = auditApiReference(endpoints, brokenDoc);
    expect(result.contractCount).toBe(34);
    expect(result.docRowCount).toBe(1);
    expect(result.failures.some((msg) => msg.includes('A01 HTTP 方法不一致'))).toBe(true);
    expect(result.failures.some((msg) => msg.includes('A01 路径不一致'))).toBe(true);
    expect(result.failures.some((msg) => msg.includes('A01 成功状态码不一致'))).toBe(true);
    expect(result.failures.some((msg) => msg.includes('A01 幂等键标记不一致'))).toBe(true);
    expect(
      result.failures.some((msg) => msg.includes('缺少接口登记: A34 markNotificationRead')),
    ).toBe(true);
  });

  it('detects broken relative links and missing anchors while ignoring code blocks and external URLs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tongzhang-audit-links-'));
    try {
      mkdirSync(join(dir, 'docs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'target.md'), '# Target\n\n## Valid Section\n');
      writeFileSync(
        join(dir, 'README.md'),
        [
          '# Root',
          '[ok](docs/target.md#valid-section)',
          '[external](https://example.com/not-checked)',
          '`[inline-code](missing.md)`',
          '```md',
          '[fenced-code](missing-fenced.md)',
          '```',
          '[missing-file](docs/does-not-exist.md)',
          '[missing-anchor](docs/target.md#non-existent)',
        ].join('\n'),
      );

      const result = auditMarkdownLinks(dir);
      expect(result.fileCount).toBe(2);
      expect(result.checkedLinks).toBe(3);
      expect(result.checkedAnchors).toBe(2);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].target).toBe('docs/does-not-exist.md');
      expect(result.failures[1].target).toBe('docs/target.md#non-existent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects stale 501 placeholders in active delivery docs and server modules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tongzhang-audit-501-'));
    try {
      mkdirSync(join(dir, 'docs'), { recursive: true });
      mkdirSync(join(dir, 'apps/server/src/modules/demo'), { recursive: true });
      writeFileSync(join(dir, 'README.md'), '当前接口占位返回 501 待实现。\n');
      writeFileSync(join(dir, 'docs/api-reference.md'), '# API\n');
      writeFileSync(join(dir, 'docs/app-user-guide.md'), '# Guide\n');
      writeFileSync(join(dir, 'docs/known-limitations.md'), '# Limits\n');
      writeFileSync(join(dir, 'docs/development.md'), '# Dev\n');
      writeFileSync(join(dir, 'docs/environment-setup.md'), '# Env\n');
      writeFileSync(join(dir, 'docs/multi-device-testing.md'), '# Multi\n');
      writeFileSync(
        join(dir, 'apps/server/src/modules/demo/routes.ts'),
        'export const handler = notReadyHandler("demo");\n',
      );

      const result = auditStale501(dir);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].file).toBe('README.md');
      expect(result.failures[1].file).toBe('apps/server/src/modules/demo/routes.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes full delivery audit on the current repository', async () => {
    const report = await runDeliveryAudit();
    expect(report.apiAudit.contractCount).toBe(34);
    expect(report.apiAudit.docRowCount).toBe(34);
    expect(report.apiAudit.failures).toEqual([]);
    expect(report.linkAudit.failures).toEqual([]);
    expect(report.stale501Audit.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
