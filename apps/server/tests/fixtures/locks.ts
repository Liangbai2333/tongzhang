import type { Pool } from 'pg';
import { expect, vi } from 'vitest';

/** Count this fixture's waiters, following transitive locks through other suites as needed. */
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
        ) SELECT count(*)::integer AS count
          FROM blocked JOIN pg_stat_activity activity USING (pid)
          WHERE pid <> $1 AND activity.application_name = current_setting('application_name')`,
        [blockerPid],
      );
      expect(result.rows[0]!.count).toBe(count);
    },
    { timeout: 750, interval: 10 },
  );
}
