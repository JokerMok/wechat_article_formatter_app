BEGIN;
ALTER TABLE formatter_accounts.attempts ADD COLUMN IF NOT EXISTS expected_uid text;
ALTER TABLE formatter_accounts.attempts ADD COLUMN IF NOT EXISTS owner_signin boolean NOT NULL DEFAULT false;
ALTER TABLE formatter_accounts.attempts ADD COLUMN IF NOT EXISTS silent_signin boolean NOT NULL DEFAULT false;
COMMIT;
