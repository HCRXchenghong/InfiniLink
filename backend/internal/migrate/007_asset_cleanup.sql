UPDATE users
SET user_background_maps = 'http://127.0.0.1/assets/illustrations/world-rafiki.png'
WHERE LOWER(COALESCE(user_background_maps, '')) IN (
    'http://127.0.0.1/assets/profile-cover.svg',
    'http://localhost/assets/profile-cover.svg'
)
OR LOWER(COALESCE(user_background_maps, '')) LIKE '%/storage/wxprogram/image/world-rafiki.png';

UPDATE circles
SET head_portrait = 'http://127.0.0.1/assets/illustrations/circles-rafiki.png'
WHERE LOWER(COALESCE(head_portrait, '')) IN (
    'http://127.0.0.1/assets/circle-avatar.svg',
    'http://localhost/assets/circle-avatar.svg'
)
OR LOWER(COALESCE(head_portrait, '')) LIKE '%/storage/wxprogram/image/circles-rafiki.png';

UPDATE circles
SET background_maps = 'http://127.0.0.1/assets/illustrations/social-media-rafiki.png'
WHERE LOWER(COALESCE(background_maps, '')) IN (
    'http://127.0.0.1/assets/circle-cover.svg',
    'http://localhost/assets/circle-cover.svg'
)
OR LOWER(COALESCE(background_maps, '')) LIKE '%/storage/wxprogram/image/social-media-rafiki.png';

UPDATE post_images
SET img_url = 'http://127.0.0.1/assets/illustrations/social-media-rafiki.png'
WHERE LOWER(COALESCE(img_url, '')) IN (
    'http://127.0.0.1/assets/post-cover.svg',
    'http://localhost/assets/post-cover.svg'
)
OR LOWER(COALESCE(img_url, '')) LIKE '%/storage/wxprogram/image/social-media-rafiki.png';

UPDATE banners
SET poster = 'http://127.0.0.1/assets/illustrations/outer-space-rafiki.png'
WHERE LOWER(COALESCE(poster, '')) IN (
    'http://127.0.0.1/assets/banner-default.svg',
    'http://localhost/assets/banner-default.svg'
)
OR LOWER(COALESCE(poster, '')) LIKE '%/storage/wxprogram/image/outer-space-rafiki.png';
