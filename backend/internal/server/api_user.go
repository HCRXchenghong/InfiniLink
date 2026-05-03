package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var payload loginRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "登录参数不正确")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	userID, err := s.fetchOrCreateUser(ctx, payload)
	if err != nil {
		s.respondError(w, 500, "登录失败，请稍后重试")
		return
	}

	token, err := s.signToken(userID)
	if err != nil {
		s.respondError(w, 500, "签发令牌失败")
		return
	}

	var hasWelcome bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = $1 AND type = 1)`, userID).Scan(&hasWelcome); err == nil && !hasWelcome {
		_, _ = s.db.Exec(ctx, `
			INSERT INTO notifications (user_id, type, title, content, qh_image, is_read)
			VALUES ($1, 1, '欢迎来到 InfiniLink', '<p>后台已经接上啦，接下来就可以把你的内容社区慢慢养起来。</p>', $2, 0)
		`, userID, s.assetURL("official-popup.svg"))
	}

	s.respond(w, map[string]any{
		"token": token,
	}, "登录成功")
}

func (s *Server) handleConfigData(w http.ResponseWriter, r *http.Request) {
	s.respond(w, map[string]any{
		"app_login_bg":                s.assetURL("login-bg.svg"),
		"app_title":                   s.cfg.AppName,
		"app_intro":                   "把喜欢的人、圈子和内容连接起来。",
		"about_logo":                  s.assetURL("about-logo.svg"),
		"about_title":                 "InfiniLink 内容兴趣社区",
		"about_copyright":             "Copyright © InfiniLink",
		"members_poster":              s.assetURL("members-poster.svg"),
		"official_popup_poster":       s.assetURL("official-popup.svg"),
		"authentication_popup_poster": s.assetURL("authentication-popup.svg"),
		"members_popup_poster":        s.assetURL("member-popup.svg"),
	}, "ok")
}

func (s *Server) handleClauseDetail(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	clauseID := parseInt64(r.URL.Query().Get("id"), 21)
	var content string
	err := s.db.QueryRow(ctx, `SELECT content FROM clauses WHERE id = $1`, clauseID).Scan(&content)
	if err != nil {
		content = "<h1>InfiniLink 用户协议</h1><p>欢迎使用 InfiniLink。请遵守当地法律法规与平台规则。</p>"
	}
	s.respond(w, map[string]any{
		"id":      clauseID,
		"content": content,
	}, "ok")
}

func (s *Server) handleUserInfo(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := s.buildSelfUser(ctx, userID)
	if err != nil {
		s.respondError(w, 500, "获取用户信息失败")
		return
	}
	s.respond(w, user, "ok")
}

func (s *Server) handleUpdateUserInfo(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}

	var payload struct {
		UserAvatar         string `json:"user_avatar"`
		UserName           string `json:"user_name"`
		UserIntroduce      string `json:"user_introduce"`
		UserBirthday       string `json:"user_birthday"`
		UserBackgroundMaps string `json:"user_background_maps"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "资料参数不正确")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := s.db.Exec(ctx, `
		UPDATE users
		SET
			user_avatar = COALESCE(NULLIF($2, ''), user_avatar),
			user_name = COALESCE(NULLIF($3, ''), user_name),
			user_introduce = COALESCE(NULLIF($4, ''), user_introduce),
			user_birthday = COALESCE(NULLIF($5, ''), user_birthday),
			user_background_maps = COALESCE(NULLIF($6, ''), user_background_maps),
			updated_at = NOW()
		WHERE id = $1
	`, userID, normalizeText(payload.UserAvatar), limitString(payload.UserName, 24), limitString(payload.UserIntroduce, 200), normalizeText(payload.UserBirthday), normalizeText(payload.UserBackgroundMaps))
	if err != nil {
		s.respondError(w, 500, "更新资料失败")
		return
	}
	s.respond(w, true, "保存成功")
}

func (s *Server) handleToggleFollowUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		PostsUserID int64 `json:"posts_user_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.PostsUserID <= 0 {
		s.respondError(w, 400, "关注参数不正确")
		return
	}
	if payload.PostsUserID == userID {
		s.respondError(w, 400, "不能关注自己")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	exists, err := s.exists(ctx, `SELECT 1 FROM user_follows WHERE user_id = $1 AND target_user_id = $2`, userID, payload.PostsUserID)
	if err != nil {
		s.respondError(w, 500, "操作失败")
		return
	}
	message := "关注成功"
	if exists {
		_, err = s.db.Exec(ctx, `DELETE FROM user_follows WHERE user_id = $1 AND target_user_id = $2`, userID, payload.PostsUserID)
		message = "取消关注成功"
	} else {
		_, err = s.db.Exec(ctx, `INSERT INTO user_follows(user_id, target_user_id) VALUES ($1, $2)`, userID, payload.PostsUserID)
	}
	if err != nil {
		s.respondError(w, 500, "操作失败")
		return
	}
	s.respond(w, true, message)
}

func (s *Server) handleUserPosts(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	postType := parseInt(r.URL.Query().Get("type"), 0)
	page := parsePage(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	var (
		query string
		args  []any
	)
	baseArgs := []any{userID, defaultPageSize, offset(page, defaultPageSize)}
	switch postType {
	case 0:
		query = `
			SELECT p.id, COUNT(*) OVER()
			FROM posts p
			WHERE p.user_id = $1 AND p.is_deleted = FALSE
			ORDER BY p.created_at DESC
			LIMIT $2 OFFSET $3
		`
		args = baseArgs
	case 1:
		query = `
			SELECT p.id, COUNT(*) OVER()
			FROM post_collects pc
			JOIN posts p ON p.id = pc.post_id
			WHERE pc.user_id = $1 AND p.is_deleted = FALSE AND p.audit_status = 1
			ORDER BY pc.created_at DESC
			LIMIT $2 OFFSET $3
		`
		args = baseArgs
	case 2:
		query = `
			SELECT p.id, COUNT(*) OVER()
			FROM post_likes pl
			JOIN posts p ON p.id = pl.post_id
			WHERE pl.user_id = $1 AND p.is_deleted = FALSE AND p.audit_status = 1
			ORDER BY pl.created_at DESC
			LIMIT $2 OFFSET $3
		`
		args = baseArgs
	default:
		query = `
			SELECT DISTINCT p.id, COUNT(*) OVER()
			FROM post_rewards pr
			JOIN posts p ON p.id = pr.post_id
			WHERE pr.to_user_id = $1 AND p.is_deleted = FALSE AND p.audit_status = 1
			ORDER BY p.id DESC
			LIMIT $2 OFFSET $3
		`
		args = baseArgs
	}

	postIDs, total, err := s.fetchPostIDs(ctx, query, args...)
	if err != nil {
		s.respondError(w, 500, "获取动态失败")
		return
	}
	posts, err := s.buildPosts(ctx, userID, postIDs)
	if err != nil {
		s.respondError(w, 500, "整理动态失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, posts), "ok")
}

func (s *Server) handleUserTotalPost(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var (
		myTotal          int64
		collecTotal      int64
		likeTotal        int64
		exceptionalTotal int64
	)
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = $1 AND is_deleted = FALSE), 0),
			COALESCE((SELECT COUNT(*) FROM post_collects WHERE user_id = $1), 0),
			COALESCE((SELECT COUNT(*) FROM post_likes WHERE user_id = $1), 0),
			COALESCE((SELECT COUNT(DISTINCT post_id) FROM post_rewards WHERE to_user_id = $1), 0)
	`, userID).Scan(&myTotal, &collecTotal, &likeTotal, &exceptionalTotal)
	if err != nil {
		s.respondError(w, 500, "获取统计失败")
		return
	}
	s.respond(w, map[string]any{
		"myTotal":          myTotal,
		"collecTotal":      collecTotal,
		"likeTotal":        likeTotal,
		"exceptionalTotal": exceptionalTotal,
	}, "ok")
}

func (s *Server) handleFeedbackAdd(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		FeedbackType    int    `json:"feedback_type"`
		FeedbackContent string `json:"feedback_content"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || normalizeText(payload.FeedbackContent) == "" {
		s.respondError(w, 400, "反馈内容不能为空")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `
		INSERT INTO feedbacks(user_id, feedback_type, feedback_content)
		VALUES ($1, $2, $3)
	`, userID, payload.FeedbackType, limitString(payload.FeedbackContent, 1000))
	if err != nil {
		s.respondError(w, 500, "反馈提交失败")
		return
	}
	s.respond(w, true, "反馈成功")
}

func (s *Server) handleUserAuthentication(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var (
		id          int64
		name        sql.NullString
		contact     sql.NullString
		introduce   sql.NullString
		picture     sql.NullString
		state       int
		overruleMsg sql.NullString
	)
	err := s.db.QueryRow(ctx, `
		SELECT id, name, contact_information, introduce, identity_picture, authentication_state, overrule_content
		FROM user_authentications
		WHERE user_id = $1
		ORDER BY id DESC
		LIMIT 1
	`, userID).Scan(&id, &name, &contact, &introduce, &picture, &state, &overruleMsg)
	if err != nil {
		if errorsIsNoRows(err) {
			s.respond(w, nil, "ok")
			return
		}
		s.respondError(w, 500, "获取认证信息失败")
		return
	}
	s.respond(w, map[string]any{
		"id":                   id,
		"name":                 nullableString(name),
		"contact_information":  nullableString(contact),
		"introduce":            nullableString(introduce),
		"identity_picture":     nullableString(picture),
		"authentication_state": state,
		"overrule_content":     nullableString(overruleMsg),
	}, "ok")
}

func (s *Server) handleSubmitAuthentication(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		Name               string `json:"name"`
		ContactInformation string `json:"contact_information"`
		Introduce          string `json:"introduce"`
		IdentityPicture    string `json:"identity_picture"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "认证参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `
		INSERT INTO user_authentications (
			user_id, name, contact_information, introduce, identity_picture, authentication_state, overrule_content
		) VALUES ($1, $2, $3, $4, $5, 1, '')
	`, userID, limitString(payload.Name, 60), limitString(payload.ContactInformation, 60), limitString(payload.Introduce, 300), normalizeText(payload.IdentityPicture))
	if err != nil {
		s.respondError(w, 500, "提交认证失败")
		return
	}
	_, _ = s.db.Exec(ctx, `UPDATE users SET is_authentication = TRUE WHERE id = $1`, userID)
	s.respond(w, true, "提交成功")
}

func (s *Server) handleUserCircles(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `SELECT id FROM circles WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		s.respondError(w, 500, "获取圈子失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var circleID int64
		if err := rows.Scan(&circleID); err != nil {
			s.respondError(w, 500, "读取圈子失败")
			return
		}
		circle, err := s.fetchCircleSummary(ctx, userID, circleID)
		if err != nil {
			s.respondError(w, 500, "整理圈子失败")
			return
		}
		list = append(list, circle)
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleUserInfoByID(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	userID := parseInt64(r.URL.Query().Get("user_id"), 0)
	if userID <= 0 {
		s.respondError(w, 400, "用户不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	user, err := s.buildPublicUser(ctx, viewerID, userID)
	if err != nil {
		s.respondError(w, 500, "获取用户资料失败")
		return
	}
	s.respond(w, user, "ok")
}

func (s *Server) handleUserPostsByID(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	userID := parseInt64(r.URL.Query().Get("user_id"), 0)
	page := parsePage(r)
	if userID <= 0 {
		s.respondError(w, 400, "用户不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	postIDs, total, err := s.fetchPostIDs(ctx, `
		SELECT p.id, COUNT(*) OVER()
		FROM posts p
		WHERE p.user_id = $1 AND p.is_deleted = FALSE AND p.audit_status = 1
		ORDER BY p.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, defaultPageSize, offset(page, defaultPageSize))
	if err != nil {
		s.respondError(w, 500, "获取用户内容失败")
		return
	}
	posts, err := s.buildPosts(ctx, viewerID, postIDs)
	if err != nil {
		s.respondError(w, 500, "整理用户内容失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, posts), "ok")
}

func (s *Server) handleFollowUsers(w http.ResponseWriter, r *http.Request) {
	s.handleFollowList(w, r, false)
}

func (s *Server) handleFansUsers(w http.ResponseWriter, r *http.Request) {
	s.handleFollowList(w, r, true)
}

func (s *Server) handleFollowList(w http.ResponseWriter, r *http.Request, reverse bool) {
	viewerID := s.currentUserID(r)
	targetUserID := parseInt64(r.URL.Query().Get("user_id"), viewerID)
	if targetUserID == 0 {
		s.respond(w, s.buildPagination(1, 0, []any{}), "ok")
		return
	}
	page := parsePage(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	var query string
	if reverse {
		query = `
			SELECT u.id, u.user_name, u.user_avatar,
				EXISTS(SELECT 1 FROM user_follows me WHERE me.user_id = $1 AND me.target_user_id = u.id),
				COUNT(*) OVER()
			FROM user_follows uf
			JOIN users u ON u.id = uf.user_id
			WHERE uf.target_user_id = $2
			ORDER BY uf.created_at DESC
			LIMIT $3 OFFSET $4
		`
	} else {
		query = `
			SELECT u.id, u.user_name, u.user_avatar,
				EXISTS(SELECT 1 FROM user_follows me WHERE me.user_id = $1 AND me.target_user_id = u.id),
				COUNT(*) OVER()
			FROM user_follows uf
			JOIN users u ON u.id = uf.target_user_id
			WHERE uf.user_id = $2
			ORDER BY uf.created_at DESC
			LIMIT $3 OFFSET $4
		`
	}

	rows, err := s.db.Query(ctx, query, viewerID, targetUserID, defaultPageSize, offset(page, defaultPageSize))
	if err != nil {
		s.respondError(w, 500, "获取关注列表失败")
		return
	}
	defer rows.Close()

	var (
		items []map[string]any
		total int64
	)
	for rows.Next() {
		var (
			id               int64
			name             string
			avatar           sql.NullString
			isTogetherFollow bool
			count            int64
		)
		if err := rows.Scan(&id, &name, &avatar, &isTogetherFollow, &count); err != nil {
			s.respondError(w, 500, "读取关注列表失败")
			return
		}
		total = count
		items = append(items, map[string]any{
			"user": map[string]any{
				"id":          id,
				"user_name":   name,
				"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
			},
			"is_together_follow": isTogetherFollow,
		})
	}
	s.respond(w, s.buildPagination(page, total, items), "ok")
}

func (s *Server) handleMyOrders(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	page := parsePage(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT id, order_number, order_type, order_pay_price, posts_id, created_at, COUNT(*) OVER()
		FROM orders
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, defaultPageSize, offset(page, defaultPageSize))
	if err != nil {
		s.respondError(w, 500, "获取订单失败")
		return
	}
	defer rows.Close()

	var (
		list  []map[string]any
		total int64
	)
	for rows.Next() {
		var (
			id      int64
			number  string
			typ     int
			price   float64
			postsID sql.NullInt64
			created time.Time
			count   int64
		)
		if err := rows.Scan(&id, &number, &typ, &price, &postsID, &created, &count); err != nil {
			s.respondError(w, 500, "读取订单失败")
			return
		}
		total = count
		title := "会员开通"
		detail := "InfiniLink 永久会员"
		if typ == 2 {
			title = "内容打赏"
			detail = "给创作者的一笔支持"
		}
		list = append(list, map[string]any{
			"id":              id,
			"order_number":    number,
			"order_type":      typ,
			"order_pay_price": price,
			"posts_id":        nullInt64(postsID),
			"created_at":      formatListDatetime(created),
			"type_content": map[string]any{
				"title":   title,
				"details": detail,
			},
		})
	}
	s.respond(w, s.buildPagination(page, total, list), "ok")
}

func (s *Server) handleMyFinancial(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var (
		sumPrice        float64
		yesterday       float64
		balance         float64
		withdrawalPrice float64
		bankName        sql.NullString
		bankCard        sql.NullString
	)
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT SUM(exceptional_price) FROM post_rewards WHERE to_user_id = $1), 0),
			COALESCE((SELECT SUM(exceptional_price) FROM post_rewards WHERE to_user_id = $1 AND created_at >= NOW() - INTERVAL '1 day'), 0),
			COALESCE((SELECT SUM(exceptional_price) FROM post_rewards WHERE to_user_id = $1), 0) -
				COALESCE((SELECT SUM(price) FROM withdrawals WHERE user_id = $1 AND state IN (0, 1)), 0),
			COALESCE((SELECT SUM(price) FROM withdrawals WHERE user_id = $1 AND state = 1), 0),
			COALESCE((SELECT bank_name FROM withdrawals WHERE user_id = $1 ORDER BY id DESC LIMIT 1), ''),
			COALESCE((SELECT bank_card FROM withdrawals WHERE user_id = $1 ORDER BY id DESC LIMIT 1), '')
	`, userID).Scan(&sumPrice, &yesterday, &balance, &withdrawalPrice, &bankName, &bankCard)
	if err != nil {
		s.respondError(w, 500, "获取收益失败")
		return
	}
	s.respond(w, map[string]any{
		"sum_price":          sumPrice,
		"earnings_yesterday": yesterday,
		"balance":            balance,
		"withdrawal_price":   withdrawalPrice,
		"bank_name":          nullableString(bankName),
		"bank_card":          nullableString(bankCard),
	}, "ok")
}

func (s *Server) handleInitiateWithdrawal(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		Price    float64 `json:"price"`
		BankName string  `json:"bank_name"`
		BankCard string  `json:"bank_card"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.Price <= 0 {
		s.respondError(w, 400, "提现参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `
		INSERT INTO withdrawals(user_id, price, bank_name, bank_card, state, status_value, account_at)
		VALUES ($1, $2, $3, $4, 1, '已到账', NOW())
	`, userID, payload.Price, limitString(payload.BankName, 80), limitString(payload.BankCard, 80))
	if err != nil {
		s.respondError(w, 500, "发起提现失败")
		return
	}
	s.respond(w, true, "发起提现成功")
}

func (s *Server) handleMyWithdrawals(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT id, price, state, status_value, created_at, account_at
		FROM withdrawals
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		s.respondError(w, 500, "获取提现记录失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var (
			id        int64
			price     float64
			state     int
			status    string
			createdAt time.Time
			accountAt sql.NullTime
		)
		if err := rows.Scan(&id, &price, &state, &status, &createdAt, &accountAt); err != nil {
			s.respondError(w, 500, "读取提现记录失败")
			return
		}
		item := map[string]any{
			"id":           id,
			"price":        price,
			"state":        state,
			"status_value": status,
			"created_at":   formatListDatetime(createdAt),
			"account_at":   formatListDatetime(nullTime(accountAt)),
		}
		list = append(list, item)
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleMyRewards(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT pr.id, pr.post_id, pr.exceptional_price, pr.created_at, u.id, u.user_name, u.user_avatar
		FROM post_rewards pr
		JOIN users u ON u.id = pr.from_user_id
		WHERE pr.to_user_id = $1
		ORDER BY pr.created_at DESC
	`, userID)
	if err != nil {
		s.respondError(w, 500, "获取收益记录失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var (
			id        int64
			postID    int64
			price     float64
			createdAt time.Time
			fromID    int64
			name      string
			avatar    sql.NullString
		)
		if err := rows.Scan(&id, &postID, &price, &createdAt, &fromID, &name, &avatar); err != nil {
			s.respondError(w, 500, "读取收益记录失败")
			return
		}
		list = append(list, map[string]any{
			"id":                id,
			"posts_id":          postID,
			"exceptional_price": price,
			"datetime":          formatListDatetime(createdAt),
			"user": map[string]any{
				"id":          fromID,
				"user_name":   name,
				"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
			},
		})
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleFreeGetVIP(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if _, err := s.db.Exec(ctx, `UPDATE users SET is_member = TRUE, updated_at = NOW() WHERE id = $1`, userID); err != nil {
		s.respondError(w, 500, "开通会员失败")
		return
	}
	s.respond(w, true, "领取成功")
}

func (s *Server) handleUserPlates(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	plates, err := s.fetchUserPlates(ctx, s.currentUserID(r))
	if err != nil {
		s.respondError(w, 500, "获取板块失败")
		return
	}
	s.respond(w, plates, "ok")
}

func (s *Server) handleUserPlateAdd(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		PlateID int64 `json:"plate_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.PlateID <= 0 {
		s.respondError(w, 400, "板块参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var count int64
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM user_plates WHERE user_id = $1`, userID).Scan(&count); err == nil && count >= 12 {
		s.respondWithCode(w, 421001, true, "最多选择 12 个板块", true)
		return
	}
	if _, err := s.db.Exec(ctx, `
		INSERT INTO user_plates(user_id, plate_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, plate_id) DO NOTHING
	`, userID, payload.PlateID); err != nil {
		s.respondError(w, 500, "添加板块失败")
		return
	}
	s.respond(w, true, "添加成功")
}

func (s *Server) handleUserPlateDelete(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		ID int64 `json:"id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.ID <= 0 {
		s.respondError(w, 400, "板块参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if _, err := s.db.Exec(ctx, `DELETE FROM user_plates WHERE id = $1 AND user_id = $2`, payload.ID, userID); err != nil {
		s.respondError(w, 500, "删除板块失败")
		return
	}
	s.respond(w, true, "删除成功")
}

func (s *Server) handleAuditPosts(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		ID        int64  `json:"id"`
		Type      int    `json:"type"`
		RejectMsg string `json:"reject_msg"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.ID <= 0 {
		s.respondError(w, 400, "审核参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var circleOwnerID int64
	err := s.db.QueryRow(ctx, `
		SELECT c.user_id
		FROM posts p
		JOIN circles c ON c.id = p.circle_id
		WHERE p.id = $1
	`, payload.ID).Scan(&circleOwnerID)
	if err != nil || circleOwnerID != userID {
		s.respondError(w, 403, "没有审核权限")
		return
	}
	status := 1
	rejectReason := ""
	if payload.Type == 1 {
		status = 2
		rejectReason = limitString(payload.RejectMsg, 300)
	}
	if _, err := s.db.Exec(ctx, `
		UPDATE posts
		SET audit_status = $2, reject_msg = $3, updated_at = NOW()
		WHERE id = $1
	`, payload.ID, status, rejectReason); err != nil {
		s.respondError(w, 500, "审核失败")
		return
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handleMembersPrice(w http.ResponseWriter, r *http.Request) {
	s.respond(w, s.cfg.MembershipPrice, "ok")
}

func (s *Server) handleOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		Type   int             `json:"type"`
		Parame json.RawMessage `json:"parame"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "订单参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	orderNumber := fmt.Sprintf("IL%s", time.Now().Format("20060102150405"))
	price := s.cfg.MembershipPrice
	var postsID int64
	if payload.Type == 2 {
		type rewardPayload struct {
			RewardPrice float64 `json:"rewardPrice"`
			PostsID     int64   `json:"postsId"`
			PostsUserID int64   `json:"postsUserId"`
		}
		var reward rewardPayload
		_ = json.Unmarshal(payload.Parame, &reward)
		price = reward.RewardPrice
		postsID = reward.PostsID
	}
	_, _ = s.db.Exec(ctx, `
		INSERT INTO orders(user_id, order_number, order_type, order_pay_price, posts_id, status)
		VALUES ($1, $2, $3, $4, NULLIF($5, 0), 'pending')
	`, userID, orderNumber, payload.Type, price, postsID)

	s.respondError(w, 500001, "已预留支付接口，请接入微信支付商户配置后启用真实支付")
}

func (s *Server) handlePCLogin(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		Token string `json:"token"`
		Scene string `json:"scene"`
	}
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "PC 登录参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, _ = s.db.Exec(ctx, `
		INSERT INTO pc_login_sessions(scene, user_id, token, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (scene) DO UPDATE SET user_id = EXCLUDED.user_id, token = EXCLUDED.token, created_at = NOW()
	`, limitString(payload.Scene, 120), userID, limitString(payload.Token, 500))
	s.respond(w, true, "PC 登录授权成功")
}

func (s *Server) handleMySearchList(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	if userID == 0 {
		s.respond(w, []any{}, "ok")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT id, keyword
		FROM search_histories
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 20
	`, userID)
	if err != nil {
		s.respondError(w, 500, "获取搜索记录失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var (
			id      int64
			keyword string
		)
		if err := rows.Scan(&id, &keyword); err != nil {
			s.respondError(w, 500, "读取搜索记录失败")
			return
		}
		list = append(list, map[string]any{
			"id":             id,
			"search_content": keyword,
		})
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleDeleteSearchHistoryOne(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	if userID == 0 {
		s.respond(w, true, "ok")
		return
	}
	id := parseInt64(r.URL.Query().Get("id"), 0)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `DELETE FROM search_histories WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		s.respondError(w, 500, "删除搜索记录失败")
		return
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handleDeleteSearchHistoryAll(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	if userID == 0 {
		s.respond(w, true, "ok")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `DELETE FROM search_histories WHERE user_id = $1`, userID)
	if err != nil {
		s.respondError(w, 500, "清空搜索记录失败")
		return
	}
	s.respond(w, true, "操作成功")
}

func nullTime(value sql.NullTime) time.Time {
	if value.Valid {
		return value.Time
	}
	return time.Time{}
}
