import type { Pool } from 'pg';
import type { UsageStore } from './types.js';

export class PostgresUsageStore implements UsageStore {
  constructor(private readonly pool: Pool, private readonly maxDailyRequests = 500) {
    if (!Number.isSafeInteger(maxDailyRequests) || maxDailyRequests < 1 || maxDailyRequests > 2_147_483_647) {
      throw new Error('MAX_DAILY_AI_REQUESTS must be a positive integer.');
    }
  }

  async getRemaining(installationId: string): Promise<number> {
    const result = await this.pool.query<{ requests_used: number }>(
      'SELECT requests_used FROM installations WHERE installation_id = $1',
      [installationId],
    );
    return Math.max(0, 25 - (result.rows[0]?.requests_used ?? 0));
  }

  async reserve(installationId: string) {
    const client = await this.pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      // Lock in a consistent order: installation, then the shared daily row.
      // This serializes competing requests for the same installation and the
      // single global counter without allowing the two counters to diverge.
      await client.query(
        `INSERT INTO installations (installation_id, requests_used)
         VALUES ($1, 0)
         ON CONFLICT (installation_id) DO NOTHING`,
        [installationId],
      );
      const installation = await client.query<{ requests_used: number }>(
        `SELECT requests_used FROM installations WHERE installation_id = $1 FOR UPDATE`,
        [installationId],
      );
      const installationRequestsUsed = installation.rows[0]?.requests_used;
      if (installationRequestsUsed === undefined) throw new Error('Installation usage row was not created.');
      if (installationRequestsUsed >= 25) {
        await client.query('COMMIT');
        transactionOpen = false;
        return { status: 'installation_limit' as const };
      }

      await client.query(
        `INSERT INTO daily_ai_usage (id, usage_date, requests_used)
         VALUES (1, DATE '0001-01-01', 0)
         ON CONFLICT (id) DO NOTHING`,
      );
      const daily = await client.query<{ usage_date: string; requests_used: number }>(
        `SELECT usage_date::text, requests_used FROM daily_ai_usage WHERE id = 1 FOR UPDATE`,
      );
      const dailyRow = daily.rows[0];
      if (!dailyRow) throw new Error('Daily usage row was not created.');

      // Read the clock after acquiring the shared row lock, so a request that
      // waited across midnight is assigned to the new UTC quota window.
      const clock = await client.query<{ usage_date: string; retry_after_seconds: number }>(
        `WITH utc_clock AS (
           SELECT clock_timestamp() AT TIME ZONE 'UTC' AS utc_now
         )
         SELECT utc_now::date::text AS usage_date,
                GREATEST(1, CEIL(EXTRACT(EPOCH FROM (date_trunc('day', utc_now) + interval '1 day' - utc_now)))::integer) AS retry_after_seconds
         FROM utc_clock`,
      );
      const { usage_date: usageDate, retry_after_seconds: retryAfterSeconds } = clock.rows[0] ?? {};
      if (!usageDate || retryAfterSeconds === undefined) throw new Error('Could not read the UTC quota window.');

      if (dailyRow.usage_date !== usageDate) {
        await client.query(
          `UPDATE daily_ai_usage SET usage_date = $1::date, requests_used = 0 WHERE id = 1`,
          [usageDate],
        );
        dailyRow.requests_used = 0;
      }

      if (dailyRow.requests_used >= this.maxDailyRequests) {
        await client.query('COMMIT');
        transactionOpen = false;
        return { status: 'daily_limit' as const, retryAfterSeconds };
      }

      const updatedInstallation = await client.query<{ requests_used: number }>(
        `UPDATE installations
         SET requests_used = requests_used + 1, updated_at = NOW()
         WHERE installation_id = $1
         RETURNING requests_used`,
        [installationId],
      );
      await client.query('UPDATE daily_ai_usage SET requests_used = requests_used + 1 WHERE id = 1');
      const requestsUsed = updatedInstallation.rows[0]?.requests_used;
      if (requestsUsed === undefined) throw new Error('Installation usage reservation failed.');

      await client.query('COMMIT');
      transactionOpen = false;
      return { status: 'reserved' as const, installationRequestsUsed: requestsUsed };
    } catch (error) {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch { /* preserve the original database error */ }
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
