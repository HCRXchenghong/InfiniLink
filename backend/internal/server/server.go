package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/HCRXchenghong/InfiniLink/backend/internal/config"
	"github.com/HCRXchenghong/InfiniLink/backend/internal/migrate"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type contextKey string

const userContextKey contextKey = "viewer_user_id"
const adminContextKey contextKey = "admin_username"

type Server struct {
	cfg        config.Config
	db         *pgxpool.Pool
	redis      *redis.Client
	httpClient *http.Client
	inflight   chan struct{}
	router     http.Handler
}

type apiResponse struct {
	Code    int    `json:"code"`
	Status  bool   `json:"status"`
	Message string `json:"message,omitempty"`
	Data    any    `json:"data,omitempty"`
}

type jwtClaims struct {
	UserID int64 `json:"uid"`
	jwt.RegisteredClaims
}

type adminClaims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func New(cfg config.Config) (*Server, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}
	if err := os.MkdirAll(cfg.AssetsDir, 0o755); err != nil {
		return nil, fmt.Errorf("create assets dir: %w", err)
	}

	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse postgres config: %w", err)
	}
	dbConfig.MaxConns = cfg.DBMaxConns
	dbConfig.MinConns = cfg.DBMinConns
	dbConfig.MaxConnLifetime = cfg.DBMaxConnLifetime
	dbConfig.MaxConnIdleTime = cfg.DBMaxConnIdleTime
	dbConfig.HealthCheckPeriod = cfg.DBHealthCheck
	if dbConfig.ConnConfig.RuntimeParams == nil {
		dbConfig.ConnConfig.RuntimeParams = map[string]string{}
	}
	dbConfig.ConnConfig.RuntimeParams["application_name"] = cfg.AppName

	db, err := pgxpool.NewWithConfig(ctx, dbConfig)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := db.Ping(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	if cfg.AutoMigrate {
		if err := migrate.Run(ctx, db); err != nil {
			db.Close()
			return nil, fmt.Errorf("run migrations: %w", err)
		}
	}

	cache := redis.NewClient(&redis.Options{
		Addr:         cfg.RedisAddr,
		Username:     cfg.RedisUsername,
		Password:     cfg.RedisPassword,
		DB:           cfg.RedisDB,
		PoolSize:     cfg.RedisPoolSize,
		MinIdleConns: minInt(cfg.RedisMinIdleConns, minInt(cfg.RedisPoolSize/8, 8)),
		MaxRetries:   cfg.RedisMaxRetries,
		DialTimeout:  cfg.RedisDialTimeout,
		ReadTimeout:  cfg.RedisReadTimeout,
		WriteTimeout: cfg.RedisWriteTimeout,
		PoolTimeout:  cfg.RedisPoolTimeout,
	})
	if err := cache.Ping(ctx).Err(); err != nil {
		log.Printf("redis unavailable, continuing without cache: %v", err)
		cache = nil
	}

	var inflight chan struct{}
	if cfg.InflightLimit > 0 {
		inflight = make(chan struct{}, cfg.InflightLimit)
	}

	s := &Server{
		cfg:   cfg,
		db:    db,
		redis: cache,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				Proxy:               http.ProxyFromEnvironment,
				MaxIdleConns:        256,
				MaxIdleConnsPerHost: 128,
				MaxConnsPerHost:     256,
				IdleConnTimeout:     90 * time.Second,
				ForceAttemptHTTP2:   true,
			},
		},
		inflight: inflight,
	}
	s.router = s.routes()
	return s, nil
}

func (s *Server) Close() {
	if s.redis != nil {
		_ = s.redis.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}

func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(s.limitInflight)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(s.cors)
	r.Use(s.optionalAuth)

	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadDir))))
	r.Handle("/assets/*", http.StripPrefix("/assets/", http.FileServer(http.Dir(s.cfg.AssetsDir))))
	r.HandleFunc("/storage/*", s.handleLegacyStorage)
	r.Post("/payments/wechat/notify", s.handleWechatPayNotify)
	r.Post("/payments/ifpay/notify", s.handleIFPayNotify)
	r.Get("/api/v1/payment/ifpay/oauth/callback", s.handleIFPayOAuthCallback)

	r.Route("/api/admin/v1", func(admin chi.Router) {
		admin.Post("/login", s.handleAdminLogin)
		admin.Group(func(secure chi.Router) {
			secure.Use(s.requireAdmin)
			secure.Get("/dashboard", s.handleAdminDashboard)
			secure.Get("/users", s.handleAdminUsers)
			secure.Post("/users/{userID}/action", s.handleAdminUserAction)
			secure.Get("/authentications", s.handleAdminAuthentications)
			secure.Post("/authentications/{authID}/action", s.handleAdminAuthenticationAction)
			secure.Get("/posts", s.handleAdminPosts)
			secure.Post("/posts/{postID}/action", s.handleAdminPostAction)
			secure.Get("/circles", s.handleAdminCircles)
			secure.Post("/circles/{circleID}/action", s.handleAdminCircleAction)
			secure.Get("/feedbacks", s.handleAdminFeedbacks)
			secure.Post("/feedbacks/{feedbackID}/action", s.handleAdminFeedbackAction)
			secure.Get("/orders", s.handleAdminOrders)
			secure.Get("/revenue", s.handleAdminRevenue)
			secure.Get("/messages", s.handleAdminMessages)
			secure.Get("/messages/{userID}", s.handleAdminMessageThread)
			secure.Post("/messages/{userID}/reply", s.handleAdminMessageReply)
			secure.Get("/risk", s.handleAdminRisk)
			secure.Post("/risk/keywords", s.handleAdminRiskKeywords)
			secure.Get("/system", s.handleAdminSystem)
			secure.Post("/system/ads", s.handleAdminSystemAds)
			secure.Post("/system/membership", s.handleAdminSystemMembership)
			secure.Post("/system/growth-rules", s.handleAdminSystemGrowthRules)
			secure.Get("/devops", s.handleAdminDevops)
		})
	})

	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/login", s.handleLogin)
		api.Get("/configData", s.handleConfigData)
		api.Get("/ads", s.handleOperationAds)
		api.Get("/common/getClauseDetail", s.handleClauseDetail)
		api.Post("/files/uploads", s.handleUpload)

		api.Get("/index/banner", s.handleIndexBanner)
		api.Get("/index/posts", s.handleIndexPosts)
		api.Get("/index/choiceness", s.handleIndexChoiceness)
		api.Get("/index/search", s.handleIndexSearch)
		api.Get("/search/count", s.handleSearchCount)
		api.Get("/search/hot/list", s.handleSearchHotList)
		api.Get("/search/carousel/list", s.handleSearchCarouselList)
		api.Get("/tags/hot", s.handleTagsHot)
		api.Get("/tags/recommend", s.handleTagsRecommend)
		api.Post("/tags/add", s.handleTagsAdd)

		api.Get("/posts/plate/options", s.handlePlateOptions)
		api.Get("/posts/plate/list", s.handlePlateList)
		api.Get("/posts/circle/byplateid", s.handleCircleByPlateID)
		api.Get("/posts/circle/search", s.handleCircleSearch)
		api.Post("/posts/add/circle", s.handleAddCircle)
		api.Get("/circle/recommend", s.handleCircleRecommend)
		api.Get("/circle/hot", s.handleCircleHot)
		api.Get("/circle/circleAndPosts", s.handleCircleAll)
		api.Get("/circle/info", s.handleCircleInfo)
		api.Get("/circle/getCircleUserList", s.handleCircleUserList)
		api.Post("/user/follow/circle", s.handleToggleFollowCircle)
		api.Get("/user/follow/CircleList", s.handleUserFollowCircleList)
		api.Get("/posts/byCircleId", s.handlePostsByCircleID)

		api.Post("/post/add", s.handlePostAdd)
		api.Post("/posts/like", s.handlePostLike)
		api.Post("/posts/collect", s.handlePostCollect)
		api.Post("/posts/delete", s.handlePostDelete)
		api.Get("/posts/detail", s.handlePostDetail)
		api.Get("/posts/tags", s.handlePostsByTagWaterfall)
		api.Get("/posts/tagsv2", s.handlePostsByTag)
		api.Get("/posts/getExceptionalList", s.handleRewardList)
		api.Get("/posts/makeShowQcode", s.handlePosterPayload)

		api.Post("/comment/add", s.handleCommentAdd)
		api.Get("/comment/byPostsId", s.handleCommentsByPost)
		api.Post("/comment/like/add", s.handleCommentLike)
		api.Post("/comment/delete", s.handleCommentDelete)

		api.Get("/user/info", s.handleUserInfo)
		api.Post("/user/update/info", s.handleUpdateUserInfo)
		api.Post("/user/follow", s.handleToggleFollowUser)
		api.Get("/user/posts", s.handleUserPosts)
		api.Get("/user/totalPost", s.handleUserTotalPost)
		api.Post("/feedback/add", s.handleFeedbackAdd)
		api.Get("/user/authentication", s.handleUserAuthentication)
		api.Post("/user/authentication", s.handleSubmitAuthentication)
		api.Get("/user/cricle", s.handleUserCircles)
		api.Get("/user/info/byUserId", s.handleUserInfoByID)
		api.Get("/user/posts/byUserId", s.handleUserPostsByID)
		api.Get("/user/followUser", s.handleFollowUsers)
		api.Get("/user/fansUser", s.handleFansUsers)
		api.Get("/user/myOrder", s.handleMyOrders)
		api.Get("/user/myFinancial", s.handleMyFinancial)
		api.Post("/user/initiateWithdrawal", s.handleInitiateWithdrawal)
		api.Get("/user/myUserWithdrawal", s.handleMyWithdrawals)
		api.Get("/user/myUserExceptional", s.handleMyRewards)
		api.Get("/user/freeGetVip", s.handleFreeGetVIP)
		api.Post("/user/activity/ping", s.handleUserActivityPing)
		api.Get("/user/plate", s.handleUserPlates)
		api.Post("/user/plate/add", s.handleUserPlateAdd)
		api.Post("/user/plate/delete", s.handleUserPlateDelete)
		api.Post("/user/auditPosts", s.handleAuditPosts)
		api.Get("/user/myDelSearch", s.handleDeleteSearchHistoryOne)
		api.Get("/user/myDelAllSearch", s.handleDeleteSearchHistoryAll)

		api.Get("/search/my/list", s.handleMySearchList)

		api.Get("/massages/info", s.handleMessagesSummary)
		api.Get("/massages/getDetailsMessages", s.handleMessagesDetail)
		api.Get("/massages/readMessages", s.handleReadMessages)
		api.Post("/massages/readMessages", s.handleReadMessages)
		api.Post("/massages/addChat", s.handleAddChat)
		api.Get("/massages/customerService", s.handleCustomerServiceProfile)
		api.Get("/massages/getUserChat", s.handleGetUserChat)
		api.Get("/massages/getUserChatList", s.handleGetUserChatList)
		api.Get("/massages/readUserChat", s.handleReadUserChat)
		api.Post("/massages/readUserChat", s.handleReadUserChat)
		api.Get("/massages/getSysMessageCount", s.handleSysMessageCount)
		api.Get("/massages/userDelMessage", s.handleDeleteMessageThread)
		api.Post("/massages/userDelMessage", s.handleDeleteMessageThread)

		api.Post("/order", s.handleOrder)
		api.Get("/payment/options", s.handlePaymentOptions)
		api.Get("/payment/ifpay/oauth/start", s.handleIFPayOAuthStart)
		api.Get("/payment/ifpay/oauth/status", s.handleIFPayOAuthStatus)
		api.Get("/order/status", s.handleOrderStatus)
		api.Get("/getMembersPrice", s.handleMembersPrice)
		api.Get("/wx_login", s.handlePCLogin)
		api.Post("/wx_login", s.handlePCLogin)
	})

	return r
}

func (s *Server) limitInflight(next http.Handler) http.Handler {
	if s.inflight == nil {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/healthz", "/readyz":
			next.ServeHTTP(w, r)
			return
		}

		select {
		case s.inflight <- struct{}{}:
			defer func() { <-s.inflight }()
			next.ServeHTTP(w, r)
		default:
			s.respondError(w, http.StatusServiceUnavailable, "系统繁忙，请稍后重试")
		}
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) optionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := strings.TrimSpace(r.Header.Get("token"))
		if tokenString == "" {
			next.ServeHTTP(w, r)
			return
		}

		claims := &jwtClaims{}
		parsed, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(s.cfg.JWTSecret), nil
		})
		if err == nil && parsed.Valid && claims.UserID > 0 {
			state, stateErr := s.loadAccountAccessState(r.Context(), claims.UserID)
			if stateErr == nil && strings.EqualFold(state.AccountStatus, "banned") {
				s.respondUserBanned(w, state)
				return
			}
			r = r.WithContext(context.WithValue(r.Context(), userContextKey, claims.UserID))
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.respond(w, map[string]any{
		"service": "infinilink-backend",
		"time":    time.Now().Format(time.RFC3339),
	}, "ok")
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := s.db.Ping(ctx); err != nil {
		s.respondError(w, 500, "postgres not ready")
		return
	}
	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			s.respondError(w, 500, "redis not ready")
			return
		}
	}
	s.respond(w, map[string]any{
		"postgres": true,
		"redis":    s.redis != nil,
	}, "ok")
}

func (s *Server) handleLegacyStorage(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join(s.cfg.AssetsDir, "illustrations", "social-media-rafiki.png"))
}

func (s *Server) respond(w http.ResponseWriter, data any, message string) {
	s.respondWithCode(w, 200, true, message, data)
}

func (s *Server) respondError(w http.ResponseWriter, code int, message string) {
	s.respondWithCode(w, code, false, message, nil)
}

func (s *Server) respondWithCode(w http.ResponseWriter, code int, status bool, message string, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(apiResponse{
		Code:    code,
		Status:  status,
		Message: message,
		Data:    normalizeResponseData(data),
	})
}

func normalizeResponseData(data any) any {
	return normalizeJSONValue(reflect.ValueOf(data))
}

func normalizeJSONValue(value reflect.Value) any {
	if !value.IsValid() {
		return nil
	}

	switch value.Kind() {
	case reflect.Interface, reflect.Pointer:
		if value.IsNil() {
			return nil
		}
		return normalizeJSONValue(value.Elem())
	case reflect.Map:
		if value.IsNil() {
			return nil
		}
		normalized := make(map[string]any, value.Len())
		iter := value.MapRange()
		for iter.Next() {
			normalized[fmt.Sprint(iter.Key().Interface())] = normalizeJSONValue(iter.Value())
		}
		return normalized
	case reflect.Slice:
		if value.IsNil() {
			return []any{}
		}
		return value.Interface()
	default:
		return value.Interface()
	}
}

func (s *Server) unauthorized(w http.ResponseWriter) {
	s.respondError(w, 503002, "请先登录")
}

func (s *Server) currentUserID(r *http.Request) int64 {
	value := r.Context().Value(userContextKey)
	if value == nil {
		return 0
	}
	id, _ := value.(int64)
	return id
}

func (s *Server) requireUserID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	uid := s.currentUserID(r)
	if uid == 0 {
		s.unauthorized(w)
		return 0, false
	}
	if state, err := s.loadAccountAccessState(r.Context(), uid); err == nil && strings.EqualFold(state.AccountStatus, "banned") {
		s.respondUserBanned(w, state)
		return 0, false
	}
	return uid, true
}

func (s *Server) signToken(userID int64) (string, error) {
	now := time.Now()
	claims := jwtClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.TokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
			Issuer:    "infinilink-backend",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *Server) signAdminToken(username string) (string, error) {
	now := time.Now()
	claims := adminClaims{
		Username: username,
		Role:     "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AdminTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
			Issuer:    "infinilink-admin",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(strings.ToLower(tokenString), "bearer ") {
			tokenString = strings.TrimSpace(tokenString[7:])
		}
		if tokenString == "" {
			tokenString = strings.TrimSpace(r.Header.Get("token"))
		}
		if tokenString == "" {
			s.respondError(w, http.StatusUnauthorized, "管理员未登录")
			return
		}

		claims := &adminClaims{}
		parsed, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(s.cfg.JWTSecret), nil
		})
		if err != nil || !parsed.Valid || claims.Role != "admin" || strings.TrimSpace(claims.Username) == "" {
			s.respondError(w, http.StatusUnauthorized, "管理员身份无效")
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), adminContextKey, claims.Username)))
	})
}

func (s *Server) currentAdmin(r *http.Request) string {
	value := r.Context().Value(adminContextKey)
	if value == nil {
		return ""
	}
	admin, _ := value.(string)
	return admin
}

func (s *Server) decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}

func parseInt64(value string, fallback int64) int64 {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func parsePage(r *http.Request) int {
	page := parseInt(r.URL.Query().Get("page"), 1)
	if page < 1 {
		return 1
	}
	return page
}

func offset(page, pageSize int) int {
	if page <= 1 {
		return 0
	}
	return (page - 1) * pageSize
}

func stableHash(parts ...string) string {
	hash := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(hash[:])
}

func normalizeText(value string) string {
	return strings.TrimSpace(strings.ReplaceAll(value, "\u0000", ""))
}

func limitString(value string, max int) string {
	value = normalizeText(value)
	if len([]rune(value)) <= max {
		return value
	}
	return string([]rune(value)[:max])
}

func formatRelativeTime(t time.Time) string {
	now := time.Now()
	if t.IsZero() {
		return ""
	}
	diff := now.Sub(t)
	switch {
	case diff < time.Minute:
		return "刚刚"
	case diff < time.Hour:
		return fmt.Sprintf("%d分钟前", int(diff.Minutes()))
	case diff < 24*time.Hour:
		return fmt.Sprintf("%d小时前", int(diff.Hours()))
	case diff < 30*24*time.Hour:
		return fmt.Sprintf("%d天前", int(diff.Hours()/24))
	default:
		return t.Format("2006-01-02")
	}
}

func formatListDatetime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02 15:04")
}

func (s *Server) publicURL(path string) string {
	path = strings.TrimLeft(path, "/")
	return strings.TrimRight(s.cfg.PublicBaseURL, "/") + "/" + path
}

func (s *Server) assetURL(name string) string {
	return s.publicURL("assets/" + name)
}

func (s *Server) uploadURL(name string) string {
	return s.publicURL("uploads/" + name)
}

func (s *Server) localUploadPath(name string) string {
	return filepath.Join(s.cfg.UploadDir, name)
}

func minInt(value, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}
