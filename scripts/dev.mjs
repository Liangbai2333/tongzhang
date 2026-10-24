import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import concurrently from 'concurrently';
import { readEnv } from '../apps/server/src/config/env.ts';
import { runScript } from './lib/run-script.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));

async function requireFreePort(port, host = '0.0.0.0') {
  await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', () => reject(new Error(`端口 ${port} 已被占用，请先停止已有开发服务。`)));
    socket.listen({ port, host }, () => socket.close(resolve));
  });
}

try {
  const { values } = parseArgs({
    options: {
      ios: { type: 'boolean' },
      android: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('pnpm dev [--ios | --android]：启动开发进程；首次先执行 pnpm setup 和原生构建。');
  } else {
    if (values.ios && values.android)
      throw new Error('一次指定一个启动平台；也可以在 Metro 中按 i 或 a。');
    if (values.ios && process.platform !== 'darwin')
      throw new Error('iOS 开发需要 macOS 和 Xcode。');
    // Read for preflight only; do not inject API credentials into Metro's process.
    const env = readEnv({ ...parseEnv(readFileSync('apps/server/.env', 'utf8')), ...process.env });
    if (env.NODE_ENV !== 'development') throw new Error('dev 只能使用 NODE_ENV=development。');
    await requireFreePort(env.PORT, env.HOST);
    await requireFreePort(8081);
    runScript('check:db', { cwd: fileURLToPath(new URL('../apps/server/', import.meta.url)) });
    runScript('build:server');
    console.log('启动开发服务；Ctrl+C 停止本次进程，数据库保留。Metro 使用原生终端快捷键。');
    await concurrently(
      [
        { name: 'shared', command: 'pnpm dev:shared' },
        { name: 'server', command: 'pnpm --filter @tongzhang/server dev' },
        // Only Metro inherits stdin/stdout; piping it disables Expo's terminal UI.
        {
          name: 'mobile',
          command: `pnpm --filter @tongzhang/mobile dev${values.ios ? ' --ios' : values.android ? ' --android' : ''}`,
          raw: true,
        },
      ],
      { killOthersOn: ['success', 'failure'], killTimeout: 5000 },
    ).result;
  }
} catch (error) {
  const interrupted =
    Array.isArray(error) &&
    error.every((event) => event.killed || [0, 130, 'SIGINT', 'SIGTERM'].includes(event.exitCode));
  if (!interrupted) {
    console.error(error instanceof Error ? error.message : '开发进程异常退出，请查看上方日志。');
    process.exitCode = 1;
  }
}
