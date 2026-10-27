CREATE TABLE IF NOT EXISTS installations (
  installation_id UUID PRIMARY KEY,
  requests_used SMALLINT NOT NULL DEFAULT 0 CHECK (requests_used >= 0 AND requests_used <= 25),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deliberately stores only the random extension installation ID and usage count.
-- Email transcripts, instructions, IP addresses, and model responses are not stored.
