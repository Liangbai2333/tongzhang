import { databaseConfig, loadLocalEnv, readEnv } from '../../config/env.js';
import { createDatabase } from '../../db/client.js';
import { cleanupTemporaryImages, IMAGE_CLEANUP_BATCH_SIZE } from './cleanup.js';

loadLocalEnv();
const db = createDatabase(databaseConfig(readEnv()));
try {
  let deleted = 0;
  let batch: number;
  do {
    batch = await cleanupTemporaryImages(db.orm);
    deleted += batch;
  } while (batch === IMAGE_CLEANUP_BATCH_SIZE);
  console.log(`临时图片清理完成，删除 ${deleted} 张。正在绑定的图片留待下次检查。`);
} catch {
  // Never print connection strings, credentials or image content in scheduler logs.
  console.error('临时图片清理失败，请检查数据库连接与服务端配置。');
  process.exitCode = 1;
} finally {
  await db.close();
}
