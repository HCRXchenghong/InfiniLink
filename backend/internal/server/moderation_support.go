package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const businessCodeBanned = 503004

type accountAccessState struct {
	UserID        int64  `json:"user_id"`
	AccountStatus string `json:"account_status"`
	BanReason     string `json:"ban_reason"`
	BannedAt      string `json:"banned_at,omitempty"`
}

type chatSenderProfile struct {
	ID     int64
	Name   string
	Avatar string
}

func moderationCacheTTL(userTTL time.Duration) time.Duration {
	if userTTL > 0 && userTTL < time.Minute {
		return userTTL
	}
	return time.Minute
}

func appSettingCacheKey(key string) string {
	return cacheKey("settings", key)
}

func accountAccessCacheKey(userID int64) string {
	return cacheKey("user", "access", formatInt64(userID))
}

func normalizeWordList(words []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(words))
	for _, word := range words {
		trimmed := limitString(word, 64)
		if trimmed == "" {
			continue
		}
		normalized := strings.ToLower(trimmed)
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func parseJSONInt64(raw string) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return 0
	}

	var asInt int64
	if err := json.Unmarshal([]byte(raw), &asInt); err == nil {
		return asInt
	}

	var asFloat float64
	if err := json.Unmarshal([]byte(raw), &asFloat); err == nil {
		return int64(asFloat)
	}

	var asString string
	if err := json.Unmarshal([]byte(raw), &asString); err == nil {
		return parseInt64(asString, 0)
	}

	return parseInt64(strings.Trim(raw, `"`), 0)
}

func (s *Server) loadAccountAccessState(ctx context.Context, userID int64) (accountAccessState, error) {
	return cachedJSON(s, ctx, accountAccessCacheKey(userID), moderationCacheTTL(s.cfg.UserCacheTTL), func(ctx context.Context) (accountAccessState, error) {
		var (
			state    accountAccessState
			bannedAt sql.NullTime
		)
		err := s.db.QueryRow(ctx, `
			SELECT
				id,
				COALESCE(account_status, 'active'),
				COALESCE(admin_note, ''),
				banned_at
			FROM users
			WHERE id = $1
		`, userID).Scan(&state.UserID, &state.AccountStatus, &state.BanReason, &bannedAt)
		if err != nil {
			return accountAccessState{}, err
		}
		state.AccountStatus = strings.ToLower(normalizeText(state.AccountStatus))
		state.BanReason = limitString(state.BanReason, 300)
		if bannedAt.Valid {
			state.BannedAt = formatListDatetime(bannedAt.Time)
		}
		return state, nil
	})
}

func (s *Server) clearUserAccessCache(ctx context.Context, userID int64) {
	s.cacheDelete(ctx, accountAccessCacheKey(userID), userCacheKey(userID))
}

func (s *Server) banResponseData(state accountAccessState) map[string]any {
	reason := firstNonEmpty(state.BanReason, "平台管理员已对该账号执行封禁")
	return map[string]any{
		"reason":     reason,
		"ban_reason": reason,
		"banned_at":  state.BannedAt,
	}
}

func (s *Server) respondUserBanned(w http.ResponseWriter, state accountAccessState) {
	s.respondWithCode(w, businessCodeBanned, false, "您已被封禁", s.banResponseData(state))
}

func (s *Server) getSensitiveWords(ctx context.Context) ([]string, error) {
	return cachedJSON(s, ctx, appSettingCacheKey("sensitive_words"), s.cfg.CacheTTL, func(ctx context.Context) ([]string, error) {
		var raw string
		err := s.db.QueryRow(ctx, `
			SELECT setting_value::text
			FROM app_settings
			WHERE setting_key = 'sensitive_words'
		`).Scan(&raw)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return []string{}, nil
			}
			return nil, err
		}

		var words []string
		if strings.TrimSpace(raw) != "" && strings.TrimSpace(raw) != "null" {
			if err := json.Unmarshal([]byte(raw), &words); err != nil {
				return nil, err
			}
		}
		return normalizeWordList(words), nil
	})
}

func (s *Server) saveSensitiveWords(ctx context.Context, words []string) error {
	normalized := normalizeWordList(words)
	raw, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(ctx, `
		INSERT INTO app_settings(setting_key, setting_value, updated_at)
		VALUES ('sensitive_words', $1::jsonb, NOW())
		ON CONFLICT (setting_key) DO UPDATE
		SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
	`, string(raw)); err != nil {
		return err
	}
	s.cacheDelete(ctx, appSettingCacheKey("sensitive_words"))
	return nil
}

func (s *Server) matchSensitiveWords(content string, words []string) []string {
	normalizedContent := strings.ToLower(normalizeText(content))
	if normalizedContent == "" || len(words) == 0 {
		return []string{}
	}

	matched := make([]string, 0, len(words))
	seen := map[string]struct{}{}
	for _, word := range words {
		trimmed := normalizeText(word)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		if strings.Contains(normalizedContent, key) {
			seen[key] = struct{}{}
			matched = append(matched, trimmed)
		}
	}
	return matched
}

func (s *Server) evaluateSensitiveContent(ctx context.Context, segments ...string) ([]string, error) {
	texts := make([]string, 0, len(segments))
	for _, segment := range segments {
		if trimmed := normalizeText(segment); trimmed != "" {
			texts = append(texts, trimmed)
		}
	}
	if len(texts) == 0 {
		return []string{}, nil
	}

	words, err := s.getSensitiveWords(ctx)
	if err != nil {
		return nil, err
	}
	return s.matchSensitiveWords(strings.Join(texts, "\n"), words), nil
}

func buildModerationReason(matched []string) string {
	if len(matched) == 0 {
		return ""
	}
	preview := matched
	if len(preview) > 6 {
		preview = preview[:6]
	}
	reason := fmt.Sprintf("命中违禁词：%s", strings.Join(preview, "、"))
	if len(matched) > len(preview) {
		reason = fmt.Sprintf("%s 等 %d 项", reason, len(matched))
	}
	return reason
}

func (s *Server) getCustomerServiceUserID(ctx context.Context) (int64, error) {
	return cachedJSON(s, ctx, appSettingCacheKey("customer_service_user_id"), s.cfg.CacheTTL, func(ctx context.Context) (int64, error) {
		var raw string
		err := s.db.QueryRow(ctx, `
			SELECT setting_value::text
			FROM app_settings
			WHERE setting_key = 'customer_service_user_id'
		`).Scan(&raw)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}

		userID := parseJSONInt64(raw)
		if userID > 0 {
			return userID, nil
		}

		if err := s.db.QueryRow(ctx, `
			SELECT id
			FROM users
			WHERE is_official = TRUE
			ORDER BY id ASC
			LIMIT 1
		`).Scan(&userID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return 1, nil
			}
			return 0, err
		}
		return userID, nil
	})
}

func (s *Server) buildChatUserProfile(ctx context.Context, userID int64) (chatSenderProfile, error) {
	var (
		profile chatSenderProfile
		avatar  sql.NullString
	)
	err := s.db.QueryRow(ctx, `
		SELECT id, user_name, user_avatar
		FROM users
		WHERE id = $1
	`, userID).Scan(&profile.ID, &profile.Name, &avatar)
	if err != nil {
		return chatSenderProfile{}, err
	}
	profile.Avatar = pickString(avatar, s.assetURL("avatar-default.svg"))
	return profile, nil
}

func buildChatMessagePayload(profile chatSenderProfile, messageID, receiverID int64, content, image string, createdAt time.Time) map[string]any {
	return map[string]any{
		"id":           messageID,
		"sender_id":    profile.ID,
		"receiver_id":  receiverID,
		"object_id":    receiverID,
		"chat_content": content,
		"chat_image":   image,
		"datetime":     formatListDatetime(createdAt),
		"user": map[string]any{
			"id":          profile.ID,
			"user_name":   profile.Name,
			"user_avatar": profile.Avatar,
		},
		"imgList": buildImageList(image),
	}
}

func (s *Server) insertChatMessage(ctx context.Context, senderID, receiverID int64, content, image string) (map[string]any, error) {
	content = limitString(content, 1000)
	image = normalizeText(image)
	if content == "" && image == "" {
		return nil, errors.New("empty message")
	}

	profile, err := s.buildChatUserProfile(ctx, senderID)
	if err != nil {
		return nil, err
	}

	var (
		messageID int64
		createdAt time.Time
	)
	err = s.db.QueryRow(ctx, `
		INSERT INTO chat_messages(sender_id, receiver_id, chat_content, chat_image, is_read, created_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), FALSE, NOW())
		RETURNING id, created_at
	`, senderID, receiverID, content, image).Scan(&messageID, &createdAt)
	if err != nil {
		return nil, err
	}

	return buildChatMessagePayload(profile, messageID, receiverID, content, image, createdAt), nil
}

func (s *Server) publishChatMessage(ctx context.Context, senderID, receiverID int64, message map[string]any) {
	s.publishRealtimeEvent(ctx, "chat.message", []int64{senderID, receiverID}, message, nil)
}

func buildNotificationHTML(primary, reason string) string {
	builder := strings.Builder{}
	builder.WriteString("<p>")
	builder.WriteString(html.EscapeString(firstNonEmpty(primary, "您收到一条新的系统通知。")))
	builder.WriteString("</p>")
	if trimmed := normalizeText(reason); trimmed != "" {
		builder.WriteString("<p>处理原因：")
		builder.WriteString(html.EscapeString(trimmed))
		builder.WriteString("</p>")
	}
	return builder.String()
}

func (s *Server) createSystemNotification(ctx context.Context, userID int64, title, content string, postID int64) {
	if userID <= 0 {
		return
	}
	var postRef any
	if postID > 0 {
		postRef = postID
	}
	_, _ = s.db.Exec(ctx, `
		INSERT INTO notifications(user_id, type, title, content, qh_image, posts_id, is_read)
		VALUES ($1, 1, $2, $3, $4, $5, FALSE)
	`, userID, title, content, s.assetURL("illustrations/messaging-fun-rafiki.png"), postRef)
	s.publishRealtimeEvent(ctx, "notification.refresh", []int64{userID}, nil, map[string]any{
		"scope": "notifications",
		"type":  1,
		"title": title,
	})
}

func (s *Server) notifyUserByPostID(ctx context.Context, postID int64, title, primary, reason string) {
	if postID <= 0 {
		return
	}
	var userID int64
	if err := s.db.QueryRow(ctx, `SELECT user_id FROM posts WHERE id = $1`, postID).Scan(&userID); err != nil {
		return
	}
	s.createSystemNotification(ctx, userID, title, buildNotificationHTML(primary, reason), postID)
}

func (s *Server) notifyUserByCircleID(ctx context.Context, circleID int64, title, primary, reason string) {
	if circleID <= 0 {
		return
	}
	var userID int64
	if err := s.db.QueryRow(ctx, `SELECT user_id FROM circles WHERE id = $1`, circleID).Scan(&userID); err != nil {
		return
	}
	s.createSystemNotification(ctx, userID, title, buildNotificationHTML(primary, reason), 0)
}

func (s *Server) buildCustomerServiceThread(ctx context.Context, viewerID int64) (map[string]any, error) {
	serviceUserID, err := s.getCustomerServiceUserID(ctx)
	if err != nil {
		return nil, err
	}

	profile, err := s.buildChatUserProfile(ctx, serviceUserID)
	if err != nil {
		return nil, err
	}

	var (
		content   sql.NullString
		image     sql.NullString
		createdAt sql.NullTime
		unread    int64
	)
	_ = s.db.QueryRow(ctx, `
		SELECT chat_content, chat_image, created_at
		FROM chat_messages
		WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
		ORDER BY created_at DESC
		LIMIT 1
	`, viewerID, serviceUserID).Scan(&content, &image, &createdAt)

	_ = s.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM chat_messages
		WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE
	`, serviceUserID, viewerID).Scan(&unread)

	return map[string]any{
		"user": map[string]any{
			"id":          profile.ID,
			"user_name":   profile.Name,
			"user_avatar": profile.Avatar,
		},
		"datetime": func() string {
			if createdAt.Valid {
				return formatListDatetime(createdAt.Time)
			}
			return ""
		}(),
		"chat_content":        firstNonEmpty(nullableString(content), "点击进入与官方客服实时对话"),
		"chat_image":          nullableString(image),
		"read_count":          unread,
		"is_customer_service": 1,
		"online_text":         "实时在线",
	}, nil
}
