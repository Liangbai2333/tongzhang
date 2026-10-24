import type { Pool } from 'pg';
import { expect, vi } from 'vitest';

/** Observe this blocker only, including tuple-lock waiters queued behind its first waiter. */
export async function waitForBlockedQueries(pool: Pool, blockerPid: number, count: number) {
  await vi.waitFor(
    async () => {
      const result = await pool.query<{ count: number }>(
        `WITH RECURSIVE blocked(pid) AS (
          SELECT $1::integer
          UNION
          SELECT activity.pid FROM pg_stat_activity activity
          JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
          WHERE activity.datname = current_database()
        ) SELECT count(*)::integer AS count FROM blocked WHERE pid <> $1`,
        [blockerPid],
      );
      expect(result.rows[0]!.count).toBe(count);
    },
    { timeout: 750, interval: 10 },
  );
}
