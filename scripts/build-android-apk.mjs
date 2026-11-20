import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MOBILE_DIR = join(REPO_ROOT, 'apps/mobile');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '10.0.2.2', '0.0.0.0']);
const SECRET_ENV_PATTERN = /(SECRET|API_KEY|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN)/i;

export function parseBuildArgs(argv) {
  let preflight = false;
  let outDir = join(REPO_ROOT, 'dist/android');
  let apiUrl = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--preflight') {
      preflight = true;
    } else if (arg === '--out-dir' && argv[i + 1]) {
      outDir = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--api-url' && argv[i + 1]) {
      apiUrl = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return { preflight, outDir, apiUrl };
}

export function validateStandaloneApkEnv(env) {
  const variant = env.APP_VARIANT ?? 'production';
  if (variant !== 'production') {
    throw new Error(
      '独立 APK 构建必须使用 APP_VARIANT=production（禁止使用 development 明文配置）',
    );
  }

  const rawUrl = (env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('独立 APK 构建必须设置有效的 HTTPS EXPO_PUBLIC_API_BASE_URL');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      '独立 APK 的 EXPO_PUBLIC_API_BASE_URL 必须为不含凭据、查询参数或片段的 HTTPS 地址',
    );
  }
  if (LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('独立 APK 不能指向本机或模拟器回环地址，请使用公网 HTTPS API 域名');
  }

  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_') && SECRET_ENV_PATTERN.test(key)) {
      throw new Error(`禁止通过 ${key} 向移动端公开变量注入密钥`);
    }
  }

  return {
    appVariant: 'production',
    apiBaseUrl: parsed.origin + parsed.pathname.replace(/\/+$/, ''),
  };
}

export function detectJavaMajorVersion(versionOutput) {
  const match = /version\s+"(\d+)(?:\.(\d+))?/i.exec(versionOutput);
  if (!match) return { major: null, supported: false };
  const first = Number(match[1]);
  const major = first === 1 && match[2] ? Number(match[2]) : first;
  return { major, supported: major === 17 };
}

export function computeFileSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function formatSha256Sums(entries) {
  return (
    [...entries]
      .sort((a, b) => a.filename.localeCompare(b.filename))
      .map((entry) => `${entry.sha256}  ${entry.filename}`)
      .join('\n') + '\n'
  );
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`命令执行失败（退出码 ${result.status}）：${command} ${args.join(' ')}`);
  }
}

function checkAndroidToolchain(env) {
  const javaProbe = spawnSync('java', ['-version'], { encoding: 'utf8', env });
  const output = `${javaProbe.stdout ?? ''}\n${javaProbe.stderr ?? ''}`;
  const javaInfo = detectJavaMajorVersion(output);
  if (javaProbe.status !== 0 || !javaInfo.supported) {
    throw new Error(
      `独立 APK 原生构建需要 JDK 17（当前检测到：${javaInfo.major ?? '未知'}，JDK 25 会导致 CMake 失败）`,
    );
  }
  const androidHome = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || '';
  if (!androidHome || !existsSync(androidHome)) {
    throw new Error('未检测到有效的 ANDROID_HOME / ANDROID_SDK_ROOT，无法执行 Android 原生构建');
  }
  return { javaMajor: javaInfo.major, androidHome };
}

function currentGitShortSha() {
  const probe = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return probe.status === 0 ? probe.stdout.trim() : 'unknown';
}

function main() {
  const args = parseBuildArgs(process.argv.slice(2));
  const buildEnv = {
    ...process.env,
    APP_VARIANT: process.env.APP_VARIANT ?? 'production',
    ...(args.apiUrl ? { EXPO_PUBLIC_API_BASE_URL: args.apiUrl } : {}),
  };
  const validated = validateStandaloneApkEnv(buildEnv);

  const requiredFiles = [
    join(MOBILE_DIR, 'app.config.ts'),
    join(REPO_ROOT, 'infra/compose.prod.yml'),
    join(REPO_ROOT, 'infra/Caddyfile'),
    join(REPO_ROOT, 'infra/deploy.sh'),
  ];
  for (const file of requiredFiles) {
    if (!existsSync(file)) throw new Error(`缺少必需的部署/构建文件：${file}`);
  }

  if (args.preflight) {
    console.log(
      `[build:apk] preflight passed: APP_VARIANT=${validated.appVariant}, EXPO_PUBLIC_API_BASE_URL=${validated.apiBaseUrl}`,
    );
    return;
  }

  const toolchain = checkAndroidToolchain(buildEnv);
  console.log(
    `[build:apk] JDK ${toolchain.javaMajor}, ANDROID_HOME=${toolchain.androidHome}, API=${validated.apiBaseUrl}`,
  );

  runCommand('pnpm', ['build:shared'], { cwd: REPO_ROOT, env: buildEnv });
  runCommand(
    'pnpm',
    [
      '--filter',
      '@tongzhang/mobile',
      'exec',
      'expo',
      'prebuild',
      '--platform',
      'android',
      '--clean',
    ],
    { cwd: REPO_ROOT, env: buildEnv },
  );

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  runCommand(gradlew, ['assembleRelease'], {
    cwd: join(MOBILE_DIR, 'android'),
    env: buildEnv,
  });

  const builtApk = join(MOBILE_DIR, 'android/app/build/outputs/apk/release/app-release.apk');
  if (!existsSync(builtApk)) {
    throw new Error(`未找到构建产物：${builtApk}`);
  }

  mkdirSync(args.outDir, { recursive: true });
  const shortSha = currentGitShortSha();
  const apkName = `tongzhang-${shortSha}-standalone.apk`;
  const targetApk = join(args.outDir, apkName);
  copyFileSync(builtApk, targetApk);

  const sha256 = computeFileSha256(targetApk);
  const checksumPath = join(args.outDir, 'SHA256SUMS.txt');
  writeFileSync(
    checksumPath,
    formatSha256Sums([{ filename: basename(targetApk), sha256 }]),
    'utf8',
  );

  console.log(`[build:apk] standalone APK ready: ${targetApk}`);
  console.log(`[build:apk] SHA256SUMS written: ${checksumPath} (${sha256})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[build:apk] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
