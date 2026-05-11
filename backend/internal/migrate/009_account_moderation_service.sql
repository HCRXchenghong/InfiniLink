ALTER TABLE users
    ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value JSONB NOT NULL DEFAULT 'null'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings(setting_key, setting_value)
VALUES ('sensitive_words', '[]'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO app_settings(setting_key, setting_value)
SELECT
    'customer_service_user_id',
    to_jsonb(COALESCE((SELECT id FROM users WHERE is_official = TRUE ORDER BY id ASC LIMIT 1), 1))
ON CONFLICT (setting_key) DO NOTHING;
