CREATE TABLE IF NOT EXISTS user_follows (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_follows_unique UNIQUE (user_id, target_user_id),
    CONSTRAINT user_follows_no_self CHECK (user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_user_created
    ON user_follows (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_follows_target_created
    ON user_follows (target_user_id, created_at DESC);
