CREATE TABLE IF NOT EXISTS daily_ai_usage (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  usage_date DATE NOT NULL,
  requests_used INTEGER NOT NULL DEFAULT 0 CHECK (requests_used >= 0)
);

-- One locked row holds the shared UTC-day attempt count. The row is reset in
-- place at the next UTC date, so this table does not grow with each day.
