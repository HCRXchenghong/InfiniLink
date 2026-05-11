ALTER TABLE feedbacks
    ADD COLUMN IF NOT EXISTS process_status TEXT NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS admin_reply TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feedbacks_process_status_created
    ON feedbacks(process_status, created_at DESC);
