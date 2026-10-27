import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { PostgresUsageStore } from '../src/postgres-usage.js';

type DailyState = { usage_date: string; requests_used: number };
type State = { installations: Map<string, number>; daily: DailyState | null };

function fakePool(initialNow = '2026-10-28T18:30:00.000Z') {
  const state: State = { installations: new Map(), daily: null };
  let now = new Date(initialNow);
  let transactionTail = Promise.resolve();
  let failOnDailyIncrement = false;

  const connect = async () => {
    let releaseTransaction = () => {};
    let snapshot: State | null = null;
    const client = {
      query: async (queryText: string, values: unknown[] = []) => {
        const sql = queryText.replace(/\s+/g, ' ').trim();
        if (sql === 'BEGIN') {
          const previous = transactionTail;
          let release!: () => void;
          transactionTail = new Promise<void>((resolve) => { release = resolve; });
          await previous;
          releaseTransaction = release;
          snapshot = { installations: new Map(state.installations), daily: state.daily ? { ...state.daily } : null };
          return { rows: [], rowCount: 0 };
        }
        if (sql === 'COMMIT') {
          snapshot = null;
          releaseTransaction();
          return { rows: [], rowCount: 0 };
        }
        if (sql === 'ROLLBACK') {
          if (snapshot) {
            state.installations = new Map(snapshot.installations);
            state.daily = snapshot.daily ? { ...snapshot.daily } : null;
          }
          snapshot = null;
          releaseTransaction();
          return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith('INSERT INTO installations')) {
          const id = String(values[0]);
          if (!state.installations.has(id)) state.installations.set(id, 0);
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('SELECT requests_used FROM installations')) {
          return { rows: [{ requests_used: state.installations.get(String(values[0])) }], rowCount: 1 };
        }
        if (sql.startsWith('WITH utc_clock AS')) {
          const utcDate = now.toISOString().slice(0, 10);
          const nextMidnight = Date.parse(`${utcDate}T00:00:00.000Z`) + 86_400_000;
          return { rows: [{ usage_date: utcDate, retry_after_seconds: Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000)) }], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO daily_ai_usage')) {
          if (!state.daily) state.daily = { usage_date: String(values[0]), requests_used: 0 };
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('SELECT usage_date::text, requests_used FROM daily_ai_usage')) {
          return { rows: state.daily ? [{ ...state.daily }] : [], rowCount: state.daily ? 1 : 0 };
        }
        if (sql.startsWith('UPDATE daily_ai_usage SET usage_date =')) {
          state.daily = { usage_date: String(values[0]), requests_used: 0 };
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('UPDATE installations')) {
          const id = String(values[0]);
          const requests_used = (state.installations.get(id) ?? 0) + 1;
          state.installations.set(id, requests_used);
          return { rows: [{ requests_used }], rowCount: 1 };
        }
        if (sql === 'UPDATE daily_ai_usage SET requests_used = requests_used + 1 WHERE id = 1') {
          if (failOnDailyIncrement) {
            failOnDailyIncrement = false;
            throw new Error('simulated database write failure');
          }
          if (state.daily) state.daily.requests_used += 1;
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected SQL in usage-store test: ${sql}`);
      },
      release: () => { releaseTransaction(); },
    };
    return client;
  };

  return {
    pool: { connect } as unknown as Pool,
    state,
    setNow(value: string) { now = new Date(value); },
    failNextDailyIncrement() { failOnDailyIncrement = true; },
  };
}

describe('PostgresUsageStore daily reservation', () => {
  it('allows exactly the shared cap across concurrent installations', async () => {
    const database = fakePool();
    const store = new PostgresUsageStore(database.pool, 500);
    const reservations = await Promise.all(Array.from({ length: 501 }, (_, i) => store.reserve(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)));
    expect(reservations.filter((result) => result.status === 'reserved')).toHaveLength(500);
    expect(reservations.filter((result) => result.status === 'daily_limit')).toHaveLength(1);
    expect(database.state.daily?.requests_used).toBe(500);
  });

  it('increments neither allowance when the daily cap is exhausted', async () => {
    const database = fakePool();
    database.state.daily = { usage_date: '2026-10-28', requests_used: 2 };
    const result = await new PostgresUsageStore(database.pool, 2).reserve('00000000-0000-4000-8000-000000000001');
    expect(result.status).toBe('daily_limit');
    expect(database.state.installations.get('00000000-0000-4000-8000-000000000001')).toBe(0);
    expect(database.state.daily?.requests_used).toBe(2);
  });

  it('does not increment the daily counter when an installation is exhausted', async () => {
    const database = fakePool();
    database.state.installations.set('00000000-0000-4000-8000-000000000001', 25);
    database.state.daily = { usage_date: '2026-10-28', requests_used: 4 };
    const result = await new PostgresUsageStore(database.pool, 500).reserve('00000000-0000-4000-8000-000000000001');
    expect(result.status).toBe('installation_limit');
    expect(database.state.daily?.requests_used).toBe(4);
  });

  it('rolls back both counters if either database write fails', async () => {
    const database = fakePool();
    database.failNextDailyIncrement();
    const store = new PostgresUsageStore(database.pool, 500);
    await expect(store.reserve('00000000-0000-4000-8000-000000000001')).rejects.toThrow('simulated database write failure');
    expect(database.state.installations.has('00000000-0000-4000-8000-000000000001')).toBe(false);
    expect(database.state.daily).toBeNull();
    expect(await store.reserve('00000000-0000-4000-8000-000000000001')).toMatchObject({ status: 'reserved', installationRequestsUsed: 1 });
  });

  it('resets the shared counter on the next UTC date and reports seconds to reset', async () => {
    const database = fakePool('2026-10-28T23:59:00.000Z');
    database.state.daily = { usage_date: '2026-10-28', requests_used: 500 };
    database.setNow('2026-10-29T00:00:30.000Z');
    const result = await new PostgresUsageStore(database.pool, 500).reserve('00000000-0000-4000-8000-000000000001');
    expect(result).toMatchObject({ status: 'reserved', installationRequestsUsed: 1 });
    expect(database.state.daily).toEqual({ usage_date: '2026-10-29', requests_used: 1 });
  });
});
