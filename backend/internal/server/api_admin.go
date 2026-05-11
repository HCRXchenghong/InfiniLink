package server

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const adminPageSize = 20

type adminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type adminActionRequest struct {
	Action         string `json:"action"`
	Reason         string `json:"reason"`
	DurationHours  int    `json:"duration_hours"`
	MembershipTier string `json:"membership_tier"`
}

func (s *Server) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	var payload adminLoginRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "登录参数不正确")
		return
	}

	if strings.TrimSpace(payload.Username) != strings.TrimSpace(s.cfg.AdminUsername) || payload.Password != s.cfg.AdminPassword {
		s.respondError(w, http.StatusUnauthorized, "账号或密码错误")
		return
	}

	token, err := s.signAdminToken(strings.TrimSpace(payload.Username))
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "签发管理员令牌失败")
		return
	}

	s.respond(w, map[string]any{
		"token":      token,
		"username":   strings.TrimSpace(payload.Username),
		"expires_in": int64(s.cfg.AdminTokenTTL.Seconds()),
	}, "登录成功")
}

func (s *Server) handleAdminDashboard(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	onlineUsers, _ := s.fetchRealtimeOnlineCount(ctx)
	auditQueue, _ := s.fetchAuditQueueCount(ctx)

	var (
		totalUsers       int64
		totalPosts       int64
		totalCircles     int64
		totalOrders      int64
		paidOrders       int64
		totalFeedbacks   int64
		totalWithdrawals int64
		totalRevenue     float64
	)
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM users), 0),
			COALESCE((SELECT COUNT(*) FROM posts WHERE is_deleted = FALSE), 0),
			COALESCE((SELECT COUNT(*) FROM circles), 0),
			COALESCE((SELECT COUNT(*) FROM orders), 0),
			COALESCE((SELECT COUNT(*) FROM orders WHERE status = 'paid'), 0),
			COALESCE((SELECT COUNT(*) FROM feedbacks), 0),
			COALESCE((SELECT COUNT(*) FROM withdrawals), 0),
			COALESCE((SELECT SUM(order_pay_price) FROM orders WHERE status = 'paid'), 0)
	`).Scan(&totalUsers, &totalPosts, &totalCircles, &totalOrders, &paidOrders, &totalFeedbacks, &totalWithdrawals, &totalRevenue)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载后台总览失败")
		return
	}

	dbStats := s.db.Stat()
	redisStats := map[string]any{}
	redisHitRate := 0.0
	if s.redis != nil {
		poolStats := s.redis.PoolStats()
		totalCacheOps := poolStats.Hits + poolStats.Misses
		if totalCacheOps > 0 {
			redisHitRate = float64(poolStats.Hits) * 100 / float64(totalCacheOps)
		}
		redisStats = map[string]any{
			"hits":        poolStats.Hits,
			"misses":      poolStats.Misses,
			"timeouts":    poolStats.Timeouts,
			"total_conns": poolStats.TotalConns,
			"idle_conns":  poolStats.IdleConns,
		}
	}

	s.respond(w, map[string]any{
		"hero": map[string]any{
			"title":        "InfiniLink 管理控制台",
			"subtitle":     "按高并发目标设计的社区运营后台",
			"illustration": s.assetURL("illustrations/astronaut-rafiki.png"),
		},
		"metrics": []map[string]any{
			{"title": "实时在线人数", "value": onlineUsers, "status": "success", "tip": "来自 WebSocket 在线心跳"},
			{"title": "帖子总量", "value": totalPosts, "status": "info", "tip": "当前可见社区内容"},
			{"title": "Redis 命中率", "value": fmt.Sprintf("%.1f%%", redisHitRate), "status": "success", "tip": "应用缓存命中"},
			{"title": "数据库连接", "value": dbStats.TotalConns(), "status": "warning", "tip": fmt.Sprintf("已获取 %d / 空闲 %d", dbStats.AcquiredConns(), dbStats.IdleConns())},
			{"title": "审核积压", "value": auditQueue, "status": "danger", "tip": "待审核内容与认证"},
			{"title": "支付订单", "value": paidOrders, "status": "success", "tip": fmt.Sprintf("总订单 %d", totalOrders)},
		},
		"business": map[string]any{
			"total_users":       totalUsers,
			"total_posts":       totalPosts,
			"total_circles":     totalCircles,
			"total_feedbacks":   totalFeedbacks,
			"total_withdrawals": totalWithdrawals,
			"paid_revenue":      roundMoney(totalRevenue),
		},
		"devops": map[string]any{
			"db_total_conns":    dbStats.TotalConns(),
			"db_acquired_conns": dbStats.AcquiredConns(),
			"db_idle_conns":     dbStats.IdleConns(),
			"redis":             redisStats,
		},
	}, "ok")
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	page := parsePage(r)
	pageSize := parseInt(r.URL.Query().Get("page_size"), adminPageSize)
	if pageSize <= 0 || pageSize > 100 {
		pageSize = adminPageSize
	}

	keyword := normalizeText(r.URL.Query().Get("keyword"))
	status := normalizeText(strings.ToLower(r.URL.Query().Get("status")))
	vip := normalizeText(strings.ToLower(r.URL.Query().Get("vip")))

	where := []string{"1=1"}
	args := []any{}

	if keyword != "" {
		args = append(args, "%"+keyword+"%")
		where = append(where, fmt.Sprintf("(u.user_name ILIKE $%d OR u.external_key ILIKE $%d)", len(args), len(args)))
	}
	switch status {
	case "active":
		where = append(where, "(COALESCE(u.account_status, 'active') = 'active' AND (u.muted_until IS NULL OR u.muted_until <= NOW()))")
	case "muted":
		where = append(where, "(COALESCE(u.account_status, 'active') = 'active' AND u.muted_until IS NOT NULL AND u.muted_until > NOW())")
	case "banned":
		where = append(where, "COALESCE(u.account_status, 'active') = 'banned'")
	}
	switch vip {
	case "true", "vip", "member":
		where = append(where, "(u.is_member = TRUE AND (u.membership_expires_at IS NULL OR u.membership_expires_at > NOW()))")
	case "pro":
		where = append(where, "(u.is_member = TRUE AND (u.membership_expires_at IS NULL OR u.membership_expires_at > NOW()) AND COALESCE(NULLIF(u.membership_tier, ''), 'pro') = 'pro')")
	case "max":
		where = append(where, "(u.is_member = TRUE AND (u.membership_expires_at IS NULL OR u.membership_expires_at > NOW()) AND COALESCE(NULLIF(u.membership_tier, ''), 'pro') = 'max')")
	case "false", "normal":
		where = append(where, "(u.is_member = FALSE OR (u.membership_expires_at IS NOT NULL AND u.membership_expires_at <= NOW()))")
	}

	args = append(args, pageSize, offset(page, pageSize))
	query := fmt.Sprintf(`
		SELECT
			u.id,
			u.user_name,
			u.user_avatar,
			u.external_key,
			u.is_member,
			COALESCE(u.membership_tier, ''),
			u.membership_expires_at,
			COALESCE(u.level_no, 1),
			COALESCE(u.level_score, 0),
			COALESCE(u.account_status, 'active'),
			COALESCE(u.admin_note, ''),
			u.muted_until,
			u.banned_at,
			u.created_at,
			u.last_login_at,
			COALESCE((SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.is_deleted = FALSE), 0),
			COALESCE((SELECT COUNT(*) FROM user_follows uf WHERE uf.target_user_id = u.id), 0),
			COUNT(*) OVER()
		FROM users u
		WHERE %s
		ORDER BY u.created_at DESC
		LIMIT $%d OFFSET $%d
	`, strings.Join(where, " AND "), len(args)-1, len(args))

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	growth := s.growthRulesOrDefault(ctx)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载用户列表失败")
		return
	}
	defer rows.Close()

	var (
		items []map[string]any
		total int64
	)
	for rows.Next() {
		var (
			id           int64
			name         string
			avatar       sql.NullString
			externalKey  string
			isVIP        bool
			memberTier   string
			memberExpiry sql.NullTime
			levelNo      int64
			levelScore   int64
			account      string
			adminNote    string
			mutedUntil   sql.NullTime
			bannedAt     sql.NullTime
			createdAt    time.Time
			lastLoginAt  sql.NullTime
			postCount    int64
			fansCount    int64
			count        int64
		)
		if err := rows.Scan(&id, &name, &avatar, &externalKey, &isVIP, &memberTier, &memberExpiry, &levelNo, &levelScore, &account, &adminNote, &mutedUntil, &bannedAt, &createdAt, &lastLoginAt, &postCount, &fansCount, &count); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取用户列表失败")
			return
		}
		total = count
		membership := resolveMembershipState(isVIP, memberTier, memberExpiry, time.Now())
		level := buildLevelPayload(growth, levelScore)
		items = append(items, map[string]any{
			"id":                     id,
			"nickname":               name,
			"avatar":                 pickString(avatar, s.assetURL("avatar-default.svg")),
			"phone":                  externalKey,
			"status":                 s.resolveUserStatus(account, mutedUntil),
			"is_vip":                 membership.Active,
			"membership_active":      boolToInt(membership.Active),
			"membership_tier":        membership.Tier,
			"membership_expires_at":  nullableTime(membership.ExpiresAt),
			"membership_expire_text": buildMembershipPayload(membership, time.Now())["membership_expire_text"],
			"reg_date":               formatListDatetime(createdAt),
			"last_login":             nullableTime(lastLoginAt),
			"posts":                  postCount,
			"fans":                   fansCount,
			"level_no":               level["level_no"],
			"level_label":            level["level_label"],
			"level_score":            level["level_score"],
			"muted_until":            nullableTime(mutedUntil),
			"ban_reason":             adminNote,
			"banned_at":              formatListDatetime(nullTime(bannedAt)),
		})
	}

	s.respond(w, s.buildPagination(page, total, items), "ok")
}

func (s *Server) handleAdminUserAction(w http.ResponseWriter, r *http.Request) {
	userID := parseInt64(chi.URLParam(r, "userID"), 0)
	if userID <= 0 {
		s.respondError(w, http.StatusBadRequest, "用户不存在")
		return
	}

	var payload adminActionRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "操作参数不正确")
		return
	}

	action := strings.ToLower(strings.TrimSpace(payload.Action))
	reason := limitString(payload.Reason, 300)
	if action == "" {
		s.respondError(w, http.StatusBadRequest, "操作不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var err error
	switch action {
	case "ban":
		if reason == "" {
			reason = "违反平台规则"
		}
		_, err = s.db.Exec(ctx, `
			UPDATE users
			SET account_status = 'banned', muted_until = NULL, admin_note = $2, banned_at = NOW(), updated_at = NOW()
			WHERE id = $1
		`, userID, reason)
	case "unban":
		_, err = s.db.Exec(ctx, `
			UPDATE users
			SET account_status = 'active', muted_until = NULL, admin_note = $2, banned_at = NULL, updated_at = NOW()
			WHERE id = $1
		`, userID, reason)
	case "mute":
		durationHours := payload.DurationHours
		if durationHours <= 0 {
			durationHours = 168
		}
		_, err = s.db.Exec(ctx, `
			UPDATE users
			SET account_status = 'active', muted_until = NOW() + ($2 || ' hours')::interval, admin_note = $3, updated_at = NOW()
			WHERE id = $1
		`, userID, strconv.Itoa(durationHours), reason)
	case "unmute":
		_, err = s.db.Exec(ctx, `
			UPDATE users
			SET muted_until = NULL, admin_note = $2, updated_at = NOW()
			WHERE id = $1
		`, userID, reason)
	case "grant_vip":
		targetTier := normalizeMembershipTier(payload.MembershipTier)
		if strings.TrimSpace(payload.MembershipTier) != "" && targetTier == "" {
			s.respondError(w, http.StatusBadRequest, "会员档位不正确")
			return
		}
		if targetTier == "" {
			targetTier = membershipTierPro
		}
		durationDays := defaultMembershipDurationDays(targetTier)
		if plans, planErr := s.getMembershipPlans(ctx); planErr == nil {
			if plan, ok := membershipPlanByCode(plans, targetTier); ok {
				durationDays = membershipDurationDays(plan)
			}
		}
		err = s.withGrowthTx(ctx, func(tx pgx.Tx) error {
			if _, err := s.applyMembershipToUserTx(ctx, tx, userID, targetTier, durationDays); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `UPDATE users SET admin_note = $2, updated_at = NOW() WHERE id = $1`, userID, reason)
			return err
		})
	case "revoke_vip":
		err = s.withGrowthTx(ctx, func(tx pgx.Tx) error {
			if err := s.clearMembershipForUserTx(ctx, tx, userID); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `UPDATE users SET admin_note = $2, updated_at = NOW() WHERE id = $1`, userID, reason)
			return err
		})
	default:
		s.respondError(w, http.StatusBadRequest, "暂不支持该操作")
		return
	}
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "执行用户操作失败")
		return
	}

	s.clearUserAccessCache(ctx, userID)
	switch action {
	case "ban":
		state, _ := s.loadAccountAccessState(ctx, userID)
		s.createSystemNotification(ctx, userID, "账号已被封禁", buildNotificationHTML("您的账号已被封禁，请联系平台管理员处理。", firstNonEmpty(reason, state.BanReason)), 0)
		s.publishRealtimeEvent(ctx, "session.force_logout", []int64{userID}, nil, s.banResponseData(state))
	case "unban":
		s.createSystemNotification(ctx, userID, "账号已解除封禁", buildNotificationHTML("您的账号已解除封禁，现在可以重新登录使用。", firstNonEmpty(reason, "后台已解除限制")), 0)
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handleAdminAuthentications(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT
			ua.id,
			ua.user_id,
			u.user_name,
			u.user_avatar,
			ua.name,
			ua.contact_information,
			ua.introduce,
			ua.identity_picture,
			ua.authentication_state,
			ua.overrule_content,
			ua.updated_at
		FROM user_authentications ua
		JOIN users u ON u.id = ua.user_id
		ORDER BY ua.updated_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载认证审核失败")
		return
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var (
			id        int64
			userID    int64
			userName  string
			avatar    sql.NullString
			name      string
			contact   string
			intro     string
			picture   string
			state     int
			overrule  string
			updatedAt time.Time
		)
		if err := rows.Scan(&id, &userID, &userName, &avatar, &name, &contact, &intro, &picture, &state, &overrule, &updatedAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取认证审核失败")
			return
		}
		items = append(items, map[string]any{
			"id":                   id,
			"user_id":              userID,
			"user_name":            userName,
			"user_avatar":          pickString(avatar, s.assetURL("avatar-default.svg")),
			"name":                 name,
			"contact_information":  contact,
			"introduce":            intro,
			"identity_picture":     picture,
			"authentication_state": state,
			"overrule_content":     overrule,
			"updated_at":           formatListDatetime(updatedAt),
		})
	}
	s.respond(w, items, "ok")
}

func (s *Server) handleAdminAuthenticationAction(w http.ResponseWriter, r *http.Request) {
	authID := parseInt64(chi.URLParam(r, "authID"), 0)
	if authID <= 0 {
		s.respondError(w, http.StatusBadRequest, "认证记录不存在")
		return
	}

	var payload adminActionRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "操作参数不正确")
		return
	}

	action := strings.ToLower(strings.TrimSpace(payload.Action))
	reason := limitString(payload.Reason, 300)
	if action == "" {
		s.respondError(w, http.StatusBadRequest, "操作不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var userID int64
	if err := s.db.QueryRow(ctx, `SELECT user_id FROM user_authentications WHERE id = $1`, authID).Scan(&userID); err != nil {
		s.respondError(w, http.StatusNotFound, "认证记录不存在")
		return
	}

	switch action {
	case "approve":
		if _, err := s.db.Exec(ctx, `
			UPDATE user_authentications
			SET authentication_state = 1, overrule_content = '', updated_at = NOW()
			WHERE id = $1
		`, authID); err != nil {
			s.respondError(w, http.StatusInternalServerError, "更新认证状态失败")
			return
		}
		_, _ = s.db.Exec(ctx, `UPDATE users SET is_authentication = TRUE, updated_at = NOW() WHERE id = $1`, userID)
	case "reject":
		if reason == "" {
			reason = "认证资料不符合平台要求"
		}
		if _, err := s.db.Exec(ctx, `
			UPDATE user_authentications
			SET authentication_state = 2, overrule_content = $2, updated_at = NOW()
			WHERE id = $1
		`, authID, reason); err != nil {
			s.respondError(w, http.StatusInternalServerError, "更新认证状态失败")
			return
		}
		_, _ = s.db.Exec(ctx, `UPDATE users SET is_authentication = FALSE, updated_at = NOW() WHERE id = $1`, userID)
	default:
		s.respondError(w, http.StatusBadRequest, "暂不支持该操作")
		return
	}

	s.cacheDelete(ctx, userCacheKey(userID))
	s.respond(w, true, "操作成功")
}

func (s *Server) handleAdminPosts(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT
			p.id,
			u.user_name,
			c.circle_name,
			p.posts_content,
			p.audit_status,
			p.reject_msg,
			p.is_deleted,
			p.like_count_cache,
			p.comment_count_cache,
			p.reward_count_cache,
			p.created_at
		FROM posts p
		JOIN users u ON u.id = p.user_id
		LEFT JOIN circles c ON c.id = p.circle_id
		ORDER BY p.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载内容列表失败")
		return
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var (
			id           int64
			userName     string
			circleName   sql.NullString
			content      string
			auditStatus  int
			rejectMsg    string
			isDeleted    bool
			likeCount    int64
			commentCount int64
			rewardCount  int64
			createdAt    time.Time
		)
		if err := rows.Scan(&id, &userName, &circleName, &content, &auditStatus, &rejectMsg, &isDeleted, &likeCount, &commentCount, &rewardCount, &createdAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取内容列表失败")
			return
		}
		items = append(items, map[string]any{
			"id":            id,
			"user_name":     userName,
			"circle_name":   pickString(circleName, "默认圈子"),
			"posts_content": stripHTML(content),
			"audit_status":  auditStatus,
			"reject_msg":    rejectMsg,
			"is_deleted":    isDeleted,
			"like_count":    likeCount,
			"comment_count": commentCount,
			"reward_count":  rewardCount,
			"created_at":    formatListDatetime(createdAt),
		})
	}
	s.respond(w, items, "ok")
}

func (s *Server) handleAdminPostAction(w http.ResponseWriter, r *http.Request) {
	postID := parseInt64(chi.URLParam(r, "postID"), 0)
	if postID <= 0 {
		s.respondError(w, http.StatusBadRequest, "帖子不存在")
		return
	}

	var payload adminActionRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "操作参数不正确")
		return
	}

	action := strings.ToLower(strings.TrimSpace(payload.Action))
	reason := limitString(payload.Reason, 300)
	if action == "" {
		s.respondError(w, http.StatusBadRequest, "操作不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var err error
	switch action {
	case "approve":
		_, err = s.db.Exec(ctx, `
			UPDATE posts
			SET audit_status = 1, reject_msg = '', is_deleted = FALSE, updated_at = NOW()
			WHERE id = $1
		`, postID)
	case "reject":
		if reason == "" {
			reason = "内容不符合平台规范"
		}
		_, err = s.db.Exec(ctx, `
			UPDATE posts
			SET audit_status = 2, reject_msg = $2, updated_at = NOW()
			WHERE id = $1
		`, postID, reason)
	case "hide":
		if reason == "" {
			reason = "后台运营下架"
		}
		_, err = s.db.Exec(ctx, `
			UPDATE posts
			SET is_deleted = TRUE, reject_msg = $2, updated_at = NOW()
			WHERE id = $1
		`, postID, reason)
	case "restore":
		_, err = s.db.Exec(ctx, `
			UPDATE posts
			SET is_deleted = FALSE, audit_status = 1, reject_msg = '', updated_at = NOW()
			WHERE id = $1
		`, postID)
	default:
		s.respondError(w, http.StatusBadRequest, "暂不支持该操作")
		return
	}
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "更新帖子状态失败")
		return
	}

	_ = s.refreshPostCounters(ctx, postID)
	switch action {
	case "reject":
		s.notifyUserByPostID(ctx, postID, "动态已被驳回", "您发布的信息存在违规，已为您下架处理。", reason)
	case "hide":
		s.notifyUserByPostID(ctx, postID, "动态已被下架", "您发布的信息存在违规，已为您下架处理。", reason)
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handleAdminCircles(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT
			c.id,
			c.circle_name,
			c.circle_introduce,
			c.audit_status,
			c.reject_msg,
			u.user_name,
			COALESCE((SELECT COUNT(*) FROM posts p WHERE p.circle_id = c.id AND p.is_deleted = FALSE AND p.audit_status = 1), 0),
			COALESCE((SELECT COUNT(*) FROM circle_follows cf WHERE cf.circle_id = c.id), 0),
			c.created_at
		FROM circles c
		JOIN users u ON u.id = c.user_id
		ORDER BY c.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载圈子列表失败")
		return
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var (
			id          int64
			name        string
			introduce   sql.NullString
			auditStatus int
			rejectMsg   string
			userName    string
			postCount   int64
			followCount int64
			createdAt   time.Time
		)
		if err := rows.Scan(&id, &name, &introduce, &auditStatus, &rejectMsg, &userName, &postCount, &followCount, &createdAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取圈子列表失败")
			return
		}
		items = append(items, map[string]any{
			"id":           id,
			"circle_name":  name,
			"introduce":    nullableString(introduce),
			"audit_status": auditStatus,
			"reject_msg":   rejectMsg,
			"owner":        userName,
			"posts_count":  postCount,
			"follow_count": followCount,
			"created_at":   formatListDatetime(createdAt),
		})
	}
	s.respond(w, items, "ok")
}

func (s *Server) handleAdminCircleAction(w http.ResponseWriter, r *http.Request) {
	circleID := parseInt64(chi.URLParam(r, "circleID"), 0)
	if circleID <= 0 {
		s.respondError(w, http.StatusBadRequest, "圈子不存在")
		return
	}

	var payload adminActionRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "操作参数不正确")
		return
	}

	action := strings.ToLower(strings.TrimSpace(payload.Action))
	reason := limitString(payload.Reason, 300)
	if action == "" {
		s.respondError(w, http.StatusBadRequest, "操作不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var err error
	switch action {
	case "approve", "restore":
		_, err = s.db.Exec(ctx, `
			UPDATE circles
			SET audit_status = 1, reject_msg = '', updated_at = NOW()
			WHERE id = $1
		`, circleID)
	case "reject", "hide":
		if reason == "" {
			reason = "圈子不符合平台规范"
		}
		_, err = s.db.Exec(ctx, `
			UPDATE circles
			SET audit_status = 2, reject_msg = $2, updated_at = NOW()
			WHERE id = $1
		`, circleID, reason)
	default:
		s.respondError(w, http.StatusBadRequest, "暂不支持该操作")
		return
	}
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "更新圈子状态失败")
		return
	}

	if action == "reject" || action == "hide" {
		s.notifyUserByCircleID(ctx, circleID, "圈子已被下架处理", "您发布的信息存在违规，已为您下架处理。", reason)
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handleAdminFeedbacks(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT
			f.id,
			u.user_name,
			f.feedback_type,
			f.feedback_content,
			COALESCE(f.process_status, 'open'),
			COALESCE(f.admin_reply, ''),
			f.created_at,
			f.processed_at
		FROM feedbacks f
		JOIN users u ON u.id = f.user_id
		ORDER BY f.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载反馈工单失败")
		return
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var (
			id          int64
			userName    string
			typ         int
			content     string
			process     string
			adminReply  string
			createdAt   time.Time
			processedAt sql.NullTime
		)
		if err := rows.Scan(&id, &userName, &typ, &content, &process, &adminReply, &createdAt, &processedAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取反馈工单失败")
			return
		}
		items = append(items, map[string]any{
			"id":               id,
			"user_name":        userName,
			"feedback_type":    typ,
			"feedback_content": content,
			"process_status":   process,
			"admin_reply":      adminReply,
			"created_at":       formatListDatetime(createdAt),
			"processed_at":     nullableTime(processedAt),
		})
	}
	s.respond(w, items, "ok")
}

func (s *Server) handleAdminFeedbackAction(w http.ResponseWriter, r *http.Request) {
	feedbackID := parseInt64(chi.URLParam(r, "feedbackID"), 0)
	if feedbackID <= 0 {
		s.respondError(w, http.StatusBadRequest, "工单不存在")
		return
	}

	var payload adminActionRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "操作参数不正确")
		return
	}

	action := strings.ToLower(strings.TrimSpace(payload.Action))
	reason := limitString(payload.Reason, 500)
	if action == "" {
		s.respondError(w, http.StatusBadRequest, "操作不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var err error
	switch action {
	case "processing":
		_, err = s.db.Exec(ctx, `
			UPDATE feedbacks
			SET process_status = 'processing', admin_reply = $2, processed_at = NULL
			WHERE id = $1
		`, feedbackID, reason)
	case "resolve":
		if reason == "" {
			reason = "后台已处理完成"
		}
		_, err = s.db.Exec(ctx, `
			UPDATE feedbacks
			SET process_status = 'resolved', admin_reply = $2, processed_at = NOW()
			WHERE id = $1
		`, feedbackID, reason)
	case "reopen":
		_, err = s.db.Exec(ctx, `
			UPDATE feedbacks
			SET process_status = 'open', admin_reply = $2, processed_at = NULL
			WHERE id = $1
		`, feedbackID, reason)
	default:
		s.respondError(w, http.StatusBadRequest, "暂不支持该操作")
		return
	}
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "更新工单状态失败")
		return
	}

	s.respond(w, true, "操作成功")
}

func (s *Server) handleAdminOrders(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT o.id, o.order_number, u.user_name, o.order_type, o.order_pay_price, o.status, o.provider, o.created_at, o.paid_at
		FROM orders o
		JOIN users u ON u.id = o.user_id
		ORDER BY o.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载订单列表失败")
		return
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var (
			id        int64
			number    string
			userName  string
			orderType int
			price     float64
			status    string
			provider  string
			createdAt time.Time
			paidAt    sql.NullTime
		)
		if err := rows.Scan(&id, &number, &userName, &orderType, &price, &status, &provider, &createdAt, &paidAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取订单列表失败")
			return
		}
		items = append(items, map[string]any{
			"id":              id,
			"order_number":    number,
			"user_name":       userName,
			"order_type":      orderType,
			"order_pay_price": price,
			"status":          status,
			"provider":        provider,
			"created_at":      formatListDatetime(createdAt),
			"paid_at":         nullableTime(paidAt),
		})
	}
	s.respond(w, items, "ok")
}

func (s *Server) handleAdminRevenue(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	var (
		totalPaid      float64
		rewardPaid     float64
		withdrawAmount float64
		withdrawCount  int64
	)
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT SUM(order_pay_price) FROM orders WHERE status = 'paid'), 0),
			COALESCE((SELECT SUM(exceptional_price) FROM post_rewards), 0),
			COALESCE((SELECT SUM(price) FROM withdrawals), 0),
			COALESCE((SELECT COUNT(*) FROM withdrawals), 0)
	`).Scan(&totalPaid, &rewardPaid, &withdrawAmount, &withdrawCount)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载收益数据失败")
		return
	}

	rows, err := s.db.Query(ctx, `
		SELECT w.id, u.user_name, w.price, w.bank_name, w.bank_card, w.status_value, w.created_at, w.account_at
		FROM withdrawals w
		JOIN users u ON u.id = w.user_id
		ORDER BY w.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载提现列表失败")
		return
	}
	defer rows.Close()

	var withdrawals []map[string]any
	for rows.Next() {
		var (
			id         int64
			userName   string
			price      float64
			bankName   string
			bankCard   string
			statusText string
			createdAt  time.Time
			accountAt  sql.NullTime
		)
		if err := rows.Scan(&id, &userName, &price, &bankName, &bankCard, &statusText, &createdAt, &accountAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取提现列表失败")
			return
		}
		withdrawals = append(withdrawals, map[string]any{
			"id":           id,
			"user_name":    userName,
			"price":        price,
			"bank_name":    bankName,
			"bank_card":    bankCard,
			"status_value": statusText,
			"created_at":   formatListDatetime(createdAt),
			"account_at":   nullableTime(accountAt),
		})
	}

	s.respond(w, map[string]any{
		"summary": map[string]any{
			"total_paid":       roundMoney(totalPaid),
			"reward_paid":      roundMoney(rewardPaid),
			"withdraw_amount":  roundMoney(withdrawAmount),
			"withdraw_count":   withdrawCount,
			"illustration":     s.assetURL("illustrations/savings-cuate.png"),
			"settlement_title": "收益与提现中心",
		},
		"withdrawals": withdrawals,
	}, "ok")
}

func (s *Server) handleAdminMessages(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	keyword := normalizeText(r.URL.Query().Get("keyword"))
	serviceUserID, err := s.getCustomerServiceUserID(ctx)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载客服账号失败")
		return
	}
	serviceProfile, err := s.buildChatUserProfile(ctx, serviceUserID)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载客服资料失败")
		return
	}

	onlineUsers, _ := s.fetchRealtimeOnlineCount(ctx)
	var (
		chatCount       int64
		unreadChatCount int64
		unreadNotice    int64
		threadCount     int64
	)
	err = s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM chat_messages), 0),
			COALESCE((SELECT COUNT(*) FROM chat_messages WHERE is_read = FALSE), 0),
			COALESCE((SELECT COUNT(*) FROM notifications WHERE is_read = FALSE), 0),
			COALESCE((
				SELECT COUNT(DISTINCT CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END)
				FROM chat_messages
				WHERE sender_id = $1 OR receiver_id = $1
			), 0)
	`, serviceUserID).Scan(&chatCount, &unreadChatCount, &unreadNotice, &threadCount)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载消息数据失败")
		return
	}

	rows, err := s.db.Query(ctx, `
		WITH ranked_threads AS (
			SELECT
				CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS partner_id,
				m.chat_content,
				m.chat_image,
				m.created_at,
				ROW_NUMBER() OVER (PARTITION BY CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END ORDER BY m.created_at DESC) AS rn
			FROM chat_messages m
			WHERE m.sender_id = $1 OR m.receiver_id = $1
		)
		SELECT
			partner.id,
			partner.user_name,
			partner.user_avatar,
			partner.external_key,
			thread.chat_content,
			thread.chat_image,
			thread.created_at,
			COALESCE((
				SELECT COUNT(*)
				FROM chat_messages unread
				WHERE unread.sender_id = partner.id
					AND unread.receiver_id = $1
					AND unread.is_read = FALSE
			), 0)
		FROM ranked_threads thread
		JOIN users partner ON partner.id = thread.partner_id
		WHERE thread.rn = 1
			AND ($2 = '' OR partner.user_name ILIKE '%' || $2 || '%' OR partner.external_key ILIKE '%' || $2 || '%')
		ORDER BY thread.created_at DESC
		LIMIT 50
	`, serviceUserID, keyword)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载消息会话失败")
		return
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var (
			partnerID  int64
			name       string
			avatar     sql.NullString
			external   string
			content    sql.NullString
			image      sql.NullString
			createdAt  time.Time
			unreadChat int64
		)
		if err := rows.Scan(&partnerID, &name, &avatar, &external, &content, &image, &createdAt, &unreadChat); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取消息会话失败")
			return
		}
		items = append(items, map[string]any{
			"user_id":      partnerID,
			"user_name":    name,
			"user_avatar":  pickString(avatar, s.assetURL("avatar-default.svg")),
			"account":      external,
			"chat_content": nullableString(content),
			"chat_image":   nullableString(image),
			"created_at":   formatListDatetime(createdAt),
			"unread_count": unreadChat,
		})
	}

	s.respond(w, map[string]any{
		"summary": map[string]any{
			"online_users":        onlineUsers,
			"chat_count":          chatCount,
			"unread_chat_count":   unreadChatCount,
			"unread_notice_count": unreadNotice,
			"thread_count":        threadCount,
			"illustration":        s.assetURL("illustrations/messaging-fun-rafiki.png"),
		},
		"service_user": map[string]any{
			"id":          serviceProfile.ID,
			"user_name":   serviceProfile.Name,
			"user_avatar": serviceProfile.Avatar,
		},
		"threads": items,
	}, "ok")
}

func (s *Server) handleAdminMessageThread(w http.ResponseWriter, r *http.Request) {
	userID := parseInt64(chi.URLParam(r, "userID"), 0)
	if userID <= 0 {
		s.respondError(w, http.StatusBadRequest, "用户不存在")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	serviceUserID, err := s.getCustomerServiceUserID(ctx)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载客服账号失败")
		return
	}
	serviceProfile, err := s.buildChatUserProfile(ctx, serviceUserID)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载客服资料失败")
		return
	}
	userProfile, err := s.buildChatUserProfile(ctx, userID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "聊天用户不存在")
		return
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE chat_messages
		SET is_read = TRUE
		WHERE sender_id = $1 AND receiver_id = $2
	`, userID, serviceUserID)

	rows, err := s.db.Query(ctx, `
		SELECT id, sender_id, receiver_id, chat_content, chat_image, created_at
		FROM (
			SELECT id, sender_id, receiver_id, chat_content, chat_image, created_at
			FROM chat_messages
			WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
			ORDER BY created_at DESC
			LIMIT 300
		) history
		ORDER BY created_at ASC
	`, serviceUserID, userID)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载聊天记录失败")
		return
	}
	defer rows.Close()

	messages := make([]map[string]any, 0, 300)
	for rows.Next() {
		var (
			messageID  int64
			senderID   int64
			receiverID int64
			content    sql.NullString
			image      sql.NullString
			createdAt  time.Time
		)
		if err := rows.Scan(&messageID, &senderID, &receiverID, &content, &image, &createdAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取聊天记录失败")
			return
		}
		profile := userProfile
		if senderID == serviceUserID {
			profile = serviceProfile
		}
		messages = append(messages, buildChatMessagePayload(profile, messageID, receiverID, nullableString(content), nullableString(image), createdAt))
	}

	s.respond(w, map[string]any{
		"user": map[string]any{
			"id":          userProfile.ID,
			"user_name":   userProfile.Name,
			"user_avatar": userProfile.Avatar,
		},
		"service_user": map[string]any{
			"id":          serviceProfile.ID,
			"user_name":   serviceProfile.Name,
			"user_avatar": serviceProfile.Avatar,
		},
		"messages": messages,
	}, "ok")
}

func (s *Server) handleAdminMessageReply(w http.ResponseWriter, r *http.Request) {
	userID := parseInt64(chi.URLParam(r, "userID"), 0)
	if userID <= 0 {
		s.respondError(w, http.StatusBadRequest, "用户不存在")
		return
	}

	var payload struct {
		Content string `json:"content"`
		Image   string `json:"image"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "回复参数不正确")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	serviceUserID, err := s.getCustomerServiceUserID(ctx)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载客服账号失败")
		return
	}

	message, err := s.insertChatMessage(ctx, serviceUserID, userID, payload.Content, payload.Image)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "发送回复失败")
		return
	}

	s.publishChatMessage(ctx, serviceUserID, userID, message)
	s.respond(w, map[string]any{
		"message": message,
	}, "发送成功")
}

func (s *Server) handleAdminRisk(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	words, err := s.getSensitiveWords(ctx)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载风控配置失败")
		return
	}

	rows, err := s.db.Query(ctx, `
		SELECT
			u.id,
			u.user_name,
			u.user_avatar,
			u.external_key,
			COALESCE(u.admin_note, ''),
			u.banned_at,
			u.created_at,
			COALESCE((SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.is_deleted = FALSE), 0)
		FROM users u
		WHERE COALESCE(u.account_status, 'active') = 'banned'
		ORDER BY u.banned_at DESC NULLS LAST, u.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "加载风控用户失败")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var (
			id        int64
			name      string
			avatar    sql.NullString
			external  string
			reason    string
			bannedAt  sql.NullTime
			createdAt time.Time
			postCount int64
		)
		if err := rows.Scan(&id, &name, &avatar, &external, &reason, &bannedAt, &createdAt, &postCount); err != nil {
			s.respondError(w, http.StatusInternalServerError, "读取风控用户失败")
			return
		}
		items = append(items, map[string]any{
			"id":         id,
			"nickname":   name,
			"avatar":     pickString(avatar, s.assetURL("avatar-default.svg")),
			"phone":      external,
			"status":     "banned",
			"ban_reason": reason,
			"banned_at":  formatListDatetime(nullTime(bannedAt)),
			"reg_date":   formatListDatetime(createdAt),
			"posts":      postCount,
		})
	}

	s.respond(w, map[string]any{
		"summary": map[string]any{
			"banned_users":  len(items),
			"keyword_count": len(words),
			"illustration":  s.assetURL("illustrations/people-search-amico.png"),
		},
		"sensitive_words": words,
		"banned_users":    items,
	}, "ok")
}

func (s *Server) handleAdminRiskKeywords(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Words []string `json:"words"`
		Text  string   `json:"text"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "风控词参数不正确")
		return
	}

	words := payload.Words
	if len(words) == 0 && normalizeText(payload.Text) != "" {
		words = strings.FieldsFunc(payload.Text, func(r rune) bool {
			return r == '\n' || r == '\r' || r == ',' || r == '，' || r == ';' || r == '；'
		})
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := s.saveSensitiveWords(ctx, words); err != nil {
		s.respondError(w, http.StatusInternalServerError, "保存风控词失败")
		return
	}

	result, _ := s.getSensitiveWords(ctx)
	s.respond(w, map[string]any{
		"sensitive_words": result,
	}, "保存成功")
}

func (s *Server) handleAdminSystem(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var bannerCount int64
	_ = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM banners`).Scan(&bannerCount)
	growthRules := s.growthRulesOrDefault(ctx)
	operationAds, _ := s.getOperationAds(ctx)
	membershipPlans, _ := s.getMembershipPlans(ctx)

	var proPrice float64
	var maxPrice float64
	proDurationDays := defaultMembershipDurationDays(membershipTierPro)
	maxDurationDays := defaultMembershipDurationDays(membershipTierMax)
	if plan, ok := membershipPlanByCode(membershipPlans, membershipTierPro); ok {
		proPrice = plan.Price
		proDurationDays = membershipDurationDays(plan)
	}
	if plan, ok := membershipPlanByCode(membershipPlans, membershipTierMax); ok {
		maxPrice = plan.Price
		maxDurationDays = membershipDurationDays(plan)
	}

	s.respond(w, map[string]any{
		"app": map[string]any{
			"name":                         s.cfg.AppName,
			"public_base_url":              s.cfg.PublicBaseURL,
			"default_pay":                  s.cfg.DefaultPayMethod,
			"membership_price":             proPrice,
			"membership_price_pro":         proPrice,
			"membership_price_max":         maxPrice,
			"membership_duration_days_pro": proDurationDays,
			"membership_duration_days_max": maxDurationDays,
			"cache_ttl":                    s.cfg.CacheTTL.String(),
			"user_cache_ttl":               s.cfg.UserCacheTTL.String(),
		},
		"assets": map[string]any{
			"login_bg":      s.assetURL("illustrations/outer-space-rafiki.png"),
			"about_logo":    s.assetURL("illustrations/world-rafiki.png"),
			"member_poster": s.assetURL("illustrations/plain-credit-card-cuate.png"),
			"banner_count":  bannerCount,
			"empty_view":    s.assetURL("illustrations/no-data-cuate.png"),
		},
		"membership_plans": membershipPlans,
		"growth_rules":     growthRules,
		"operation_ads":    operationAds,
		"admin_user":       s.currentAdmin(r),
	}, "ok")
}

func (s *Server) handleAdminSystemAds(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Ads []operationAd `json:"ads"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "广告配置参数不正确")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	ads, err := s.saveOperationAds(ctx, payload.Ads)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "保存广告配置失败")
		return
	}

	s.respond(w, map[string]any{
		"operation_ads": ads,
	}, "保存成功")
}

func (s *Server) handleAdminSystemMembership(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Plans []membershipPlan `json:"plans"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "会员配置参数不正确")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	plans, err := s.saveMembershipPlans(ctx, payload.Plans)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "保存会员配置失败")
		return
	}

	s.respond(w, map[string]any{
		"membership_plans": plans,
	}, "保存成功")
}

func (s *Server) handleAdminSystemGrowthRules(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		GrowthRules growthRules `json:"growth_rules"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, http.StatusBadRequest, "等级成长规则参数不正确")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	rules, err := s.saveGrowthRules(ctx, payload.GrowthRules)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "保存等级成长规则失败")
		return
	}

	s.respond(w, map[string]any{
		"growth_rules": rules,
	}, "保存成功")
}

func (s *Server) handleAdminDevops(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	dbStats := s.db.Stat()
	onlineUsers, _ := s.fetchRealtimeOnlineCount(ctx)
	auditQueue, _ := s.fetchAuditQueueCount(ctx)

	redisPayload := map[string]any{
		"enabled": false,
	}
	if s.redis != nil {
		poolStats := s.redis.PoolStats()
		redisPayload = map[string]any{
			"enabled":     true,
			"hits":        poolStats.Hits,
			"misses":      poolStats.Misses,
			"timeouts":    poolStats.Timeouts,
			"total_conns": poolStats.TotalConns,
			"idle_conns":  poolStats.IdleConns,
			"stale_conns": poolStats.StaleConns,
		}
	}

	s.respond(w, map[string]any{
		"db": map[string]any{
			"total_conns":    dbStats.TotalConns(),
			"acquired_conns": dbStats.AcquiredConns(),
			"idle_conns":     dbStats.IdleConns(),
			"max_conns":      s.cfg.DBMaxConns,
			"empty_acquires": dbStats.EmptyAcquireCount(),
		},
		"redis": redisPayload,
		"realtime": map[string]any{
			"online_users":  onlineUsers,
			"presence_key":  "realtime:presence:last_seen",
			"target_online": 50000,
		},
		"queues": []map[string]any{
			{"name": "content_audit_queue", "backlog": auditQueue, "status": severityByCount(auditQueue, 500, 1500)},
			{"name": "notification_queue", "backlog": 0, "status": "success"},
			{"name": "payment_callback_retry", "backlog": 0, "status": "success"},
		},
	}, "ok")
}

func (s *Server) fetchRealtimeOnlineCount(ctx context.Context) (int64, error) {
	if s.redis == nil {
		return 0, nil
	}
	now := time.Now().Add(-90 * time.Second).Unix()
	return s.redis.ZCount(ctx, "realtime:presence:last_seen", strconv.FormatInt(now, 10), "+inf").Result()
}

func (s *Server) fetchAuditQueueCount(ctx context.Context) (int64, error) {
	var count int64
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM posts WHERE audit_status <> 1 AND is_deleted = FALSE), 0) +
			COALESCE((SELECT COUNT(*) FROM comments WHERE audit_status <> 1 AND is_deleted = FALSE), 0) +
			COALESCE((SELECT COUNT(*) FROM circles WHERE audit_status <> 1), 0) +
			COALESCE((SELECT COUNT(*) FROM user_authentications WHERE authentication_state = 0), 0)
	`).Scan(&count)
	return count, err
}

func (s *Server) resolveUserStatus(accountStatus string, mutedUntil sql.NullTime) string {
	if strings.EqualFold(strings.TrimSpace(accountStatus), "banned") {
		return "banned"
	}
	if mutedUntil.Valid && mutedUntil.Time.After(time.Now()) {
		return "muted"
	}
	return "active"
}

func severityByCount(value int64, warn, danger int64) string {
	switch {
	case value >= danger:
		return "danger"
	case value >= warn:
		return "warning"
	default:
		return "success"
	}
}
