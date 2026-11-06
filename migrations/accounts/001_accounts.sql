BEGIN;
CREATE SCHEMA IF NOT EXISTS formatter_accounts;
CREATE TABLE IF NOT EXISTS formatter_accounts.identities (
  id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  center_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject),
  UNIQUE (issuer, center_uid)
);
CREATE TABLE IF NOT EXISTS formatter_accounts.attempts (
  state_hash text PRIMARY KEY,
  binding_hash text NOT NULL,
  prior_session text,
  verifier text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS formatter_accounts.sessions (
  token_hash text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES formatter_accounts.identities(id),
  access_token text NOT NULL,
  binding text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS formatter_sessions_expiry ON formatter_accounts.sessions (expires_at);
CREATE INDEX IF NOT EXISTS formatter_attempts_expiry ON formatter_accounts.attempts (expires_at);
CREATE TABLE IF NOT EXISTS formatter_accounts.jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES formatter_accounts.identities(id),
  feature text NOT NULL,
  client_key text NOT NULL,
  input_hash text NOT NULL,
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN (
    'new', 'reserving', 'reserved', 'running', 'prepared', 'confirming',
    'failing', 'ready', 'failed'
  )),
  reservation_id uuid,
  result jsonb,
  error text,
  pending_recovery boolean NOT NULL DEFAULT false,
  retry_at timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, feature, client_key)
);
CREATE INDEX IF NOT EXISTS formatter_jobs_recovery ON formatter_accounts.jobs (retry_at)
  WHERE stage NOT IN ('ready', 'failed');
COMMIT;
