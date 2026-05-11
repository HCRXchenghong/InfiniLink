CREATE TABLE IF NOT EXISTS ifpay_user_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL DEFAULT '',
    ifpay_user_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT '',
    access_token_cipher TEXT NOT NULL DEFAULT '',
    refresh_token_cipher TEXT NOT NULL DEFAULT '',
    access_expires_at TIMESTAMPTZ,
    refresh_expires_at TIMESTAMPTZ,
    last_authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ifpay_user_tokens_user_app
    ON ifpay_user_tokens(user_id, app_id);

ALTER TABLE payment_callbacks
    ADD COLUMN IF NOT EXISTS event_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_callbacks_provider_event_id
    ON payment_callbacks(provider, event_id)
    WHERE event_id <> '';
