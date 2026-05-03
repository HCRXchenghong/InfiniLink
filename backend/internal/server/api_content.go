package server

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/skip2/go-qrcode"
)

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)
	file, header, err := r.FormFile("file")
	if err != nil {
		s.respondError(w, 400, "请选择需要上传的文件")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".bin"
	}
	filename := fmt.Sprintf("%s%s", uuid.NewString(), ext)
	target := s.localUploadPath(filename)

	out, err := os.Create(target)
	if err != nil {
		s.respondError(w, 500, "保存文件失败")
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		s.respondError(w, 500, "写入文件失败")
		return
	}

	s.respond(w, s.uploadURL(filename), "上传成功")
}

func (s *Server) handleIndexBanner(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := s.db.Query(ctx, `
		SELECT slideshow_type, link, posts_id, circle_id, poster
		FROM banners
		ORDER BY sort_order ASC, id ASC
	`)
	if err != nil {
		s.respondError(w, 500, "获取轮播图失败")
		return
	}
	defer rows.Close()

	var banners []map[string]any
	for rows.Next() {
		var (
			typ      int
			link     sql.NullString
			postsID  sql.NullInt64
			circleID sql.NullInt64
			poster   sql.NullString
		)
		if err := rows.Scan(&typ, &link, &postsID, &circleID, &poster); err != nil {
			s.respondError(w, 500, "读取轮播图失败")
			return
		}
		banners = append(banners, map[string]any{
			"slideshow_type": typ,
			"link":           nullableString(link),
			"posts_id":       nullInt64(postsID),
			"circle_id":      nullInt64(circleID),
			"poster":         pickString(poster, s.assetURL("banner-default.svg")),
		})
	}
	if len(banners) == 0 {
		banners = []map[string]any{
			{
				"slideshow_type": 0,
				"link":           "https://github.com/HCRXchenghong/InfiniLink",
				"posts_id":       0,
				"circle_id":      0,
				"poster":         s.assetURL("banner-default.svg"),
			},
		}
	}
	s.respond(w, banners, "ok")
}

func (s *Server) handleIndexPosts(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	page := parsePage(r)
	feedType := parseInt(r.URL.Query().Get("type"), 1)
	plateID := parseInt64(r.URL.Query().Get("plate_id"), 0)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	postIDs, total, err := s.queryIndexPostIDs(ctx, viewerID, feedType, plateID, page)
	if err != nil {
		s.respondError(w, 500, "获取首页内容失败")
		return
	}
	posts, err := s.buildPosts(ctx, viewerID, postIDs)
	if err != nil {
		s.respondError(w, 500, "整理首页内容失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, posts), "ok")
}

func (s *Server) queryIndexPostIDs(ctx context.Context, viewerID int64, feedType int, plateID int64, page int) ([]int64, int64, error) {
	args := []any{}
	where := []string{"p.is_deleted = FALSE", "p.audit_status = 1"}
	joins := []string{"LEFT JOIN circles c ON c.id = p.circle_id"}

	if plateID > 0 {
		args = append(args, plateID)
		where = append(where, fmt.Sprintf("c.plate_id = $%d", len(args)))
	}

	orderBy := "p.created_at DESC"
	switch feedType {
	case 0:
		if viewerID > 0 {
			args = append(args, viewerID, viewerID)
			where = append(where, fmt.Sprintf("(p.user_id IN (SELECT target_user_id FROM user_follows WHERE user_id = $%d) OR p.circle_id IN (SELECT circle_id FROM circle_follows WHERE user_id = $%d))", len(args)-1, len(args)))
		}
	case 2:
		orderBy = "p.like_count_cache DESC, p.comment_count_cache DESC, p.created_at DESC"
	default:
		feedType = 1
	}

	args = append(args, defaultPageSize, offset(page, defaultPageSize))
	query := fmt.Sprintf(`
		SELECT p.id, COUNT(*) OVER()
		FROM posts p
		%s
		WHERE %s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, strings.Join(joins, "\n"), strings.Join(where, " AND "), orderBy, len(args)-1, len(args))

	postIDs, total, err := s.fetchPostIDs(ctx, query, args...)
	if err == nil && len(postIDs) == 0 && feedType == 0 {
		return s.queryIndexPostIDs(ctx, viewerID, 1, plateID, page)
	}
	return postIDs, total, err
}

func (s *Server) handleIndexChoiceness(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	postIDs, _, err := s.fetchPostIDs(ctx, `
		SELECT p.id, COUNT(*) OVER()
		FROM posts p
		WHERE p.is_deleted = FALSE AND p.audit_status = 1
		ORDER BY p.like_count_cache DESC, p.comment_count_cache DESC, p.created_at DESC
		LIMIT 6
	`)
	if err != nil {
		s.respondError(w, 500, "获取精选内容失败")
		return
	}
	posts, err := s.buildPosts(ctx, viewerID, postIDs)
	if err != nil {
		s.respondError(w, 500, "整理精选内容失败")
		return
	}
	s.respond(w, posts, "ok")
}

func (s *Server) handleIndexSearch(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	page := parsePage(r)
	searchType := parseInt(r.URL.Query().Get("type"), 0)
	keyword := normalizeText(r.URL.Query().Get("keyword"))
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if viewerID > 0 && page == 1 && keyword != "" {
		_, _ = s.db.Exec(ctx, `
			INSERT INTO search_histories(user_id, keyword)
			VALUES ($1, $2)
		`, viewerID, limitString(keyword, 80))
	}

	switch searchType {
	case 1:
		circles, total, err := s.searchCircles(ctx, viewerID, keyword, page)
		if err != nil {
			s.respondError(w, 500, "搜索圈子失败")
			return
		}
		s.respond(w, s.buildPagination(page, total, circles), "ok")
	case 2:
		users, total, err := s.searchUsers(ctx, viewerID, keyword, page)
		if err != nil {
			s.respondError(w, 500, "搜索用户失败")
			return
		}
		s.respond(w, s.buildPagination(page, total, users), "ok")
	default:
		postIDs, total, err := s.fetchPostIDs(ctx, `
			SELECT p.id, COUNT(*) OVER()
			FROM posts p
			WHERE p.is_deleted = FALSE
				AND p.audit_status = 1
				AND (p.posts_content ILIKE $1 OR EXISTS (
					SELECT 1 FROM tags t
					JOIN post_tags pt ON pt.tag_id = t.id
					WHERE pt.post_id = p.id AND t.tags_name ILIKE $1
				))
			ORDER BY p.created_at DESC
			LIMIT $2 OFFSET $3
		`, "%"+keyword+"%", defaultPageSize, offset(page, defaultPageSize))
		if err != nil {
			s.respondError(w, 500, "搜索内容失败")
			return
		}
		posts, err := s.buildPosts(ctx, viewerID, postIDs)
		if err != nil {
			s.respondError(w, 500, "整理搜索结果失败")
			return
		}
		s.respond(w, s.buildPagination(page, total, posts), "ok")
	}
}

func (s *Server) handleSearchCount(w http.ResponseWriter, r *http.Request) {
	keyword := normalizeText(r.URL.Query().Get("keyword"))
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var (
		postCount   int64
		circleCount int64
		userCount   int64
	)
	likeKeyword := "%" + keyword + "%"
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM posts WHERE is_deleted = FALSE AND audit_status = 1 AND posts_content ILIKE $1), 0),
			COALESCE((SELECT COUNT(*) FROM circles WHERE circle_name ILIKE $1 OR circle_introduce ILIKE $1), 0),
			COALESCE((SELECT COUNT(*) FROM users WHERE user_name ILIKE $1 OR user_introduce ILIKE $1), 0)
	`, likeKeyword).Scan(&postCount, &circleCount, &userCount)
	if err != nil {
		s.respondError(w, 500, "获取搜索统计失败")
		return
	}
	s.respond(w, map[string]any{
		"posts_count":  postCount,
		"circle_count": circleCount,
		"user_count":   userCount,
	}, "ok")
}

func (s *Server) handleSearchHotList(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := s.db.Query(ctx, `
		SELECT keyword, COUNT(*) AS hits
		FROM search_histories
		GROUP BY keyword
		ORDER BY hits DESC, MAX(created_at) DESC
		LIMIT 10
	`)
	if err != nil {
		s.respondError(w, 500, "获取热门搜索失败")
		return
	}
	defer rows.Close()
	var result []map[string]any
	for rows.Next() {
		var keyword string
		var hits int64
		if err := rows.Scan(&keyword, &hits); err != nil {
			s.respondError(w, 500, "读取热门搜索失败")
			return
		}
		result = append(result, map[string]any{
			"id":             stableHash(keyword),
			"search_content": keyword,
			"hits":           hits,
		})
	}
	if len(result) == 0 {
		result = []map[string]any{
			{"id": 1, "search_content": "Go 后端"},
			{"id": 2, "search_content": "内容社区"},
			{"id": 3, "search_content": "InfiniLink"},
		}
	}
	s.respond(w, result, "ok")
}

func (s *Server) handleSearchCarouselList(w http.ResponseWriter, r *http.Request) {
	s.respond(w, []map[string]any{
		{"search_content": "找圈子"},
		{"search_content": "看推荐"},
		{"search_content": "搜用户"},
	}, "ok")
}

func (s *Server) handleTagsHot(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	tags, err := s.fetchTags(ctx, 20)
	if err != nil {
		s.respondError(w, 500, "获取热门标签失败")
		return
	}
	s.respond(w, tags, "ok")
}

func (s *Server) handleTagsRecommend(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	tags, err := s.fetchTags(ctx, 12)
	if err != nil {
		s.respondError(w, 500, "获取推荐标签失败")
		return
	}
	s.respond(w, tags, "ok")
}

func (s *Server) handleTagsAdd(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	if userID == 0 {
		s.unauthorized(w)
		return
	}
	var payload struct {
		TagsName string `json:"tags_name"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || normalizeText(payload.TagsName) == "" {
		s.respondError(w, 400, "标签名称不能为空")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	name := limitString(payload.TagsName, 20)
	var tagID int64
	err := s.db.QueryRow(ctx, `
		INSERT INTO tags(tags_name, hot_score, created_by)
		VALUES ($1, 1, $2)
		ON CONFLICT (tags_name) DO UPDATE SET hot_score = tags.hot_score + 1
		RETURNING id
	`, name, userID).Scan(&tagID)
	if err != nil {
		s.respondError(w, 500, "创建标签失败")
		return
	}
	s.respond(w, map[string]any{
		"id":        tagID,
		"tags_name": name,
	}, "ok")
}

func (s *Server) handlePlateOptions(w http.ResponseWriter, r *http.Request) {
	s.handlePlateList(w, r)
}

func (s *Server) handlePlateList(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	plates, err := s.fetchPlates(ctx)
	if err != nil {
		s.respondError(w, 500, "获取板块列表失败")
		return
	}
	s.respond(w, plates, "ok")
}

func (s *Server) handleCircleByPlateID(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	plateID := parseInt64(r.URL.Query().Get("plate_id"), -1)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	query := `SELECT id FROM circles`
	args := []any{}
	if plateID > 0 {
		query += ` WHERE plate_id = $1`
		args = append(args, plateID)
	}
	query += ` ORDER BY created_at DESC LIMIT 50`
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		s.respondError(w, 500, "获取圈子失败")
		return
	}
	defer rows.Close()
	var circles []map[string]any
	for rows.Next() {
		var circleID int64
		if err := rows.Scan(&circleID); err != nil {
			s.respondError(w, 500, "读取圈子失败")
			return
		}
		item, err := s.fetchCircleSummary(ctx, viewerID, circleID)
		if err != nil {
			s.respondError(w, 500, "整理圈子失败")
			return
		}
		circles = append(circles, item)
	}
	s.respond(w, circles, "ok")
}

func (s *Server) handleCircleSearch(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	page := 1
	keyword := normalizeText(r.URL.Query().Get("keyword"))
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	circles, total, err := s.searchCircles(ctx, viewerID, keyword, page)
	if err != nil {
		s.respondError(w, 500, "搜索圈子失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, circles), "ok")
}

func (s *Server) handleAddCircle(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload circleInput
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "圈子参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	name := limitString(payload.CircleName, 40)
	intro := limitString(payload.CircleIntroduce, 300)
	head := normalizeText(payload.HeadPortrait)
	if head == "" {
		head = s.assetURL("circle-avatar.svg")
	}
	background := normalizeText(payload.BackgroundMaps)
	if background == "" {
		background = s.assetURL("circle-cover.svg")
	}

	if payload.ID > 0 {
		_, err := s.db.Exec(ctx, `
			UPDATE circles
			SET circle_name = $2, circle_introduce = $3, head_portrait = $4, background_maps = $5, plate_id = $6, updated_at = NOW()
			WHERE id = $1 AND user_id = $7
		`, payload.ID, name, intro, head, background, payload.PlateID, userID)
		if err != nil {
			s.respondError(w, 500, "更新圈子失败")
			return
		}
	} else {
		_, err := s.db.Exec(ctx, `
			INSERT INTO circles(user_id, plate_id, circle_name, circle_introduce, head_portrait, background_maps, audit_status)
			VALUES ($1, $2, $3, $4, $5, $6, 1)
		`, userID, payload.PlateID, name, intro, head, background)
		if err != nil {
			s.respondError(w, 500, "创建圈子失败")
			return
		}
	}
	s.respond(w, true, "提交成功")
}

func (s *Server) handleCircleRecommend(w http.ResponseWriter, r *http.Request) {
	s.handleCircleRanking(w, r, 4)
}

func (s *Server) handleCircleHot(w http.ResponseWriter, r *http.Request) {
	s.handleCircleRanking(w, r, 10)
}

func (s *Server) handleCircleRanking(w http.ResponseWriter, r *http.Request, limit int) {
	viewerID := s.currentUserID(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT id
		FROM circles
		ORDER BY (
			SELECT COUNT(*) FROM circle_follows cf WHERE cf.circle_id = circles.id
		) DESC, created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		s.respondError(w, 500, "获取圈子排行失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var circleID int64
		if err := rows.Scan(&circleID); err != nil {
			s.respondError(w, 500, "读取圈子排行失败")
			return
		}
		circle, err := s.fetchCircleSummary(ctx, viewerID, circleID)
		if err != nil {
			s.respondError(w, 500, "整理圈子排行失败")
			return
		}
		list = append(list, circle)
	}
	s.respond(w, list, "ok")
}

func (s *Server) handleCircleAll(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	page := parsePage(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	circles, total, err := s.searchCircles(ctx, viewerID, "", page)
	if err != nil {
		s.respondError(w, 500, "获取圈子列表失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, circles), "ok")
}

func (s *Server) handleCircleInfo(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	circleID := parseInt64(r.URL.Query().Get("circle_id"), 0)
	if circleID <= 0 {
		s.respondError(w, 400, "圈子不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	circle, err := s.fetchCircleSummary(ctx, viewerID, circleID)
	if err != nil {
		s.respondError(w, 500, "获取圈子详情失败")
		return
	}
	s.respond(w, circle, "ok")
}

func (s *Server) handleCircleUserList(w http.ResponseWriter, r *http.Request) {
	circleID := parseInt64(r.URL.Query().Get("circle_id"), 0)
	if circleID <= 0 {
		s.respondError(w, 400, "圈子不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	users, err := s.fetchCircleUsers(ctx, circleID)
	if err != nil {
		s.respondError(w, 500, "获取圈内成员失败")
		return
	}
	s.respond(w, users, "ok")
}

func (s *Server) handleToggleFollowCircle(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		CircleID int64 `json:"circle_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.CircleID <= 0 {
		s.respondError(w, 400, "圈子参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	exists, err := s.exists(ctx, `SELECT 1 FROM circle_follows WHERE user_id = $1 AND circle_id = $2`, userID, payload.CircleID)
	if err != nil {
		s.respondError(w, 500, "操作失败")
		return
	}
	if exists {
		_, err = s.db.Exec(ctx, `DELETE FROM circle_follows WHERE user_id = $1 AND circle_id = $2`, userID, payload.CircleID)
	} else {
		_, err = s.db.Exec(ctx, `INSERT INTO circle_follows(user_id, circle_id) VALUES ($1, $2)`, userID, payload.CircleID)
	}
	if err != nil {
		s.respondError(w, 500, "操作失败")
		return
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handleUserFollowCircleList(w http.ResponseWriter, r *http.Request) {
	userID := s.currentUserID(r)
	page := parsePage(r)
	if userID == 0 {
		s.respond(w, s.buildPagination(page, 0, []any{}), "ok")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT c.id, COUNT(*) OVER()
		FROM circle_follows cf
		JOIN circles c ON c.id = cf.circle_id
		WHERE cf.user_id = $1
		ORDER BY cf.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, defaultPageSize, offset(page, defaultPageSize))
	if err != nil {
		s.respondError(w, 500, "获取关注圈子失败")
		return
	}
	defer rows.Close()
	var (
		circles []map[string]any
		total   int64
	)
	for rows.Next() {
		var (
			circleID int64
			count    int64
		)
		if err := rows.Scan(&circleID, &count); err != nil {
			s.respondError(w, 500, "读取关注圈子失败")
			return
		}
		total = count
		item, err := s.fetchCircleSummary(ctx, userID, circleID)
		if err != nil {
			s.respondError(w, 500, "整理关注圈子失败")
			return
		}
		circles = append(circles, item)
	}
	s.respond(w, s.buildPagination(page, total, circles), "ok")
}

func (s *Server) handlePostsByCircleID(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	circleID := parseInt64(r.URL.Query().Get("circle_id"), 0)
	page := parsePage(r)
	listType := parseInt(r.URL.Query().Get("type"), 0)
	if circleID <= 0 {
		s.respondError(w, 400, "圈子不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	where := "p.circle_id = $1 AND p.is_deleted = FALSE"
	orderBy := "p.created_at DESC"
	args := []any{circleID}
	if listType == 2 {
		where += " AND p.audit_status <> 1"
	} else {
		where += " AND p.audit_status = 1"
	}
	if listType == 1 {
		orderBy = "p.like_count_cache DESC, p.comment_count_cache DESC, p.created_at DESC"
	}
	args = append(args, defaultPageSize, offset(page, defaultPageSize))
	query := fmt.Sprintf(`
		SELECT p.id, COUNT(*) OVER()
		FROM posts p
		WHERE %s
		ORDER BY %s
		LIMIT $2 OFFSET $3
	`, where, orderBy)
	postIDs, total, err := s.fetchPostIDs(ctx, query, args...)
	if err != nil {
		s.respondError(w, 500, "获取圈子动态失败")
		return
	}
	posts, err := s.buildPosts(ctx, viewerID, postIDs)
	if err != nil {
		s.respondError(w, 500, "整理圈子动态失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, posts), "ok")
}

func (s *Server) handlePostAdd(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload postInput
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "发帖参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	tagIDs := parseTagIDs(payload.Tags)
	imageURLs := parseImageURLs(payload.ImageURLs)
	content := limitString(payload.PostsContent, 3000)
	var postID int64
	err := s.db.QueryRow(ctx, `
		INSERT INTO posts(
			user_id, circle_id, posts_content, address_json, video_url, video_thumb_url, video_height, video_width, audit_status
		) VALUES ($1, $2, $3, NULLIF($4::text, '')::jsonb, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, 0), NULLIF($8, 0), 1)
		RETURNING id
	`, userID, payload.CircleID, content, string(payload.Address), normalizeText(payload.VideoURL), normalizeText(payload.VideoThumbURL), payload.VideoHeight, payload.VideoWidth).Scan(&postID)
	if err != nil {
		s.respondError(w, 500, "发布动态失败")
		return
	}

	for index, url := range imageURLs {
		_, _ = s.db.Exec(ctx, `
			INSERT INTO post_images(post_id, img_url, sort_index)
			VALUES ($1, $2, $3)
		`, postID, url, index)
	}
	for _, tagID := range tagIDs {
		_, _ = s.db.Exec(ctx, `
			INSERT INTO post_tags(post_id, tag_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, postID, tagID)
		_, _ = s.db.Exec(ctx, `UPDATE tags SET hot_score = hot_score + 1 WHERE id = $1`, tagID)
	}

	_ = s.refreshPostCounters(ctx, postID)
	s.respond(w, map[string]any{"id": postID}, "发布成功")
}

func (s *Server) handlePostLike(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		PostsID int64 `json:"posts_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.PostsID <= 0 {
		s.respondError(w, 400, "点赞参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	exists, err := s.exists(ctx, `SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2`, userID, payload.PostsID)
	if err != nil {
		s.respondError(w, 500, "点赞失败")
		return
	}
	if exists {
		_, err = s.db.Exec(ctx, `DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2`, userID, payload.PostsID)
	} else {
		_, err = s.db.Exec(ctx, `INSERT INTO post_likes(user_id, post_id) VALUES ($1, $2)`, userID, payload.PostsID)
		if err == nil {
			s.createNotification(ctx, payload.PostsID, userID, 2, "收到新的点赞")
		}
	}
	if err != nil {
		s.respondError(w, 500, "点赞失败")
		return
	}
	_ = s.refreshPostCounters(ctx, payload.PostsID)
	s.respond(w, true, "操作成功")
}

func (s *Server) handlePostCollect(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		PostsID int64 `json:"posts_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.PostsID <= 0 {
		s.respondError(w, 400, "收藏参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	exists, err := s.exists(ctx, `SELECT 1 FROM post_collects WHERE user_id = $1 AND post_id = $2`, userID, payload.PostsID)
	if err != nil {
		s.respondError(w, 500, "收藏失败")
		return
	}
	if exists {
		_, err = s.db.Exec(ctx, `DELETE FROM post_collects WHERE user_id = $1 AND post_id = $2`, userID, payload.PostsID)
	} else {
		_, err = s.db.Exec(ctx, `INSERT INTO post_collects(user_id, post_id) VALUES ($1, $2)`, userID, payload.PostsID)
		if err == nil {
			s.createNotification(ctx, payload.PostsID, userID, 2, "收到新的收藏")
		}
	}
	if err != nil {
		s.respondError(w, 500, "收藏失败")
		return
	}
	s.respond(w, true, "操作成功")
}

func (s *Server) handlePostDelete(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		PostsID int64 `json:"posts_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.PostsID <= 0 {
		s.respondError(w, 400, "删除参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, err := s.db.Exec(ctx, `
		UPDATE posts
		SET is_deleted = TRUE, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, payload.PostsID, userID)
	if err != nil {
		s.respondError(w, 500, "删除动态失败")
		return
	}
	s.respond(w, true, "删除成功")
}

func (s *Server) handlePostDetail(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	postID := parseInt64(r.URL.Query().Get("posts_id"), 0)
	if postID <= 0 {
		s.respondError(w, 400, "动态不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	post, err := s.buildPost(ctx, viewerID, postID)
	if err != nil {
		s.respondError(w, 500, "获取动态详情失败")
		return
	}
	s.respond(w, post, "ok")
}

func (s *Server) handlePostsByTagWaterfall(w http.ResponseWriter, r *http.Request) {
	s.handlePostsByTag(w, r)
}

func (s *Server) handlePostsByTag(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	tagID := parseInt64(r.URL.Query().Get("tag_id"), 0)
	page := parsePage(r)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	postIDs, total, err := s.fetchPostIDs(ctx, `
		SELECT p.id, COUNT(*) OVER()
		FROM post_tags pt
		JOIN posts p ON p.id = pt.post_id
		WHERE pt.tag_id = $1
			AND p.is_deleted = FALSE
			AND p.audit_status = 1
		ORDER BY p.created_at DESC
		LIMIT $2 OFFSET $3
	`, tagID, defaultPageSize, offset(page, defaultPageSize))
	if err != nil {
		s.respondError(w, 500, "获取标签动态失败")
		return
	}
	posts, err := s.buildPosts(ctx, viewerID, postIDs)
	if err != nil {
		s.respondError(w, 500, "整理标签动态失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, posts), "ok")
}

func (s *Server) handleRewardList(w http.ResponseWriter, r *http.Request) {
	postID := parseInt64(r.URL.Query().Get("posts_id"), 0)
	if postID <= 0 {
		s.respondError(w, 400, "动态不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := s.db.Query(ctx, `
		SELECT pr.id, pr.exceptional_price, pr.created_at, u.id, u.user_name, u.user_avatar
		FROM post_rewards pr
		JOIN users u ON u.id = pr.from_user_id
		WHERE pr.post_id = $1
		ORDER BY pr.created_at DESC
	`, postID)
	if err != nil {
		s.respondError(w, 500, "获取打赏列表失败")
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var (
			id        int64
			price     float64
			createdAt time.Time
			userID    int64
			name      string
			avatar    sql.NullString
		)
		if err := rows.Scan(&id, &price, &createdAt, &userID, &name, &avatar); err != nil {
			s.respondError(w, 500, "读取打赏列表失败")
			return
		}
		list = append(list, map[string]any{
			"id":                id,
			"exceptional_price": price,
			"exceptional_date":  formatListDatetime(createdAt),
			"user": map[string]any{
				"id":          userID,
				"user_name":   name,
				"user_avatar": pickString(avatar, s.assetURL("avatar-default.svg")),
			},
		})
	}
	s.respond(w, list, "ok")
}

func (s *Server) handlePosterPayload(w http.ResponseWriter, r *http.Request) {
	postID := parseInt64(r.URL.Query().Get("posts_id"), 0)
	if postID <= 0 {
		s.respondError(w, 400, "动态不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	post, err := s.buildPost(ctx, s.currentUserID(r), postID)
	if err != nil || post == nil {
		s.respondError(w, 500, "生成海报失败")
		return
	}
	filename := fmt.Sprintf("qrcode-post-%d.png", postID)
	target := s.localUploadPath(filename)
	if _, err := os.Stat(target); err != nil {
		if err := qrcode.WriteFile(fmt.Sprintf("InfiniLink post %d", postID), qrcode.Medium, 256, target); err != nil {
			s.respondError(w, 500, "生成二维码失败")
			return
		}
	}
	image := ""
	if images, ok := post["images"].([]map[string]any); ok && len(images) > 0 {
		if value, ok := images[0]["img_url"].(string); ok {
			image = value
		}
	}
	s.respond(w, map[string]any{
		"img":     image,
		"content": stripHTML(fmt.Sprint(post["posts_content"])),
		"user":    post["user"],
		"qrcode":  s.uploadURL(filename),
	}, "ok")
}

func (s *Server) handleCommentAdd(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload commentInput
	if err := s.decodeJSON(r, &payload); err != nil || payload.PostsID <= 0 {
		s.respondError(w, 400, "评论参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	var commentID int64
	err := s.db.QueryRow(ctx, `
		INSERT INTO comments(post_id, user_id, comment_id, reply_user_id, comment_content, comment_img_url, audit_status)
		VALUES ($1, $2, NULLIF($3, 0), NULLIF($4, 0), NULLIF($5, ''), NULLIF($6, ''), 1)
		RETURNING id
	`, payload.PostsID, userID, payload.CommentID, payload.ReplyUserID, limitString(payload.CommentText, 1000), normalizeText(payload.CommentImgURL)).Scan(&commentID)
	if err != nil {
		s.respondError(w, 500, "评论失败")
		return
	}
	_ = s.refreshPostCounters(ctx, payload.PostsID)
	s.createNotification(ctx, payload.PostsID, userID, 3, "收到新的评论")
	s.respond(w, map[string]any{"id": commentID}, "评论成功")
}

func (s *Server) handleCommentsByPost(w http.ResponseWriter, r *http.Request) {
	viewerID := s.currentUserID(r)
	postID := parseInt64(r.URL.Query().Get("posts_id"), 0)
	page := parsePage(r)
	if postID <= 0 {
		s.respondError(w, 400, "动态不存在")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	comments, total, err := s.fetchCommentTree(ctx, viewerID, postID, page)
	if err != nil {
		s.respondError(w, 500, "获取评论失败")
		return
	}
	s.respond(w, s.buildPagination(page, total, comments), "ok")
}

func (s *Server) handleCommentLike(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		CommentID int64 `json:"comment_id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.CommentID <= 0 {
		s.respondError(w, 400, "评论点赞参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	exists, err := s.exists(ctx, `SELECT 1 FROM comment_likes WHERE user_id = $1 AND comment_id = $2`, userID, payload.CommentID)
	if err != nil {
		s.respondError(w, 500, "评论点赞失败")
		return
	}
	if exists {
		_, err = s.db.Exec(ctx, `DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2`, userID, payload.CommentID)
	} else {
		_, err = s.db.Exec(ctx, `INSERT INTO comment_likes(user_id, comment_id) VALUES ($1, $2)`, userID, payload.CommentID)
	}
	if err != nil {
		s.respondError(w, 500, "评论点赞失败")
		return
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE comments
		SET like_count_cache = COALESCE((SELECT COUNT(*) FROM comment_likes WHERE comment_id = $1), 0),
			updated_at = NOW()
		WHERE id = $1
	`, payload.CommentID)
	s.respond(w, true, "操作成功")
}

func (s *Server) handleCommentDelete(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	var payload struct {
		ID int64 `json:"id"`
	}
	if err := s.decodeJSON(r, &payload); err != nil || payload.ID <= 0 {
		s.respondError(w, 400, "删除评论参数不正确")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	var postID int64
	err := s.db.QueryRow(ctx, `
		UPDATE comments
		SET is_deleted = TRUE, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING post_id
	`, payload.ID, userID).Scan(&postID)
	if err != nil {
		s.respondError(w, 500, "删除评论失败")
		return
	}
	_ = s.refreshPostCounters(ctx, postID)
	s.respond(w, true, "删除成功")
}

func (s *Server) searchCircles(ctx context.Context, viewerID int64, keyword string, page int) ([]map[string]any, int64, error) {
	pattern := "%" + keyword + "%"
	rows, err := s.db.Query(ctx, `
		SELECT id, COUNT(*) OVER()
		FROM circles
		WHERE ($1 = '%%' OR circle_name ILIKE $1 OR circle_introduce ILIKE $1)
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, pattern, defaultPageSize, offset(page, defaultPageSize))
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var (
		circles []map[string]any
		total   int64
	)
	for rows.Next() {
		var (
			circleID int64
			count    int64
		)
		if err := rows.Scan(&circleID, &count); err != nil {
			return nil, 0, err
		}
		total = count
		item, err := s.fetchCircleSummary(ctx, viewerID, circleID)
		if err != nil {
			return nil, 0, err
		}
		circles = append(circles, item)
	}
	return circles, total, rows.Err()
}

func (s *Server) searchUsers(ctx context.Context, viewerID int64, keyword string, page int) ([]map[string]any, int64, error) {
	pattern := "%" + keyword + "%"
	rows, err := s.db.Query(ctx, `
		SELECT id, user_name, user_avatar, user_introduce, COUNT(*) OVER()
		FROM users
		WHERE ($1 = '%%' OR user_name ILIKE $1 OR user_introduce ILIKE $1)
		ORDER BY id DESC
		LIMIT $2 OFFSET $3
	`, pattern, defaultSearchSize, offset(page, defaultSearchSize))
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var (
		users []map[string]any
		total int64
	)
	for rows.Next() {
		var (
			id        int64
			name      string
			avatar    sql.NullString
			introduce sql.NullString
			count     int64
		)
		if err := rows.Scan(&id, &name, &avatar, &introduce, &count); err != nil {
			return nil, 0, err
		}
		total = count
		users = append(users, map[string]any{
			"id":             id,
			"user_avatar":    pickString(avatar, s.assetURL("avatar-default.svg")),
			"weixin_name":    name,
			"user_introduce": nullableString(introduce),
		})
	}
	return users, total, rows.Err()
}

func (s *Server) createNotification(ctx context.Context, postID, actorUserID int64, notifType int, title string) {
	var (
		postOwnerID int64
		actorName   string
	)
	if err := s.db.QueryRow(ctx, `SELECT user_id FROM posts WHERE id = $1`, postID).Scan(&postOwnerID); err != nil {
		return
	}
	if postOwnerID == actorUserID {
		return
	}
	_ = s.db.QueryRow(ctx, `SELECT user_name FROM users WHERE id = $1`, actorUserID).Scan(&actorName)
	content := fmt.Sprintf("<p>%s 与你的内容产生了新的互动。</p>", actorName)
	_, _ = s.db.Exec(ctx, `
		INSERT INTO notifications(user_id, type, title, content, qh_image, posts_id, is_read)
		VALUES ($1, $2, $3, $4, $5, $6, 0)
	`, postOwnerID, notifType, title, content, s.assetURL("avatar-default.svg"), postID)
}
