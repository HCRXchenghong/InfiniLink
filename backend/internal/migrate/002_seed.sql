INSERT INTO users (
    id,
    external_key,
    user_name,
    user_avatar,
    user_background_maps,
    user_introduce,
    is_official,
    is_authentication,
    is_member
) VALUES
    (1, 'seed-official', 'InfiniLink 官方', 'http://127.0.0.1/assets/avatar-default.svg', 'http://127.0.0.1/assets/profile-cover.svg', '欢迎来到 InfiniLink。这里是一份可直接跑起来的社区后端底座。', TRUE, TRUE, TRUE),
    (2, 'seed-creator', '创作者示例', 'http://127.0.0.1/assets/avatar-default.svg', 'http://127.0.0.1/assets/profile-cover.svg', '我在这里分享后端、产品和内容社区的实践。', FALSE, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plates (id, plate_name, sort_order) VALUES
    (1, '推荐', 1),
    (2, '后端', 2),
    (3, '产品', 3),
    (4, 'AI', 4),
    (5, '随想', 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circles (
    id,
    user_id,
    plate_id,
    circle_name,
    circle_introduce,
    head_portrait,
    background_maps,
    audit_status
) VALUES
    (1, 1, 2, 'Go 工程实践', '聊 Go、架构、并发与服务治理。', 'http://127.0.0.1/assets/circle-avatar.svg', 'http://127.0.0.1/assets/circle-cover.svg', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tags (id, tags_name, hot_score, created_by) VALUES
    (1, 'Go', 100, 1),
    (2, '架构', 90, 1),
    (3, '社区', 80, 1),
    (4, '产品', 70, 1),
    (5, 'AI', 60, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO posts (
    id,
    user_id,
    circle_id,
    posts_content,
    audit_status,
    like_count_cache,
    comment_count_cache,
    reward_count_cache
) VALUES
    (1, 2, 1, '<p>这是一条种子内容，用来验证小程序首页、圈子页、搜索页和详情页的主链路已经被新的 Go 后端接住了。</p><p>你后面只要继续往这里填真实内容，就可以慢慢替换成自己的社区数据。</p>', 1, 1, 1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO post_images (post_id, img_url, sort_index) VALUES
    (1, 'http://127.0.0.1/assets/post-cover.svg', 0)
ON CONFLICT DO NOTHING;

INSERT INTO post_tags (post_id, tag_id) VALUES
    (1, 1),
    (1, 2),
    (1, 3)
ON CONFLICT DO NOTHING;

INSERT INTO post_likes (user_id, post_id) VALUES
    (1, 1)
ON CONFLICT DO NOTHING;

INSERT INTO comments (
    id,
    post_id,
    user_id,
    comment_content,
    audit_status,
    like_count_cache
) VALUES
    (1, 1, 1, '后台已经接通，接下来就能围绕这套前端继续扩展功能了。', 1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO banners (
    id,
    title,
    slideshow_type,
    link,
    posts_id,
    circle_id,
    poster,
    sort_order
) VALUES
    (1, 'InfiniLink', 1, NULL, 1, 1, 'http://127.0.0.1/assets/banner-default.svg', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clauses (id, type, title, content) VALUES
    (21, 21, 'InfiniLink 用户服务协议', '<h1>InfiniLink 用户服务协议</h1><p>欢迎使用 InfiniLink。请勿发布违法违规、侵犯他人权益或破坏社区秩序的内容。</p><p>你创建的内容、圈子、评论和资料，需要符合适用法律法规与平台规范。</p>')
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('plates_id_seq', (SELECT MAX(id) FROM plates));
SELECT setval('circles_id_seq', (SELECT MAX(id) FROM circles));
SELECT setval('tags_id_seq', (SELECT MAX(id) FROM tags));
SELECT setval('posts_id_seq', (SELECT MAX(id) FROM posts));
SELECT setval('comments_id_seq', (SELECT MAX(id) FROM comments));
SELECT setval('banners_id_seq', (SELECT MAX(id) FROM banners));
SELECT setval('clauses_id_seq', (SELECT MAX(id) FROM clauses));
