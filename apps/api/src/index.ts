import 'dotenv/config';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { BedrockModelInvoker } from './bedrock.js';
import { PostgresUsageStore } from './postgres-usage.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const pool = new Pool({
  connectionString: databaseUrl,
  ...(process.env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 5,
});
await pool.query(`
  CREATE TABLE IF NOT EXISTS installations (
    installation_id UUID PRIMARY KEY,
    requests_used SMALLINT NOT NULL DEFAULT 0 CHECK (requests_used >= 0 AND requests_used <= 25),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);
const app = buildApp({ usage: new PostgresUsageStore(pool), model: new BedrockModelInvoker() });
const port = Number(process.env.PORT || 8787);

await app.listen({ host: '0.0.0.0', port });
const shutdown = async () => { await app.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
