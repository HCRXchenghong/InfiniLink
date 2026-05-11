CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_circles_plate_created
    ON circles(plate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_circle_follows_circle_created
    ON circle_follows(circle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_circle_follows_user_created
    ON circle_follows(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_plates_user_created
    ON user_plates(user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_post_images_post_sort
    ON post_images(post_id, sort_index ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag_post
    ON post_tags(tag_id, post_id);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_user
    ON comment_likes(comment_id, user_id);

CREATE INDEX IF NOT EXISTS idx_comments_post_parent_created_active
    ON comments(post_id, comment_id, created_at DESC)
    WHERE is_deleted = FALSE AND audit_status = 1;

CREATE INDEX IF NOT EXISTS idx_post_rewards_post_created
    ON post_rewards(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_rewards_to_user_created
    ON post_rewards(to_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_created_status
    ON orders(user_id, created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_type_created
    ON notifications(user_id, is_read, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_read_created
    ON chat_messages(receiver_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_pair_read_created
    ON chat_messages(receiver_id, sender_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_active_created
    ON posts(created_at DESC)
    WHERE is_deleted = FALSE AND audit_status = 1;

CREATE INDEX IF NOT EXISTS idx_posts_hot_created
    ON posts(like_count_cache DESC, comment_count_cache DESC, created_at DESC)
    WHERE is_deleted = FALSE AND audit_status = 1;

CREATE INDEX IF NOT EXISTS idx_posts_content_trgm
    ON posts USING gin(posts_content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_circles_name_trgm
    ON circles USING gin(circle_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_circles_intro_trgm
    ON circles USING gin(circle_introduce gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_name_trgm
    ON users USING gin(user_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_intro_trgm
    ON users USING gin(user_introduce gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tags_name_trgm
    ON tags USING gin(tags_name gin_trgm_ops);
