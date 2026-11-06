BEGIN;
ALTER TABLE formatter_accounts.identities ADD COLUMN IF NOT EXISTS workspace_key text;
UPDATE formatter_accounts.identities
SET workspace_key = translate(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '+/=', '-_')
WHERE workspace_key IS NULL;
ALTER TABLE formatter_accounts.identities ALTER COLUMN workspace_key SET NOT NULL;
COMMIT;
