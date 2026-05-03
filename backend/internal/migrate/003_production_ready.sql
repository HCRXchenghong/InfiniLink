ALTER TABLE users
    ADD COLUMN IF NOT EXISTS wechat_openid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid
    ON users(wechat_openid)
    WHERE wechat_openid IS NOT NULL;

ALTER TABLE post_rewards
    ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_rewards_order_id
    ON post_rewards(order_id)
    WHERE order_id IS NOT NULL;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS payment_payload JSONB,
    ADD COLUMN IF NOT EXISTS payment_meta JSONB,
    ADD COLUMN IF NOT EXISTS callback_payload JSONB,
    ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
    ON orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
    ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_callbacks (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    order_number TEXT NOT NULL DEFAULT '',
    provider_order_id TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT '',
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    process_status TEXT NOT NULL DEFAULT 'received',
    request_id TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_callbacks_provider_order
    ON payment_callbacks(provider, order_number, provider_order_id, created_at DESC);
