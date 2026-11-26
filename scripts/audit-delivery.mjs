import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED_DIRS = new Set([
  '.git',
  '.expo',
  '.turbo',
  'android',
  'coverage',
  'dist',
  'ios',
  'node_modules',
]);

export const ACTIVE_DELIVERY_DOCS = [
  'README.md',
  'docs/api-reference.md',
  'docs/app-user-guide.md',
  'docs/known-limitations.md',
  'docs/development.md',
  'docs/environment-setup.md',
  'docs/multi-device-testing.md',
];

const LEDGER_PREFIX = '/api/v1/ledgers/:ledgerId';

/**
 * Generate GitHub-compatible heading slug from raw Markdown heading text.
 */
export function slugifyHeading(rawHeading) {
  const cleaned = rawHeading
    .trim()
    .replace(/\s+#+\s*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .toLowerCase();

  return cleaned
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

/**
 * Strip fenced code blocks and inline code spans while keeping line numbers aligned.
 */
function stripCodeFromMarkdown(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  let fenceChar = null;
  let fenceLen = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!fenceChar) {
      const openMatch = trimmed.match(/^(`{3,}|~{3,})/);
      if (openMatch) {
        fenceChar = openMatch[1][0];
        fenceLen = openMatch[1].length;
        result.push('');
        continue;
      }
      result.push(line);
    } else {
      const closeRe = new RegExp(`^${fenceChar}{${fenceLen},}\\s*$`);
      if (closeRe.test(trimmed)) {
        fenceChar = null;
        fenceLen = 0;
      }
      result.push('');
    }
  }

  return result;
}

/**
 * Extract all GitHub-style heading slugs (including duplicate suffixes -1, -2, ...) from Markdown.
 */
export function extractMarkdownAnchors(content) {
  const lines = stripCodeFromMarkdown(content);
  const anchors = new Set();
  const counts = new Map();

  for (const line of lines) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (!match) continue;
    const base = slugifyHeading(match[1]);
    if (!base) continue;

    const seen = counts.get(base) ?? 0;
    const slug = seen === 0 ? base : `${base}-${seen}`;
    counts.set(base, seen + 1);
    anchors.add(slug);
  }

  return anchors;
}

/**
 * Collect all Markdown files under rootDir, excluding generated/dependency directories.
 */
export function collectMarkdownFiles(rootDir) {
  const files = [];

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(resolve(dir, entry.name));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        files.push(resolve(dir, entry.name));
      }
    }
  }

  walk(rootDir);
  return files;
}

function stripInlineCode(line) {
  return line.replace(/(`+)([\s\S]*?)\1/g, (m) => ' '.repeat(m.length));
}

function normalizeLinkTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  const spaceIdx = target.search(/\s+["'(]/);
  if (spaceIdx !== -1) {
    target = target.slice(0, spaceIdx).trim();
  }
  return target;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Audit all local relative Markdown links and heading anchors across the repository.
 */
export function auditMarkdownLinks(rootDir = ROOT_DIR) {
  const markdownFiles = collectMarkdownFiles(rootDir);
  const anchorCache = new Map();
  const failures = [];
  let checkedLinks = 0;
  let checkedAnchors = 0;

  function getAnchors(filePath) {
    if (!anchorCache.has(filePath)) {
      anchorCache.set(filePath, extractMarkdownAnchors(readFileSync(filePath, 'utf8')));
    }
    return anchorCache.get(filePath);
  }

  const linkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;

  for (const filePath of markdownFiles) {
    const relSource = relative(rootDir, filePath).replaceAll('\\', '/');
    const content = readFileSync(filePath, 'utf8');
    const lines = stripCodeFromMarkdown(content);

    for (let idx = 0; idx < lines.length; idx += 1) {
      const sanitized = stripInlineCode(lines[idx]);
      linkRegex.lastIndex = 0;
      let match;
      while ((match = linkRegex.exec(sanitized)) !== null) {
        const target = normalizeLinkTarget(match[1]);
        if (!target || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(target)) {
          continue;
        }

        checkedLinks += 1;
        const hashIdx = target.indexOf('#');
        const rawPath = hashIdx === -1 ? target : target.slice(0, hashIdx);
        const rawAnchor = hashIdx === -1 ? null : target.slice(hashIdx + 1);
        const decodedPath = safeDecodeURIComponent(rawPath);

        const resolvedTarget = decodedPath ? resolve(dirname(filePath), decodedPath) : filePath;

        const relTarget = relative(rootDir, resolvedTarget);
        if (relTarget.startsWith('..')) {
          failures.push({
            file: relSource,
            line: idx + 1,
            target,
            reason: '相对路径越出仓库根目录',
          });
          continue;
        }

        if (!existsSync(resolvedTarget)) {
          failures.push({
            file: relSource,
            line: idx + 1,
            target,
            reason: `目标文件不存在: ${relTarget.replaceAll('\\', '/')}`,
          });
          continue;
        }

        if (rawAnchor !== null) {
          checkedAnchors += 1;
          if (!rawAnchor.trim()) {
            failures.push({
              file: relSource,
              line: idx + 1,
              target,
              reason: '标题锚点为空',
            });
            continue;
          }

          const stat = statSync(resolvedTarget);
          if (stat.isFile() && extname(resolvedTarget).toLowerCase() === '.md') {
            const anchors = getAnchors(resolvedTarget);
            const normalizedAnchor = safeDecodeURIComponent(rawAnchor).trim().toLowerCase();
            if (!anchors.has(normalizedAnchor)) {
              failures.push({
                file: relSource,
                line: idx + 1,
                target,
                reason: `目标标题锚点未命中: #${normalizedAnchor} (${relTarget.replaceAll('\\', '/')})`,
              });
            }
          }
        }
      }
    }
  }

  return {
    fileCount: markdownFiles.length,
    checkedLinks,
    checkedAnchors,
    failures,
  };
}

/**
 * Parse A01-A34 rows from docs/api-reference.md.
 */
export function parseApiReferenceTable(markdownContent) {
  const rows = [];
  const lines = markdownContent.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx].trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5) continue;

    const idOpMatch = cells[0].match(/^(A\d{2})\s+([a-zA-Z0-9_]+)$/);
    if (!idOpMatch) continue;

    const methodPathMatch = cells[1].match(/^(GET|POST|PUT|PATCH|DELETE)\s+`([^`]+)`$/);
    const statusMatch = cells[2].match(/，(\d{3})$/);
    const expandedPath = methodPathMatch
      ? methodPathMatch[2] === 'L'
        ? LEDGER_PREFIX
        : methodPathMatch[2].startsWith('L/')
          ? `${LEDGER_PREFIX}${methodPathMatch[2].slice(1)}`
          : methodPathMatch[2]
      : null;

    rows.push({
      line: idx + 1,
      id: idOpMatch[1],
      operation: idOpMatch[2],
      method: methodPathMatch ? methodPathMatch[1] : null,
      path: expandedPath,
      statusCode: statusMatch ? Number(statusMatch[1]) : null,
      idempotentCell: cells[4],
    });
  }

  return rows;
}

/**
 * Audit packages/contracts A01-A34 endpoints against docs/api-reference.md.
 */
export function auditApiReference(endpoints, apiReferenceContent) {
  const failures = [];
  const contractEntries = Object.entries(endpoints);
  const expectedIds = Array.from({ length: 34 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`);

  const contractById = new Map();
  for (const [operation, spec] of contractEntries) {
    if (contractById.has(spec.id)) {
      failures.push(`契约中存在重复接口编号: ${spec.id}`);
    }
    contractById.set(spec.id, { operation, ...spec });
  }

  for (const expectedId of expectedIds) {
    if (!contractById.has(expectedId)) {
      failures.push(`契约缺少预期接口编号: ${expectedId}`);
    }
  }

  const docRows = parseApiReferenceTable(apiReferenceContent);
  const docById = new Map();
  for (const row of docRows) {
    if (docById.has(row.id)) {
      failures.push(`docs/api-reference.md 第 ${row.line} 行存在重复接口编号: ${row.id}`);
    }
    docById.set(row.id, row);
  }

  for (const [id, spec] of contractById.entries()) {
    const row = docById.get(id);
    if (!row) {
      failures.push(`docs/api-reference.md 缺少接口登记: ${id} ${spec.operation}`);
      continue;
    }

    if (row.operation !== spec.operation) {
      failures.push(
        `${id} 操作名不一致: 契约为 ${spec.operation}，文档第 ${row.line} 行为 ${row.operation}`,
      );
    }
    if (row.method !== spec.method) {
      failures.push(
        `${id} HTTP 方法不一致: 契约为 ${spec.method}，文档第 ${row.line} 行为 ${row.method}`,
      );
    }
    if (row.path !== spec.path) {
      failures.push(`${id} 路径不一致: 契约为 ${spec.path}，文档第 ${row.line} 行为 ${row.path}`);
    }
    if (row.statusCode !== spec.statusCode) {
      failures.push(
        `${id} 成功状态码不一致: 契约为 ${spec.statusCode}，文档第 ${row.line} 行为 ${row.statusCode}`,
      );
    }
    const expectedIdem = spec.idempotent ? '必需' : '—';
    if (row.idempotentCell !== expectedIdem) {
      failures.push(
        `${id} 幂等键标记不一致: 契约为 ${expectedIdem}，文档第 ${row.line} 行为 ${row.idempotentCell}`,
      );
    }
  }

  for (const [id, row] of docById.entries()) {
    if (!contractById.has(id)) {
      failures.push(`docs/api-reference.md 第 ${row.line} 行包含契约未登记接口: ${id}`);
    }
  }

  return {
    contractCount: contractEntries.length,
    docRowCount: docRows.length,
    failures,
  };
}

/**
 * Audit active delivery docs and server business modules for stale 501 / not-ready placeholders.
 */
export function auditStale501(rootDir = ROOT_DIR) {
  const failures = [];
  const docPattern = /\b501\b|FEATURE_NOT_READY|NOT_IMPLEMENTED/i;
  const codePattern = /\bnotReadyHandler\b|\bFEATURE_NOT_READY\b/;

  for (const relDoc of ACTIVE_DELIVERY_DOCS) {
    const absPath = resolve(rootDir, relDoc);
    if (!existsSync(absPath)) {
      failures.push({ file: relDoc, line: 0, reason: '核心交付文档缺失' });
      continue;
    }
    const lines = readFileSync(absPath, 'utf8').split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx += 1) {
      if (docPattern.test(lines[idx])) {
        failures.push({
          file: relDoc,
          line: idx + 1,
          reason: `活跃交付文档存在过期 501 残留: ${lines[idx].trim().slice(0, 120)}`,
        });
      }
    }
  }

  const modulesDir = resolve(rootDir, 'apps/server/src/modules');
  if (existsSync(modulesDir)) {
    function walkTs(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walkTs(full);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const lines = readFileSync(full, 'utf8').split(/\r?\n/);
          for (let idx = 0; idx < lines.length; idx += 1) {
            if (codePattern.test(lines[idx])) {
              failures.push({
                file: relative(rootDir, full).replaceAll('\\', '/'),
                line: idx + 1,
                reason: `服务端业务模块存在过期 501 占位调用: ${lines[idx].trim()}`,
              });
            }
          }
        }
      }
    }
    walkTs(modulesDir);
  }

  return {
    checkedDocs: ACTIVE_DELIVERY_DOCS.length,
    failures,
  };
}

export async function loadContractsEndpoints(rootDir = ROOT_DIR) {
  const distPath = resolve(rootDir, 'packages/contracts/dist/index.js');
  if (!existsSync(distPath)) {
    throw new Error(
      'packages/contracts/dist/index.js 不存在，请先运行 `pnpm build:shared` 或通过 `pnpm check:delivery` 执行。',
    );
  }
  const mod = await import(pathToFileURL(distPath).href);
  return mod.endpoints;
}

export async function runDeliveryAudit(rootDir = ROOT_DIR) {
  const endpoints = await loadContractsEndpoints(rootDir);
  const apiRefPath = resolve(rootDir, 'docs/api-reference.md');
  const apiRefContent = readFileSync(apiRefPath, 'utf8');

  const apiAudit = auditApiReference(endpoints, apiRefContent);
  const linkAudit = auditMarkdownLinks(rootDir);
  const stale501Audit = auditStale501(rootDir);

  const ok =
    apiAudit.failures.length === 0 &&
    linkAudit.failures.length === 0 &&
    stale501Audit.failures.length === 0;

  return { ok, apiAudit, linkAudit, stale501Audit };
}

async function main() {
  const report = await runDeliveryAudit(ROOT_DIR);

  console.log(
    `[delivery-audit] API 契约核对: contracts=${report.apiAudit.contractCount}, api-reference=${report.apiAudit.docRowCount}, failures=${report.apiAudit.failures.length}`,
  );
  console.log(
    `[delivery-audit] Markdown 链接核对: files=${report.linkAudit.fileCount}, links=${report.linkAudit.checkedLinks}, anchors=${report.linkAudit.checkedAnchors}, failures=${report.linkAudit.failures.length}`,
  );
  console.log(
    `[delivery-audit] 过期 501 残留核对: activeDocs=${report.stale501Audit.checkedDocs}, failures=${report.stale501Audit.failures.length}`,
  );

  if (!report.ok) {
    for (const msg of report.apiAudit.failures) {
      console.error(`  [API] ${msg}`);
    }
    for (const item of report.linkAudit.failures) {
      console.error(`  [LINK] ${item.file}:${item.line} (${item.target}) -> ${item.reason}`);
    }
    for (const item of report.stale501Audit.failures) {
      console.error(`  [501] ${item.file}:${item.line} -> ${item.reason}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[delivery-audit] 全部核对通过（零偏差、零断链、零过期 501 残留）。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `[delivery-audit] 执行失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
