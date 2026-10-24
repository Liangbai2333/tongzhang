import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { readEnv } from '../apps/server/src/config/env.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function validateApiAddress(value, production = false) {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (production && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.href.replace(/\/$/, '');
  } catch {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL 必须为不含凭据、查询参数或片段的有效 API 地址；发布配置要求 HTTPS。',
    );
  }
}
export function versionCheck(actual, expected, majorOnly = false) {
  const normalized = actual.trim().replace(/^v/, '');
  if (normalized === expected) return 'pass';
  if (
    majorOnly &&
    /^\d+\.\d+\.\d+$/.test(normalized) &&
    normalized.split('.')[0] === expected.split('.')[0]
  )
    return 'warn';
  return 'fail';
}

/** Read-only diagnostics: no setup, migrations, port forwarding or credential output. */
export async function inspectEnvironment({
  root = projectRoot,
  toolsOnly = false,
  skipDocker = false,
  android = false,
  ios = false,
  run = spawnSync,
  get = fetch,
  platform = process.platform,
  environment = process.env,
  nodeVersion = process.version,
} = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const pinnedNode = readFileSync(join(root, '.node-version'), 'utf8').trim();
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const pinnedPnpm = manifest.packageManager.replace(/^pnpm@/, '');
  add(
    'Node',
    versionCheck(nodeVersion, pinnedNode, true),
    `${nodeVersion}; repository ${pinnedNode}`,
  );
  function probe(command, args, options = {}) {
    try {
      return run(command, args, {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        ...options,
      });
    } catch {
      return { status: 1, stdout: '', stderr: '' };
    }
  }
  function failureReason(result) {
    if (result.error?.code === 'ETIMEDOUT') return 'probe timed out';
    if (result.error?.code === 'ENOENT') return 'executable not found';
    if (result.error?.code === 'EACCES') return 'execution permission denied';
    if (Number.isInteger(result.status)) return `exit status ${result.status}`;
    if (['SIGTERM', 'SIGKILL'].includes(result.signal)) return `terminated by ${result.signal}`;
    return 'probe did not complete';
  }
  // The only shell command is a fixed pnpm version probe; it contains no user input.
  const pnpm = probe('pnpm', ['--version'], { shell: platform === 'win32' });
  const pnpmVersion = pnpm.status === 0 ? pnpm.stdout.trim() : 'unavailable';
  add(
    'pnpm',
    pnpm.status === 0 ? versionCheck(pnpmVersion, pinnedPnpm) : 'fail',
    `${pnpmVersion}; repository ${pinnedPnpm}`,
  );
  if (!skipDocker) {
    const docker = probe('docker', ['version', '--format', '{{.Server.Version}}']);
    add(
      'Docker',
      docker.status === 0 ? 'pass' : 'fail',
      docker.status === 0
        ? docker.stdout.trim()
        : `Docker daemon unavailable (${failureReason(docker)}); start Docker first.`,
    );
    const compose = probe('docker', ['compose', 'version', '--short']);
    add(
      'Compose',
      compose.status === 0 ? 'pass' : 'fail',
      compose.status === 0
        ? compose.stdout.trim()
        : `Docker Compose unavailable (${failureReason(compose)}).`,
    );
  }
  if (android) {
    const java = probe('java', ['-version']);
    const version =
      `${java.stdout ?? ''}\n${java.stderr ?? ''}`.match(/version "([\d.]+)/)?.[1] ?? '';
    add(
      'JDK',
      java.status === 0 && version.split('.')[0] === '17' ? 'pass' : 'fail',
      version ? `Java ${version}; requires 17` : 'JDK 17 unavailable.',
    );
    const sdk = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
    add(
      'Android SDK',
      sdk && existsSync(join(sdk, 'platform-tools', platform === 'win32' ? 'adb.exe' : 'adb'))
        ? 'pass'
        : 'fail',
      'Check ANDROID_HOME and platform-tools; native installation must be verified separately.',
    );
  }
  if (ios) {
    const simulator = platform === 'darwin' ? probe('xcrun', ['--find', 'simctl']) : { status: 1 };
    add(
      'iOS tools',
      simulator.status === 0 ? 'pass' : 'fail',
      'Requires macOS, Xcode and an installed simulator runtime; this check does not install the app.',
    );
  }
  if (!toolsOnly) {
    const local =
      environment.NODE_ENV !== 'production' && environment.NODE_ENV !== 'test' && !environment.CI;
    const readLocal = (relative) =>
      local ? parseEnv(readFileSync(join(root, relative), 'utf8')) : {};
    let server;
    try {
      server = { ...readLocal('apps/server/.env'), ...environment };
      const config = readEnv(server);
      add(
        'Server configuration',
        'pass',
        `PostgreSQL ${config.PGHOST}:${config.PGPORT}/${config.PGDATABASE}; private credentials validated without printing them.`,
      );
    } catch {
      add(
        'Server configuration',
        'fail',
        'Check apps/server/.env and required PG*/AUTH_JWT_SECRET settings; run pnpm setup:env for missing local configuration.',
      );
      server = null;
    }
    if (server) {
      const database = probe(
        process.execPath,
        [join(root, 'apps/server/scripts/check-database.ts')],
        { cwd: root, env: server, timeout: 7000 },
      );
      add(
        'PostgreSQL',
        database.status === 0 ? 'pass' : 'fail',
        database.status === 0
          ? 'SELECT 1 succeeded.'
          : 'Database unavailable; check configuration and pnpm up:db.',
      );
    }
    try {
      const mobile = { ...readLocal('apps/mobile/.env'), ...environment };
      const base = validateApiAddress(
        mobile.EXPO_PUBLIC_API_BASE_URL,
        mobile.APP_VARIANT === 'production',
      );
      add('Mobile API configuration', 'pass', base);
      const response = await get(`${base}/health/ready`, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      const body = await response.json();
      add(
        'API readiness',
        response.ok && body?.data?.database === 'connected' ? 'pass' : 'fail',
        response.ok && body?.data?.database === 'connected'
          ? 'API reports a real PostgreSQL connection.'
          : 'API not ready; start the server and verify the mobile API address.',
      );
      if (android && ['localhost', '127.0.0.1'].includes(new URL(base).hostname))
        add(
          'Android API routing',
          'warn',
          'For an emulator/device using localhost, explicitly configure adb reverse tcp:3300 tcp:3300; no port forwarding was changed.',
        );
    } catch {
      add(
        'Mobile/API connectivity',
        'fail',
        'Check EXPO_PUBLIC_API_BASE_URL and the running server; release builds require HTTPS. No credential or response payload is logged.',
      );
    }
  }
  return {
    platform,
    architecture: process.arch,
    checks,
    ok: !checks.some((check) => check.status === 'fail'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        'tools-only': { type: 'boolean' },
        'skip-docker': { type: 'boolean' },
        android: { type: 'boolean' },
        ios: { type: 'boolean' },
        json: { type: 'boolean' },
      },
    });
    const report = await inspectEnvironment({
      toolsOnly: values['tools-only'],
      skipDocker: values['skip-docker'],
      android: values.android,
      ios: values.ios,
    });
    if (values.json) console.log(JSON.stringify(report, null, 2));
    else
      for (const check of report.checks)
        console.log(`[${check.status}] ${check.name}: ${check.detail}`);
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error(
      'Environment check failed. Use --tools-only, --skip-docker, --android, --ios or --json; private configuration is never printed.',
    );
    process.exitCode = 1;
  }
}
