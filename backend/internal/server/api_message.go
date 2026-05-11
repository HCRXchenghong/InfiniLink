package server

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

func (s *Server) handleMessagesSummary(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	if userID == 0 {
		s.respond(w, []map[string]any{
			{"noticeSystemText": "", "noticeSystemDate": "52年前", "noticeSystemCount": 0},
			{"noticeLikeCollectText": "", "noticeLikeCollectDate": "52年前", "noticeLikeCollectCount": 0},
			{"noticeCommentText": "", "noticeCommentDate": "52年前", "noticeCommentCount": 0},
		}, "ok")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var (
		systemText   sql.NullString
		systemDate   sql.NullTime
		systemCount  int64
		likeText     sql.NullString
		likeDate     sql.NullTime
		likeCount    int64
		commentText  sql.NullString
		commentDate  sql.NullTime
		commentCount int64
	)
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT content FROM notifications WHERE user_id = $1 AND type = 1 ORDER BY created_at DESC LIMIT 1), ''),
			(SELECT created_at FROM notifications WHERE user_id = $1 AND type = 1 ORDER BY created_at DESC LIMIT 1),
			COALESCE((SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 1 AND is_read = FALSE), 0),
			COALESCE((SELECT content FROM notifications WHERE user_id = $1 AND type = 2 ORDER BY created_at DESC LIMIT 1), ''),
			(SELECT created_at FROM notifications WHERE user_id = $1 AND type = 2 ORDER BY created_at DESC LIMIT 1),
			COALESCE((SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 2 AND is_read = FALSE), 0),
			COALESCE((SELECT content FROM notifications WHERE user_id = $1 AND type = 3 ORDER BY created_at DESC LIMIT 1), ''),
			(SELECT created_at FROM notifications WHERE user_id = $1 AND type = 3 ORDER BY created_at DESC LIMIT 1),
			COALESCE((SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 3 AND is_read = FALSE), 0)
	`, userID).Scan(
		&systemText,
		&systemDate,
		&systemCount,
		&likeText,
		&likeDate,
		&likeCount,
		&commentText,
		&commentDate,
		&commentCount,
	)
	if err != nil {
		s.respondError(w, 500, "获取消息摘要失败")
		return
	}
	s.respond(w, []map[string]any{
		{
			"noticeSystemText":  stripHTML(nullableString(systemText)),
			"noticeSystemDate":  summaryDate(systemDate),
			"noticeSystemCount": systemCount,
		},
		{
			"noticeLikeCollectText":  stripHTML(nullableString(likeText)),
			"noticeLikeCollectDate":  summaryDate(likeDate),
			"noticeLikeCollectCount": likeCount,
		},
		{
			"noticeCommentText":  stripHTML(nullableString(commentText)),
			"noticeCommentDate":  summaryDate(commentDate),
			"noticeCommentCount": commentCount,
		},
	}, "ok")
}

func (s *Server) handleMessagesDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	typ := parseInt(r.URL.Query().Get("type"), 1)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT id, title, content, created_at, is_read, posts_id
		FROM notifications
		WHERE user_id = $1 AND type = $2
		ORDER BY created_at DESC
	`, userID, typ)
	if err != nil {
		s.respondError(w, 500, "获取消息详情失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var (
			id        int64
			title     string
			content   string
			createdAt time.Time
			isRead    bool
			postsID   sql.NullInt64
		)
		if err := rows.Scan(&id, &title, &content, &createdAt, &isRead, &postsID); err != nil {
			s.respondError(w, 500, "读取消息详情失败")
			return
		}
		list = append(list, map[string]any{
			"id":         id,
			"qh_image":   s.assetURL("illustrations/messaging-fun-rafiki.png"),
			"title":      title,
			"content":    content,
			"created_at": formatListDatetime(createdAt),
			"is_read":    boolToInt(isRead),
			"posts_id":   nullInt64(postsID),
		})
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleReadMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		Type int `json:"type"`
	}
	if r.Method == http.MethodGet {
		payload.Type = parseInt(r.URL.Query().Get("type"), 0)
	} else if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "参数不正确")
		return
	}
	if payload.Type <= 0 {
		payload.Type = parseInt(r.URL.Query().Get("type"), 0)
	}
	if payload.Type <= 0 {
		s.respondError(w, 400, "参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND type = $2`, userID, payload.Type)
	if err != nil {
		s.respondError(w, 500, "标记已读失败")
		return
	}
	s.respond(w, true, "ok")
}

func (s *Server) handleAddChat(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		OID         int64  `json:"oid"`
		ChatContent string `json:"chat_content"`
		ChatImage   string `json:"chat_image"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.OID <= 0 {
		s.respondError(w, 400, "聊天参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	message, err := s.insertChatMessage(ctx, userID, payload.OID, payload.ChatContent, payload.ChatImage)
	if err != nil {
		s.respondError(w, 500, "发送消息失败")
		return
	}
	s.publishChatMessage(ctx, userID, payload.OID, message)
	s.respond(w, map[string]any{
		"message": message,
	}, "发送成功")
}

func (s *Server) handleCustomerServiceProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	thread, err := s.buildCustomerServiceThread(ctx, userID)
	if err != nil {
		s.respondError(w, 500, "获取客服信息失败")
		return
	}
	s.respond(w, thread, "ok")
}

func (s *Server) handleGetUserChat(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	oid := parseInt64(r.URL.Query().Get("oid"), 0)
	page := parsePage(r)
	if oid <= 0 {
		s.respondError(w, 400, "聊天对象不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT
			m.id,
			m.sender_id,
			m.receiver_id,
			m.chat_content,
			m.chat_image,
			m.created_at,
			u.id,
			u.user_name,
			u.user_avatar,
			COUNT(*) OVER()
		FROM chat_messages m
		JOIN users u ON u.id = m.sender_id
		WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
		ORDER BY m.created_at DESC
		LIMIT $3 OFFSET $4
	`, userID, oid, defaultChatSize, offset(page, defaultChatSize))
	if err != nil {
		s.respondError(w, 500, "获取聊天记录失败")
		return
	}
	defer rows.Close()
	var (
		items []map[string]any
		total int64
	)
	for rows.Next() {
		var (
			id         int64
			senderID   int64
			receiverID int64
			content    sql.NullString
			image      sql.NullString
			createdAt  time.Time
			userUserID int64
			name       string
			avatar     sql.NullString
			count      int64
		)
		if err := rows.Scan(&id, &senderID, &receiverID, &content, &image, &createdAt, &userUserID, &name, &avatar, &count); err != nil {
			s.respondError(w, 500, "读取聊天记录失败")
			return
		}
		total = count
		items = append(items, map[string]any{
			"id":        id,
			"object_id": receiverID,
			"user": map[string]any{
				"id":          userUserID,
				"user_name":   name,
				"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
			},
			"chat_content": nullableString(content),
			"chat_image":   nullableString(image),
			"datetime":     formatListDatetime(createdAt),
			"imgList":      buildImageList(nullableString(image)),
		})
	}
	// 前端会 reverse 后展示，这里保留倒序更符合分页逻辑
	s.respond(w, s.buildPagination(page, total, items), "ok")
}

func (s *Server) handleGetUserChatList(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	serviceUserID, _ := s.getCustomerServiceUserID(ctx)
	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT ON (partner.id)
			partner.id,
			partner.user_name,
			partner.user_avatar,
			last_m.chat_content,
			last_m.chat_image,
			last_m.created_at,
			COALESCE((SELECT COUNT(*) FROM chat_messages unread WHERE unread.sender_id = partner.id AND unread.receiver_id = $1 AND unread.is_read = FALSE), 0)
		FROM chat_messages last_m
		JOIN users partner ON partner.id = CASE WHEN last_m.sender_id = $1 THEN last_m.receiver_id ELSE last_m.sender_id END
		WHERE last_m.sender_id = $1 OR last_m.receiver_id = $1
		ORDER BY partner.id, last_m.created_at DESC
	`, userID)
	if err != nil {
		s.respondError(w, 500, "获取聊天列表失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var (
			otherID   int64
			name      string
			avatar    sql.NullString
			content   sql.NullString
			image     sql.NullString
			createdAt time.Time
			unread    int64
		)
		if err := rows.Scan(&otherID, &name, &avatar, &content, &image, &createdAt, &unread); err != nil {
			s.respondError(w, 500, "读取聊天列表失败")
			return
		}
		list = append(list, map[string]any{
			"user": map[string]any{
				"id":          otherID,
				"user_name":   name,
				"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
			},
			"datetime":            formatListDatetime(createdAt),
			"chat_content":        nullableString(content),
			"chat_image":          nullableString(image),
			"read":                nil,
			"read_count":          unread,
			"is_customer_service": boolToInt(otherID == serviceUserID),
		})
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleReadUserChat(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		OID int64 `json:"oid"`
	}
	if r.Method == http.MethodGet {
		payload.OID = parseInt64(r.URL.Query().Get("oid"), 0)
	} else if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "参数不正确")
		return
	}
	if payload.OID <= 0 {
		payload.OID = parseInt64(r.URL.Query().Get("oid"), 0)
	}
	if payload.OID <= 0 {
		s.respondError(w, 400, "参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `
		UPDATE chat_messages
		SET is_read = TRUE
		WHERE sender_id = $1 AND receiver_id = $2
	`, payload.OID, userID)
	if err != nil {
		s.respondError(w, 500, "标记聊天已读失败")
		return
	}
	s.respond(w, true, "ok")
}

func (s *Server) handleSysMessageCount(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	if userID == 0 {
		s.respond(w, 0, "ok")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var count int64
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE), 0) +
			COALESCE((SELECT COUNT(*) FROM chat_messages WHERE receiver_id = $1 AND is_read = FALSE), 0)
	`, userID).Scan(&count)
	if err != nil {
		s.respondError(w, 500, "获取未读消息失败")
		return
	}
	s.respond(w, count, "ok")
}

func (s *Server) handleDeleteMessageThread(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	targetID := parseInt64(r.URL.Query().Get("userid"), 0)
	if targetID <= 0 && r.Method != http.MethodGet {
		var payload struct {
			UserID int64 `json:"userid"`
		}
		if err := s.decodeJSON(r, &payload); err == nil {
			targetID = payload.UserID
		}
	}
	if targetID <= 0 {
		s.respondError(w, 400, "参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `
		DELETE FROM chat_messages
		WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
	`, userID, targetID)
	if err != nil {
		s.respondError(w, 500, "删除聊天失败")
		return
	}
	s.respond(w, true, "ok")
}

func summaryDate(value sql.NullTime) string {
	if !value.Valid {
		return "52年前"
	}
	return formatRelativeTime(value.Time)
}
