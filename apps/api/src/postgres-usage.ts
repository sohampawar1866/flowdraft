import type { Pool } from 'pg';
import type { UsageStore } from './types.js';

export class PostgresUsageStore implements UsageStore {
  constructor(private readonly pool: Pool) {}

  async reserve(installationId: string): Promise<number | null> {
    const result = await this.pool.query<{ requests_used: number }>(
      `INSERT INTO installations (installation_id, requests_used)
       VALUES ($1, 0)
       ON CONFLICT (installation_id) DO NOTHING`,
      [installationId],
    );
    void result;
    const updated = await this.pool.query<{ requests_used: number }>(
      `UPDATE installations
       SET requests_used = requests_used + 1, updated_at = NOW()
       WHERE installation_id = $1 AND requests_used < 25
       RETURNING requests_used`,
      [installationId],
    );
    return updated.rows[0]?.requests_used ?? null;
  }
}
