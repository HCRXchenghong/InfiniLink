ALTER TABLE users
    ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT '';

UPDATE users
SET membership_tier = 'pro'
WHERE is_member = TRUE
  AND COALESCE(NULLIF(TRIM(membership_tier), ''), '') = '';

CREATE INDEX IF NOT EXISTS idx_users_membership_tier
    ON users(membership_tier, created_at DESC);
