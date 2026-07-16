-- Durable, normalized GitHub App authority diagnostics. Raw webhook payloads
-- remain deliberately absent; only fields needed to explain a decision persist.

ALTER TABLE github_installation_facts
  ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE github_webhook_deliveries ADD COLUMN action TEXT;
ALTER TABLE github_webhook_deliveries ADD COLUMN installation_id INTEGER;
ALTER TABLE github_webhook_deliveries ADD COLUMN account_id INTEGER;
ALTER TABLE github_webhook_deliveries ADD COLUMN account_login TEXT;
ALTER TABLE github_webhook_deliveries ADD COLUMN account_type TEXT;
ALTER TABLE github_webhook_deliveries ADD COLUMN result_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_github_installation_facts_target_actor
  ON github_installation_facts(account_id, account_type, installer_sender_id, state);
