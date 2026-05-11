ALTER TABLE users
    ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS level_score BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level_no INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS online_seconds BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS active_seconds BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comment_growth_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS like_growth_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS membership_bonus_score BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_growth_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    ref_type TEXT NOT NULL DEFAULT '',
    ref_id BIGINT NOT NULL DEFAULT 0,
    score_delta BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, event_type, ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_users_membership_expires_at
    ON users(membership_expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_level_no
    ON users(level_no DESC, level_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_growth_events_user_created
    ON user_growth_events(user_id, created_at DESC);

UPDATE users
SET membership_expires_at = NOW() + INTERVAL '30 day'
WHERE is_member = TRUE
  AND membership_expires_at IS NULL;
