import fp from 'fastify-plugin';
import type { Database } from './client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export const databasePlugin = fp<{ database: Database }>(
  async (app, { database }) => {
    app.decorate('db', database);
    database.pool.on('error', (error) =>
      app.log.error({ err: error }, 'Idle database client failed'),
    );
    app.addHook('onClose', async () => database.close());
  },
  { name: 'database' },
);
