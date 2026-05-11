package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	defaultPageSize   = 10
	defaultChatSize   = 20
	defaultSearchSize = 10
)

type wechatUserInfo struct {
	NickName  string `json:"nickName"`
	AvatarURL string `json:"avatarUrl"`
	Province  string `json:"province"`
	City      string `json:"city"`
	Country   string `json:"country"`
	Gender    int    `json:"gender"`
}

type loginRequest struct {
	Code      string         `json:"code"`
	UserInfo  wechatUserInfo `json:"userInfo"`
	IV        string         `json:"iv"`
	Encrypted string         `json:"encryptedData"`
}

type circleInput struct {
	ID              int64  `json:"id"`
	CircleName      string `json:"circle_name"`
	CircleIntroduce string `json:"circle_introduce"`
	HeadPortrait    string `json:"head_portrait"`
	BackgroundMaps  string `json:"background_maps"`
	PlateID         int64  `json:"plate_id"`
}

type postInput struct {
	PostsContent  string          `json:"posts_content"`
	CircleID      int64           `json:"circle_id"`
	Tags          json.RawMessage `json:"tags"`
	Address       json.RawMessage `json:"address"`
	ImageURLs     json.RawMessage `json:"image_urls"`
	VideoURL      string          `json:"video_url"`
	VideoThumbURL string          `json:"video_thumb_url"`
	VideoHeight   int             `json:"video_height"`
	VideoWidth    int             `json:"video_width"`
}

type commentInput struct {
	PostsID       int64  `json:"posts_id"`
	CommentID     int64  `json:"comment_id"`
	ReplyUserID   int64  `json:"reply_user_id"`
	CommentText   string `json:"comment_content"`
	CommentImgURL string `json:"comment_img_url"`
}

type postCore struct {
	ID               int64
	UserID           int64
	CircleID         int64
	PostsContent     string
	AddressJSON      []byte
	VideoURL         sql.NullString
	VideoThumbURL    sql.NullString
	VideoHeight      sql.NullInt64
	VideoWidth       sql.NullInt64
	AuditStatus      int
	IsDeleted        bool
	CreatedAt        time.Time
	UserName         string
	UserAvatar       sql.NullString
	UserIntroduce    sql.NullString
	UserOfficial     bool
	UserAuth         bool
	UserMember       bool
	UserMemberTier   sql.NullString
	UserMemberExpiry sql.NullTime
	UserLevelNo      int64
	UserLevelScore   int64
	CircleName       sql.NullString
	LikeCount        int64
	CommentCount     int64
	ExceptionalCount int64
	IsLike           bool
	IsCollect        bool
	IsFollowUser     bool
	IsMyPosts        bool
}

type circleCore struct {
	ID          int64
	UserID      int64
	PlateID     int64
	Name        string
	Introduce   sql.NullString
	Head        sql.NullString
	Background  sql.NullString
	PostCount   int64
	FollowCount int64
	IsFollow    bool
}

func (s *Server) fetchOrCreateUser(ctx context.Context, payload loginRequest) (int64, error) {
	nick := limitString(payload.UserInfo.NickName, 24)
	if nick == "" {
		nick = "InfiniLink 用户"
	}

	avatar := normalizeText(payload.UserInfo.AvatarURL)
	if avatar == "" {
		avatar = s.assetURL("avatar-default.svg")
	}

	background := s.assetURL("illustrations/world-rafiki.png")
	wechatOpenID, err := s.exchangeWeChatCode(ctx, payload.Code)
	if err != nil {
		return 0, err
	}

	externalKey := stableHash(nick, avatar, payload.UserInfo.Country, payload.UserInfo.Province, payload.UserInfo.City)
	if wechatOpenID != "" {
		externalKey = "wx:" + wechatOpenID
	} else if payload.Code != "" && externalKey == stableHash("", "", "", "", "") {
		externalKey = stableHash(payload.Code)
	}

	var id int64
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (
			external_key,
			wechat_openid,
			user_name,
			user_avatar,
			user_background_maps,
			user_introduce,
			is_official,
			is_authentication,
			is_member,
			last_login_at
		) VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, FALSE, FALSE, FALSE, NOW())
		ON CONFLICT (external_key) DO UPDATE
		SET
			wechat_openid = COALESCE(NULLIF(EXCLUDED.wechat_openid, ''), users.wechat_openid),
			user_name = COALESCE(NULLIF(EXCLUDED.user_name, ''), users.user_name),
			user_avatar = COALESCE(NULLIF(EXCLUDED.user_avatar, ''), users.user_avatar),
			last_login_at = NOW(),
			updated_at = NOW()
		RETURNING id
	`, externalKey, wechatOpenID, nick, avatar, background, "欢迎来到 InfiniLink").Scan(&id)
	return id, err
}

func (s *Server) buildSelfUser(ctx context.Context, userID int64) (map[string]any, error) {
	return cachedJSON(s, ctx, userCacheKey(userID), s.cfg.UserCacheTTL, func(ctx context.Context) (map[string]any, error) {
		var (
			id            int64
			name          string
			avatar        sql.NullString
			background    sql.NullString
			introduce     sql.NullString
			isOfficial    bool
			isAuth        bool
			isMember      bool
			memberTier    sql.NullString
			memberExpiry  sql.NullTime
			followCount   int64
			followerCount int64
			likeCount     int64
			levelScore    int64
			onlineSeconds int64
			activeSeconds int64
			commentCount  int64
			likeActions   int64
			bonusScore    int64
		)
		err := s.db.QueryRow(ctx, `
			SELECT
				u.id,
				u.user_name,
				u.user_avatar,
				u.user_background_maps,
				u.user_introduce,
				u.is_official,
				u.is_authentication,
				u.is_member,
				COALESCE(u.membership_tier, ''),
				u.membership_expires_at,
				COALESCE((SELECT COUNT(*) FROM user_follows uf WHERE uf.user_id = u.id), 0),
				COALESCE((SELECT COUNT(*) FROM user_follows uf WHERE uf.target_user_id = u.id), 0),
				COALESCE((SELECT SUM(p.like_count_cache) FROM posts p WHERE p.user_id = u.id AND p.is_deleted = FALSE), 0),
				COALESCE(u.level_score, 0),
				COALESCE(u.online_seconds, 0),
				COALESCE(u.active_seconds, 0),
				COALESCE(u.comment_growth_count, 0),
				COALESCE(u.like_growth_count, 0),
				COALESCE(u.membership_bonus_score, 0)
			FROM users u
			WHERE u.id = $1
		`, userID).Scan(
			&id,
			&name,
			&avatar,
			&background,
			&introduce,
			&isOfficial,
			&isAuth,
			&isMember,
			&memberTier,
			&memberExpiry,
			&followCount,
			&followerCount,
			&likeCount,
			&levelScore,
			&onlineSeconds,
			&activeSeconds,
			&commentCount,
			&likeActions,
			&bonusScore,
		)
		if err != nil {
			return nil, err
		}

		now := time.Now()
		growth := s.growthRulesOrDefault(ctx)
		membership := buildMembershipPayload(resolveMembershipState(isMember, memberTier.String, memberExpiry, now), now)
		level := buildLevelPayload(growth, levelScore)
		payload := map[string]any{
			"id":                     id,
			"user_name":              name,
			"user_avatar":            pickString(avatar, s.assetURL("avatar-default.svg")),
			"user_background_maps":   pickString(background, s.assetURL("illustrations/world-rafiki.png")),
			"user_introduce":         pickString(introduce, "这个人很酷，还没有留下简介。"),
			"is_official":            boolToInt(isOfficial),
			"is_authentication":      boolToInt(isAuth),
			"follow_count":           followCount,
			"follow_user_count":      followerCount,
			"like_count":             likeCount,
			"online_seconds":         onlineSeconds,
			"active_seconds":         activeSeconds,
			"comment_growth_count":   commentCount,
			"like_growth_count":      likeActions,
			"membership_bonus_score": bonusScore,
		}
		for key, value := range membership {
			payload[key] = value
		}
		for key, value := range level {
			payload[key] = value
		}
		return payload, nil
	})
}

func (s *Server) buildPublicUser(ctx context.Context, viewerID, userID int64) (map[string]any, error) {
	return cachedJSON(s, ctx, publicUserCacheKey(viewerID, userID), s.cfg.UserCacheTTL, func(ctx context.Context) (map[string]any, error) {
		var (
			id           int64
			name         string
			avatar       sql.NullString
			background   sql.NullString
			introduce    sql.NullString
			isOfficial   bool
			isAuth       bool
			isMember     bool
			memberTier   sql.NullString
			memberExpiry sql.NullTime
			followTotal  int64
			fansTotal    int64
			likeTotal    int64
			isFollow     bool
			levelScore   int64
		)
		err := s.db.QueryRow(ctx, `
			SELECT
				u.id,
				u.user_name,
				u.user_avatar,
				u.user_background_maps,
				u.user_introduce,
				u.is_official,
				u.is_authentication,
				u.is_member,
				COALESCE(u.membership_tier, ''),
				u.membership_expires_at,
				COALESCE((SELECT COUNT(*) FROM user_follows uf WHERE uf.user_id = u.id), 0),
				COALESCE((SELECT COUNT(*) FROM user_follows uf WHERE uf.target_user_id = u.id), 0),
				COALESCE((SELECT SUM(p.like_count_cache) FROM posts p WHERE p.user_id = u.id AND p.is_deleted = FALSE), 0),
				EXISTS(SELECT 1 FROM user_follows uf WHERE uf.user_id = $2 AND uf.target_user_id = u.id),
				COALESCE(u.level_score, 0)
			FROM users u
			WHERE u.id = $1
		`, userID, viewerID).Scan(
			&id,
			&name,
			&avatar,
			&background,
			&introduce,
			&isOfficial,
			&isAuth,
			&isMember,
			&memberTier,
			&memberExpiry,
			&followTotal,
			&fansTotal,
			&likeTotal,
			&isFollow,
			&levelScore,
		)
		if err != nil {
			return nil, err
		}

		now := time.Now()
		growth := s.growthRulesOrDefault(ctx)
		membership := buildMembershipPayload(resolveMembershipState(isMember, memberTier.String, memberExpiry, now), now)
		level := buildLevelPayload(growth, levelScore)
		payload := map[string]any{
			"id":                   id,
			"user_name":            name,
			"user_avatar":          pickString(avatar, s.assetURL("avatar-default.svg")),
			"user_background_maps": pickString(background, s.assetURL("illustrations/world-rafiki.png")),
			"user_introduce":       pickString(introduce, "这个人很酷，还没有留下简介。"),
			"is_official":          boolToInt(isOfficial),
			"is_authentication":    boolToInt(isAuth),
			"followTotal":          followTotal,
			"fansTotal":            fansTotal,
			"likeTotal":            likeTotal,
			"isFollow":             boolToInt(isFollow),
		}
		for key, value := range membership {
			payload[key] = value
		}
		for key, value := range level {
			payload[key] = value
		}
		return payload, nil
	})
}

func (s *Server) buildPagination(page int, total int64, items any) map[string]any {
	return map[string]any{
		"current_page": page,
		"total":        total,
		"data":         items,
	}
}

func (s *Server) fetchPostIDs(ctx context.Context, query string, args ...any) ([]int64, int64, error) {
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var (
		ids   []int64
		total int64
	)
	for rows.Next() {
		var (
			id  int64
			cnt int64
		)
		if err := rows.Scan(&id, &cnt); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
		total = cnt
	}
	return ids, total, rows.Err()
}

func (s *Server) buildPosts(ctx context.Context, viewerID int64, postIDs []int64) ([]map[string]any, error) {
	if len(postIDs) == 0 {
		return []map[string]any{}, nil
	}

	coresByID, err := s.fetchPostCores(ctx, viewerID, postIDs)
	if err != nil {
		return nil, err
	}
	postOwners := make(map[int64]int64, len(coresByID))
	for postID, core := range coresByID {
		postOwners[postID] = core.UserID
	}

	imagesByPost, err := s.fetchPostImagesByPostIDs(ctx, postIDs)
	if err != nil {
		return nil, err
	}
	tagsByPost, err := s.fetchPostTagsByPostIDs(ctx, postIDs)
	if err != nil {
		return nil, err
	}
	rewardsByPost, err := s.fetchPostRewardsPreviewByPostIDs(ctx, postIDs)
	if err != nil {
		return nil, err
	}
	commentsByPost, err := s.fetchPostCommentsPreviewByPostIDs(ctx, postIDs, postOwners)
	if err != nil {
		return nil, err
	}

	posts := make([]map[string]any, 0, len(postIDs))
	for _, postID := range postIDs {
		core, ok := coresByID[postID]
		if !ok {
			continue
		}
		posts = append(posts, s.composePostPayload(
			ctx,
			core,
			imagesByPost[postID],
			tagsByPost[postID],
			rewardsByPost[postID],
			commentsByPost[postID],
		))
	}
	return posts, nil
}

func (s *Server) buildPost(ctx context.Context, viewerID, postID int64) (map[string]any, error) {
	if postID <= 0 {
		return nil, nil
	}

	posts, err := s.buildPosts(ctx, viewerID, []int64{postID})
	if err != nil {
		return nil, err
	}
	if len(posts) == 0 {
		return nil, nil
	}
	return posts[0], nil
}

func (s *Server) fetchPostCores(ctx context.Context, viewerID int64, postIDs []int64) (map[int64]postCore, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			p.id,
			p.user_id,
			p.circle_id,
			p.posts_content,
			p.address_json,
			p.video_url,
			p.video_thumb_url,
			p.video_height,
			p.video_width,
			p.audit_status,
			p.is_deleted,
			p.created_at,
			u.user_name,
			u.user_avatar,
			u.user_introduce,
			u.is_official,
			u.is_authentication,
			u.is_member,
			COALESCE(u.membership_tier, ''),
			u.membership_expires_at,
			COALESCE(u.level_no, 1),
			COALESCE(u.level_score, 0),
			c.circle_name,
			p.like_count_cache,
			p.comment_count_cache,
			p.reward_count_cache,
			(pl.user_id IS NOT NULL),
			(pc.user_id IS NOT NULL),
			(uf.user_id IS NOT NULL),
			(p.user_id = $2)
		FROM posts p
		JOIN users u ON u.id = p.user_id
		LEFT JOIN circles c ON c.id = p.circle_id
		LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = $2
		LEFT JOIN post_collects pc ON pc.post_id = p.id AND pc.user_id = $2
		LEFT JOIN user_follows uf ON uf.user_id = $2 AND uf.target_user_id = p.user_id
		WHERE p.id = ANY($1)
	`, postIDs, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make(map[int64]postCore, len(postIDs))
	for rows.Next() {
		var record postCore
		if err := rows.Scan(
			&record.ID,
			&record.UserID,
			&record.CircleID,
			&record.PostsContent,
			&record.AddressJSON,
			&record.VideoURL,
			&record.VideoThumbURL,
			&record.VideoHeight,
			&record.VideoWidth,
			&record.AuditStatus,
			&record.IsDeleted,
			&record.CreatedAt,
			&record.UserName,
			&record.UserAvatar,
			&record.UserIntroduce,
			&record.UserOfficial,
			&record.UserAuth,
			&record.UserMember,
			&record.UserMemberTier,
			&record.UserMemberExpiry,
			&record.UserLevelNo,
			&record.UserLevelScore,
			&record.CircleName,
			&record.LikeCount,
			&record.CommentCount,
			&record.ExceptionalCount,
			&record.IsLike,
			&record.IsCollect,
			&record.IsFollowUser,
			&record.IsMyPosts,
		); err != nil {
			return nil, err
		}
		records[record.ID] = record
	}
	return records, rows.Err()
}

func (s *Server) composePostPayload(ctx context.Context, record postCore, images, tags, rewards, comments []map[string]any) map[string]any {
	if images == nil {
		images = []map[string]any{}
	}
	if tags == nil {
		tags = []map[string]any{}
	}
	if rewards == nil {
		rewards = []map[string]any{}
	}
	if comments == nil {
		comments = []map[string]any{}
	}

	address := map[string]any(nil)
	if len(record.AddressJSON) > 0 {
		_ = json.Unmarshal(record.AddressJSON, &address)
		if len(address) == 0 {
			address = nil
		}
	}

	var video any
	if record.VideoURL.Valid {
		showType := 1
		if record.VideoWidth.Int64 >= record.VideoHeight.Int64 {
			showType = 0
		}
		video = map[string]any{
			"video_url":       record.VideoURL.String,
			"video_thumb_url": pickString(record.VideoThumbURL, s.assetURL("illustrations/social-media-rafiki.png")),
			"show_type":       showType,
		}
	}

	post := map[string]any{
		"id":                record.ID,
		"posts_content":     record.PostsContent,
		"user":              s.compactUser(ctx, record.UserID, record.UserName, record.UserAvatar, record.UserOfficial, record.UserAuth, record.UserMember, record.UserMemberTier.String, record.UserMemberExpiry, record.UserLevelNo, record.UserLevelScore),
		"circle":            map[string]any{"id": record.CircleID, "circle_name": pickString(record.CircleName, "默认圈子")},
		"images":            images,
		"video":             video,
		"format_time":       formatRelativeTime(record.CreatedAt),
		"address":           address,
		"tags":              tags,
		"like_count":        record.LikeCount,
		"comment_count":     record.CommentCount,
		"exceptional_count": record.ExceptionalCount,
		"exceptional":       rewards,
		"comment":           comments,
		"is_like":           record.IsLike,
		"is_collect":        record.IsCollect,
		"is_follow_user":    record.IsFollowUser,
		"is_my_posts":       record.IsMyPosts,
		"is_content_beyond": len([]rune(stripHTML(record.PostsContent))) > 120,
		"is_delete":         record.IsDeleted,
	}
	if len(images) > 0 {
		post["imagea"] = images[0]
	} else {
		post["imagea"] = map[string]any{"img_url": s.assetURL("illustrations/social-media-rafiki.png")}
	}
	return post
}

func (s *Server) compactUser(ctx context.Context, id int64, name string, avatar sql.NullString, isOfficial, isAuth, isMember bool, membershipTier string, membershipExpiry sql.NullTime, levelNo int64, levelScore int64) map[string]any {
	now := time.Now()
	membership := buildMembershipPayload(resolveMembershipState(isMember, membershipTier, membershipExpiry, now), now)
	growth := s.growthRulesOrDefault(ctx)
	level := buildLevelPayload(growth, levelScore)
	payload := map[string]any{
		"id":                id,
		"user_name":         name,
		"user_avatar":       pickString(avatar, s.assetURL("avatar-default.svg")),
		"is_official":       boolToInt(isOfficial),
		"is_authentication": boolToInt(isAuth),
	}
	for key, value := range membership {
		payload[key] = value
	}
	if levelNo < 1 {
		levelNo = 1
	}
	payload["level_no"] = level["level_no"]
	payload["level_label"] = level["level_label"]
	return payload
}

func (s *Server) fetchPostImagesByPostIDs(ctx context.Context, postIDs []int64) (map[int64][]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT post_id, img_url
		FROM post_images
		WHERE post_id = ANY($1)
		ORDER BY post_id ASC, sort_index ASC, id ASC
	`, postIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	imagesByPost := make(map[int64][]map[string]any, len(postIDs))
	for rows.Next() {
		var postID int64
		var url sql.NullString
		if err := rows.Scan(&postID, &url); err != nil {
			return nil, err
		}
		imagesByPost[postID] = append(imagesByPost[postID], map[string]any{
			"img_url": pickString(url, s.assetURL("illustrations/social-media-rafiki.png")),
		})
	}
	return imagesByPost, rows.Err()
}

func (s *Server) fetchPostTagsByPostIDs(ctx context.Context, postIDs []int64) (map[int64][]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT pt.post_id, t.id, t.tags_name
		FROM post_tags pt
		JOIN tags t ON t.id = pt.tag_id
		WHERE pt.post_id = ANY($1)
		ORDER BY pt.post_id ASC, t.hot_score DESC, t.id ASC
	`, postIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tagsByPost := make(map[int64][]map[string]any, len(postIDs))
	for rows.Next() {
		var (
			postID int64
			id     int64
			name   string
		)
		if err := rows.Scan(&postID, &id, &name); err != nil {
			return nil, err
		}
		tagsByPost[postID] = append(tagsByPost[postID], map[string]any{
			"id":        id,
			"tags_name": name,
		})
	}
	return tagsByPost, rows.Err()
}

func (s *Server) fetchPostRewardsPreviewByPostIDs(ctx context.Context, postIDs []int64) (map[int64][]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT post_id, user_avatar
		FROM (
			SELECT
				pr.post_id,
				u.user_avatar,
				ROW_NUMBER() OVER (PARTITION BY pr.post_id ORDER BY pr.created_at DESC) AS rn
			FROM post_rewards pr
			JOIN users u ON u.id = pr.from_user_id
			WHERE pr.post_id = ANY($1)
		) ranked
		WHERE rn <= 6
		ORDER BY post_id ASC, rn ASC
	`, postIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rewardsByPost := make(map[int64][]map[string]any, len(postIDs))
	for rows.Next() {
		var postID int64
		var avatar sql.NullString
		if err := rows.Scan(&postID, &avatar); err != nil {
			return nil, err
		}
		rewardsByPost[postID] = append(rewardsByPost[postID], map[string]any{
			"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
		})
	}
	return rewardsByPost, rows.Err()
}

func (s *Server) fetchPostCommentsPreviewByPostIDs(ctx context.Context, postIDs []int64, postOwners map[int64]int64) (map[int64][]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			post_id,
			id,
			user_id,
			reply_user_id,
			comment_content,
			comment_img_url,
			user_name
		FROM (
			SELECT
				c.post_id,
				c.id,
				c.user_id,
				c.reply_user_id,
				c.comment_content,
				c.comment_img_url,
				u.user_name,
				ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.created_at DESC) AS rn
			FROM comments c
			JOIN users u ON u.id = c.user_id
			WHERE c.post_id = ANY($1)
				AND c.comment_id IS NULL
				AND c.is_deleted = FALSE
				AND c.audit_status = 1
		) ranked
		WHERE rn <= 2
		ORDER BY post_id ASC, rn ASC
	`, postIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	commentsByPost := make(map[int64][]map[string]any, len(postIDs))
	for rows.Next() {
		var (
			postID      int64
			id          int64
			userID      int64
			replyUserID sql.NullInt64
			content     sql.NullString
			img         sql.NullString
			userName    string
		)
		if err := rows.Scan(&postID, &id, &userID, &replyUserID, &content, &img, &userName); err != nil {
			return nil, err
		}
		commentsByPost[postID] = append(commentsByPost[postID], map[string]any{
			"id":              id,
			"user_id":         userID,
			"posts_user_id":   postOwners[postID],
			"user_name":       userName,
			"comment_content": nullableString(content),
			"comment_img_url": nullableString(img),
		})
	}
	return commentsByPost, rows.Err()
}

func (s *Server) fetchCommentTree(ctx context.Context, viewerID, postID int64, page int) ([]map[string]any, int64, error) {
	offsetValue := offset(page, defaultPageSize)
	rows, err := s.db.Query(ctx, `
		SELECT
			c.id,
			c.user_id,
			c.comment_content,
			c.comment_img_url,
			c.created_at,
			c.like_count_cache,
			u.user_name,
			u.user_avatar,
			p.user_id,
			(cl.user_id IS NOT NULL),
			COUNT(*) OVER()
		FROM comments c
		JOIN users u ON u.id = c.user_id
		JOIN posts p ON p.id = c.post_id
		LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = $2
		WHERE c.post_id = $1
			AND c.comment_id IS NULL
			AND c.is_deleted = FALSE
			AND c.audit_status = 1
		ORDER BY c.created_at DESC
		LIMIT $3 OFFSET $4
	`, postID, viewerID, defaultPageSize, offsetValue)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	type topComment struct {
		ID         int64
		UserID     int64
		Content    sql.NullString
		Image      sql.NullString
		CreatedAt  time.Time
		LikeCount  int64
		UserName   string
		UserAvatar sql.NullString
		PostsUser  int64
		IsLike     bool
		Total      int64
	}

	var (
		commentRows []topComment
		total       int64
	)
	for rows.Next() {
		var item topComment
		if err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.Content,
			&item.Image,
			&item.CreatedAt,
			&item.LikeCount,
			&item.UserName,
			&item.UserAvatar,
			&item.PostsUser,
			&item.IsLike,
			&item.Total,
		); err != nil {
			return nil, 0, err
		}
		commentRows = append(commentRows, item)
		total = item.Total
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	result := make([]map[string]any, 0, len(commentRows))
	for _, item := range commentRows {
		children, err := s.fetchCommentChildren(ctx, viewerID, item.ID)
		if err != nil {
			return nil, 0, err
		}
		commentMap := map[string]any{
			"id":              item.ID,
			"user_id":         item.UserID,
			"user_name":       item.UserName,
			"user_avatar":     pickString(item.UserAvatar, s.assetURL("avatar-default.svg")),
			"comment_content": nullableString(item.Content),
			"comment_img_url": nullableString(item.Image),
			"format_time":     formatRelativeTime(item.CreatedAt),
			"like_count":      item.LikeCount,
			"is_like":         item.IsLike,
			"posts_user_id":   item.PostsUser,
			"uid":             viewerID,
			"child":           children,
		}
		if item.Image.Valid && item.Image.String != "" {
			commentMap["imgList"] = []map[string]any{{"img_url": item.Image.String}}
		} else {
			commentMap["imgList"] = []map[string]any{}
		}
		result = append(result, commentMap)
	}
	return result, total, nil
}

func (s *Server) fetchCommentChildren(ctx context.Context, viewerID, parentID int64) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			c.id,
			c.user_id,
			c.reply_user_id,
			c.comment_content,
			c.comment_img_url,
			c.created_at,
			c.like_count_cache,
			u.user_name,
			u.user_avatar,
			ru.user_name,
			(cl.user_id IS NOT NULL)
		FROM comments c
		JOIN users u ON u.id = c.user_id
		LEFT JOIN users ru ON ru.id = c.reply_user_id
		LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = $2
		WHERE c.comment_id = $1
			AND c.is_deleted = FALSE
			AND c.audit_status = 1
		ORDER BY c.created_at ASC
	`, parentID, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var children []map[string]any
	for rows.Next() {
		var (
			id          int64
			userID      int64
			replyUserID sql.NullInt64
			content     sql.NullString
			image       sql.NullString
			createdAt   time.Time
			likeCount   int64
			userName    string
			userAvatar  sql.NullString
			replyUser   sql.NullString
			isLike      bool
		)
		if err := rows.Scan(
			&id,
			&userID,
			&replyUserID,
			&content,
			&image,
			&createdAt,
			&likeCount,
			&userName,
			&userAvatar,
			&replyUser,
			&isLike,
		); err != nil {
			return nil, err
		}
		children = append(children, map[string]any{
			"id":                 id,
			"user_id":            userID,
			"user_name":          userName,
			"user_avatar":        pickString(userAvatar, s.assetURL("avatar-default.svg")),
			"comment_content":    nullableString(content),
			"comment_img_url":    nullableString(image),
			"format_time":        formatRelativeTime(createdAt),
			"like_count":         likeCount,
			"is_like":            isLike,
			"uid":                viewerID,
			"comment_agent_id":   nullInt64(replyUserID),
			"comment_agent_name": nullableString(replyUser),
			"imgList":            buildImageList(nullableString(image)),
		})
	}
	return children, rows.Err()
}

func (s *Server) fetchCircleSummary(ctx context.Context, viewerID int64, circleID int64) (map[string]any, error) {
	circles, err := s.buildCircles(ctx, viewerID, []int64{circleID})
	if err != nil {
		return nil, err
	}
	if len(circles) == 0 {
		return nil, pgx.ErrNoRows
	}
	return circles[0], nil
}

func (s *Server) buildCircles(ctx context.Context, viewerID int64, circleIDs []int64) ([]map[string]any, error) {
	if len(circleIDs) == 0 {
		return []map[string]any{}, nil
	}

	coresByID, err := s.fetchCircleCores(ctx, viewerID, circleIDs)
	if err != nil {
		return nil, err
	}

	circles := make([]map[string]any, 0, len(circleIDs))
	for _, circleID := range circleIDs {
		core, ok := coresByID[circleID]
		if !ok {
			continue
		}
		circles = append(circles, s.composeCirclePayload(core))
	}
	return circles, nil
}

func (s *Server) fetchCircleCores(ctx context.Context, viewerID int64, circleIDs []int64) (map[int64]circleCore, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			c.id,
			c.user_id,
			c.plate_id,
			c.circle_name,
			c.circle_introduce,
			c.head_portrait,
			c.background_maps,
			COALESCE(post_stats.post_count, 0),
			COALESCE(follow_stats.follow_count, 0),
			(viewer_follow.user_id IS NOT NULL)
		FROM circles c
		LEFT JOIN (
			SELECT circle_id, COUNT(*) AS post_count
			FROM posts
			WHERE circle_id = ANY($1) AND is_deleted = FALSE AND audit_status = 1
			GROUP BY circle_id
		) post_stats ON post_stats.circle_id = c.id
		LEFT JOIN (
			SELECT circle_id, COUNT(*) AS follow_count
			FROM circle_follows
			WHERE circle_id = ANY($1)
			GROUP BY circle_id
		) follow_stats ON follow_stats.circle_id = c.id
		LEFT JOIN circle_follows viewer_follow ON viewer_follow.circle_id = c.id AND viewer_follow.user_id = $2
		WHERE c.id = ANY($1)
	`, circleIDs, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cores := make(map[int64]circleCore, len(circleIDs))
	for rows.Next() {
		var core circleCore
		if err := rows.Scan(
			&core.ID,
			&core.UserID,
			&core.PlateID,
			&core.Name,
			&core.Introduce,
			&core.Head,
			&core.Background,
			&core.PostCount,
			&core.FollowCount,
			&core.IsFollow,
		); err != nil {
			return nil, err
		}
		cores[core.ID] = core
	}
	return cores, rows.Err()
}

func (s *Server) composeCirclePayload(core circleCore) map[string]any {
	return map[string]any{
		"id":                  core.ID,
		"user_id":             core.UserID,
		"plate_id":            core.PlateID,
		"circle_name":         core.Name,
		"circle_introduce":    pickString(core.Introduce, "这个圈子还没有简介。"),
		"head_portrait":       pickString(core.Head, s.assetURL("illustrations/circles-rafiki.png")),
		"background_maps":     pickString(core.Background, s.assetURL("illustrations/circles-rafiki.png")),
		"circle_posts_count":  core.PostCount,
		"circle_follow_count": core.FollowCount,
		"posts_count":         core.PostCount,
		"user_circle_count":   core.FollowCount,
		"is_follow_circle":    core.IsFollow,
	}
}

func (s *Server) fetchCircleUsers(ctx context.Context, circleID int64) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		WITH owner AS (
			SELECT u.id, u.user_name, u.user_avatar, 0 AS sort_order
			FROM circles c
			JOIN users u ON u.id = c.user_id
			WHERE c.id = $1
		),
		followers AS (
			SELECT u.id, u.user_name, u.user_avatar, 1 AS sort_order
			FROM circle_follows cf
			JOIN users u ON u.id = cf.user_id
			WHERE cf.circle_id = $1
		)
		SELECT DISTINCT ON (id) id, user_name, user_avatar
		FROM (
			SELECT * FROM owner
			UNION ALL
			SELECT * FROM followers
		) t
		ORDER BY id, sort_order ASC
		LIMIT 20
	`, circleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []map[string]any
	for rows.Next() {
		var (
			id     int64
			name   string
			avatar sql.NullString
		)
		if err := rows.Scan(&id, &name, &avatar); err != nil {
			return nil, err
		}
		users = append(users, map[string]any{
			"id":          id,
			"user_name":   name,
			"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
		})
	}
	return users, rows.Err()
}

func (s *Server) fetchPlates(ctx context.Context) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `SELECT id, plate_name FROM plates ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plates []map[string]any
	for rows.Next() {
		var (
			id   int64
			name string
		)
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		plates = append(plates, map[string]any{
			"id":         id,
			"plate_id":   id,
			"plate_name": name,
		})
	}
	return plates, rows.Err()
}

func (s *Server) fetchUserPlates(ctx context.Context, userID int64) ([]map[string]any, error) {
	if userID == 0 {
		rows, err := s.db.Query(ctx, `SELECT id, plate_name FROM plates ORDER BY sort_order ASC, id ASC LIMIT 4`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var plates []map[string]any
		for rows.Next() {
			var (
				id   int64
				name string
			)
			if err := rows.Scan(&id, &name); err != nil {
				return nil, err
			}
			plates = append(plates, map[string]any{
				"id":         id,
				"plate_id":   id,
				"plate_name": name,
			})
		}
		return plates, rows.Err()
	}

	rows, err := s.db.Query(ctx, `
		SELECT up.id, p.id, p.plate_name
		FROM user_plates up
		JOIN plates p ON p.id = up.plate_id
		WHERE up.user_id = $1
		ORDER BY up.id ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plates []map[string]any
	for rows.Next() {
		var (
			id      int64
			plateID int64
			name    string
		)
		if err := rows.Scan(&id, &plateID, &name); err != nil {
			return nil, err
		}
		plates = append(plates, map[string]any{
			"id":         id,
			"plate_id":   plateID,
			"plate_name": name,
		})
	}
	return plates, rows.Err()
}

func (s *Server) fetchTags(ctx context.Context, limit int) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `SELECT id, tags_name FROM tags ORDER BY hot_score DESC, id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []map[string]any
	for rows.Next() {
		var (
			id   int64
			name string
		)
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		tags = append(tags, map[string]any{
			"id":        id,
			"tags_name": name,
		})
	}
	return tags, rows.Err()
}

func (s *Server) exists(ctx context.Context, query string, args ...any) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS(`+query+`)`, args...).Scan(&exists)
	return exists, err
}

func errorsIsNoRows(err error) bool {
	return err == pgx.ErrNoRows
}

func pickString(value sql.NullString, fallback string) string {
	if value.Valid && strings.TrimSpace(value.String) != "" {
		return value.String
	}
	return fallback
}

func nullableString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func nullInt64(value sql.NullInt64) int64 {
	if value.Valid {
		return value.Int64
	}
	return 0
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func stripHTML(input string) string {
	replacer := strings.NewReplacer(
		"<br>", "\n",
		"<br/>", "\n",
		"<br />", "\n",
		"&nbsp;", " ",
	)
	input = replacer.Replace(input)
	for {
		start := strings.IndexByte(input, '<')
		if start == -1 {
			break
		}
		end := strings.IndexByte(input[start:], '>')
		if end == -1 {
			break
		}
		input = input[:start] + input[start+end+1:]
	}
	return strings.TrimSpace(input)
}

func buildImageList(url string) []map[string]any {
	if strings.TrimSpace(url) == "" {
		return []map[string]any{}
	}
	return []map[string]any{{"img_url": url}}
}

func parseTagIDs(payload json.RawMessage) []int64 {
	type tagObject struct {
		ID int64 `json:"id"`
	}
	var objects []tagObject
	if err := json.Unmarshal(payload, &objects); err == nil {
		ids := make([]int64, 0, len(objects))
		for _, item := range objects {
			if item.ID > 0 {
				ids = append(ids, item.ID)
			}
		}
		return dedupeInt64(ids)
	}

	var ints []int64
	if err := json.Unmarshal(payload, &ints); err == nil {
		return dedupeInt64(ints)
	}
	return nil
}

func parseImageURLs(payload json.RawMessage) []string {
	type imageObject struct {
		URL string `json:"url"`
	}
	var objects []imageObject
	if err := json.Unmarshal(payload, &objects); err == nil {
		urls := make([]string, 0, len(objects))
		for _, item := range objects {
			if url := normalizeText(item.URL); url != "" {
				urls = append(urls, url)
			}
		}
		return urls
	}
	return nil
}

func dedupeInt64(values []int64) []int64 {
	seen := make(map[int64]struct{}, len(values))
	result := make([]int64, 0, len(values))
	for _, value := range values {
		if value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func (s *Server) ensureLocalQR(postID int64) (string, error) {
	filename := fmt.Sprintf("qrcode-post-%d.png", postID)
	fullPath := s.localUploadPath(filename)
	if _, err := os.Stat(fullPath); err == nil {
		return s.uploadURL(filename), nil
	}
	return "", os.ErrNotExist
}

func (s *Server) refreshPostCounters(ctx context.Context, postID int64) error {
	_, err := s.db.Exec(ctx, `
		UPDATE posts
		SET
			like_count_cache = COALESCE((SELECT COUNT(*) FROM post_likes WHERE post_id = $1), 0),
			comment_count_cache = COALESCE((SELECT COUNT(*) FROM comments WHERE post_id = $1 AND comment_id IS NULL AND is_deleted = FALSE AND audit_status = 1), 0),
			reward_count_cache = COALESCE((SELECT COUNT(*) FROM post_rewards WHERE post_id = $1), 0),
			updated_at = NOW()
		WHERE id = $1
	`, postID)
	return err
}
