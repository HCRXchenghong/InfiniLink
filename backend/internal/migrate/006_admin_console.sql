ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_account_status_created
    ON users(account_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_last_login_at
    ON users(last_login_at DESC);
