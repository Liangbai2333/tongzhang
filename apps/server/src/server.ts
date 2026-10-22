import { buildApp } from './app.js';
import { loadLocalEnv, readEnv } from './config/env.js';

loadLocalEnv();
const env = readEnv();
const app = await buildApp(env);
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
