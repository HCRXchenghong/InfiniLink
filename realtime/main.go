package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type userClaims struct {
	UserID int64 `json:"uid"`
	jwt.RegisteredClaims
}

type envConfig struct {
	HTTPAddr          string
	DatabaseURL       string
	RedisAddr         string
	RedisUsername     string
	RedisPassword     string
	RedisDB           int
	JWTSecret         string
	PresenceTTL       time.Duration
	HeartbeatInterval time.Duration
	ShutdownTimeout   time.Duration
	ReadBufferSize    int
	WriteBufferSize   int
}

type userProfile struct {
	ID     int64
	Name   string
	Avatar string
}

type userAccessState struct {
	AccountStatus string
	BanReason     string
	BannedAt      string
}

type incomingMessage struct {
	Type        string `json:"type"`
	ReceiverID  int64  `json:"receiver_id"`
	OID         int64  `json:"oid"`
	ChatContent string `json:"chat_content"`
	ChatImage   string `json:"chat_image"`
}

type outboundEvent struct {
	Type    string         `json:"type"`
	Targets []int64        `json:"targets"`
	Message map[string]any `json:"message,omitempty"`
	Meta    map[string]any `json:"meta,omitempty"`
}

type wsClient struct {
	server *wsServer
	conn   *websocket.Conn
	send   chan []byte
	user   userProfile
}

type hub struct {
	mu    sync.RWMutex
	users map[int64]map[*wsClient]struct{}
}

type wsServer struct {
	cfg      envConfig
	db       *pgxpool.Pool
	redis    *redis.Client
	upgrader websocket.Upgrader
	hub      *hub
}

func main() {
	cfg := loadConfig()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect postgres: %v", err)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		log.Fatalf("ping postgres: %v", err)
	}

	cache := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Username: cfg.RedisUsername,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	defer cache.Close()
	if err := cache.Ping(ctx).Err(); err != nil {
		log.Fatalf("ping redis: %v", err)
	}

	server := &wsServer{
		cfg:   cfg,
		db:    db,
		redis: cache,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  cfg.ReadBufferSize,
			WriteBufferSize: cfg.WriteBufferSize,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		hub: &hub{users: make(map[int64]map[*wsClient]struct{})},
	}

	go server.consumeRealtimeEvents()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", server.handleHealth)
	mux.HandleFunc("/readyz", server.handleReady)
	mux.HandleFunc("/ws", server.handleWS)

	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("realtime service listening on %s", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen realtime: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer shutdownCancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

func loadConfig() envConfig {
	return envConfig{
		HTTPAddr:          getEnv("REALTIME_ADDR", ":8090"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/infinilink?sslmode=disable"),
		RedisAddr:         getEnv("REDIS_ADDR", "127.0.0.1:6379"),
		RedisUsername:     getEnv("REDIS_USERNAME", ""),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		RedisDB:           getEnvInt("REDIS_DB", 0),
		JWTSecret:         getEnv("JWT_SECRET", "change-me-in-production"),
		PresenceTTL:       getEnvDuration("REALTIME_PRESENCE_TTL", 90*time.Second),
		HeartbeatInterval: getEnvDuration("REALTIME_HEARTBEAT_INTERVAL", 25*time.Second),
		ShutdownTimeout:   getEnvDuration("REALTIME_SHUTDOWN_TIMEOUT", 15*time.Second),
		ReadBufferSize:    getEnvInt("REALTIME_READ_BUFFER_SIZE", 1024),
		WriteBufferSize:   getEnvInt("REALTIME_WRITE_BUFFER_SIZE", 1024),
	}
}

func (s *wsServer) handleHealth(w http.ResponseWriter, _ *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{"service": "infinilink-realtime", "ok": true})
}

func (s *wsServer) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "postgres"})
		return
	}
	if err := s.redis.Ping(ctx).Err(); err != nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "redis"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *wsServer) handleWS(w http.ResponseWriter, r *http.Request) {
	userID, err := s.authenticateRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	profile, err := s.fetchUserProfile(r.Context(), userID)
	if err != nil {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &wsClient{
		server: s,
		conn:   conn,
		send:   make(chan []byte, 64),
		user:   profile,
	}
	s.hub.add(client)
	s.markPresence(r.Context(), userID)

	go client.writePump()
	client.readPump()
}

func (c *wsClient) readPump() {
	defer func() {
		c.server.hub.remove(c)
		_ = c.conn.Close()
	}()

	_ = c.conn.SetReadDeadline(time.Now().Add(c.server.cfg.PresenceTTL))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(c.server.cfg.PresenceTTL))
		c.server.markPresence(context.Background(), c.user.ID)
		return nil
	})

	for {
		_, payload, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		var incoming incomingMessage
		if err := json.Unmarshal(payload, &incoming); err != nil {
			continue
		}

		switch strings.ToLower(strings.TrimSpace(incoming.Type)) {
		case "ping":
			c.server.markPresence(context.Background(), c.user.ID)
			c.sendJSON(outboundEvent{Type: "pong", Targets: []int64{c.user.ID}, Meta: map[string]any{"ts": time.Now().Unix()}})
		case "chat.send":
			state, stateErr := c.server.fetchUserAccessState(context.Background(), c.user.ID)
			if stateErr == nil && strings.EqualFold(state.AccountStatus, "banned") {
				c.sendJSON(outboundEvent{
					Type:    "session.force_logout",
					Targets: []int64{c.user.ID},
					Meta: map[string]any{
						"reason":    firstNonEmpty(state.BanReason, "平台管理员已对该账号执行封禁"),
						"banned_at": state.BannedAt,
					},
				})
				return
			}
			if incoming.ReceiverID <= 0 {
				continue
			}
			event, err := c.server.persistChatMessage(context.Background(), c.user, incoming.ReceiverID, incoming.ChatContent, incoming.ChatImage)
			if err != nil {
				c.sendJSON(outboundEvent{Type: "chat.error", Targets: []int64{c.user.ID}, Meta: map[string]any{"message": "发送失败，请稍后重试"}})
				continue
			}
			c.server.publishEvent(context.Background(), event)
		case "chat.read":
			targetID := incoming.OID
			if targetID <= 0 {
				targetID = incoming.ReceiverID
			}
			if targetID <= 0 {
				continue
			}
			_, _ = c.server.db.Exec(context.Background(), `
				UPDATE chat_messages
				SET is_read = TRUE
				WHERE sender_id = $1 AND receiver_id = $2
			`, targetID, c.user.ID)
			c.server.publishEvent(context.Background(), outboundEvent{
				Type:    "notification.refresh",
				Targets: []int64{targetID, c.user.ID},
				Meta:    map[string]any{"scope": "chat.read"},
			})
		}
	}
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(c.server.cfg.HeartbeatInterval)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.server.markPresence(context.Background(), c.user.ID)
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				return
			}
		}
	}
}

func (c *wsClient) sendJSON(event outboundEvent) {
	raw, err := json.Marshal(event)
	if err != nil {
		return
	}
	select {
	case c.send <- raw:
	default:
	}
}

func (h *hub) add(client *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.users[client.user.ID] == nil {
		h.users[client.user.ID] = make(map[*wsClient]struct{})
	}
	h.users[client.user.ID][client] = struct{}{}
}

func (h *hub) remove(client *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.users[client.user.ID]
	if clients == nil {
		return
	}
	delete(clients, client)
	close(client.send)
	if len(clients) == 0 {
		delete(h.users, client.user.ID)
	}
}

func (h *hub) dispatch(event outboundEvent) {
	raw, err := json.Marshal(event)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, target := range event.Targets {
		for client := range h.users[target] {
			select {
			case client.send <- raw:
			default:
			}
		}
	}
}

func (s *wsServer) authenticateRequest(r *http.Request) (int64, error) {
	tokenString := strings.TrimSpace(r.URL.Query().Get("token"))
	if tokenString == "" {
		tokenString = strings.TrimSpace(r.Header.Get("token"))
	}
	if tokenString == "" {
		tokenString = strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(strings.ToLower(tokenString), "bearer ") {
			tokenString = strings.TrimSpace(tokenString[7:])
		}
	}
	if tokenString == "" {
		return 0, errors.New("missing token")
	}

	claims := &userClaims{}
	parsed, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil || !parsed.Valid || claims.UserID <= 0 {
		return 0, errors.New("invalid token")
	}
	state, err := s.fetchUserAccessState(r.Context(), claims.UserID)
	if err != nil {
		return 0, err
	}
	if strings.EqualFold(state.AccountStatus, "banned") {
		return 0, errors.New("banned user")
	}
	return claims.UserID, nil
}

func (s *wsServer) fetchUserProfile(ctx context.Context, userID int64) (userProfile, error) {
	var profile userProfile
	var avatar sql.NullString
	err := s.db.QueryRow(ctx, `
		SELECT id, user_name, COALESCE(user_avatar, '')
		FROM users
		WHERE id = $1
	`, userID).Scan(&profile.ID, &profile.Name, &avatar)
	if err != nil {
		return userProfile{}, err
	}
	profile.Avatar = strings.TrimSpace(avatar.String)
	if profile.Avatar == "" {
		profile.Avatar = "http://127.0.0.1/assets/avatar-default.svg"
	}
	return profile, nil
}

func (s *wsServer) fetchUserAccessState(ctx context.Context, userID int64) (userAccessState, error) {
	var (
		state    userAccessState
		bannedAt sql.NullTime
	)
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE(account_status, 'active'),
			COALESCE(admin_note, ''),
			banned_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&state.AccountStatus, &state.BanReason, &bannedAt)
	if err != nil {
		return userAccessState{}, err
	}
	state.AccountStatus = strings.ToLower(strings.TrimSpace(state.AccountStatus))
	state.BanReason = strings.TrimSpace(state.BanReason)
	if bannedAt.Valid {
		state.BannedAt = bannedAt.Time.Format("2006-01-02 15:04")
	}
	return state, nil
}

func (s *wsServer) persistChatMessage(ctx context.Context, sender userProfile, receiverID int64, content, image string) (outboundEvent, error) {
	content = strings.TrimSpace(content)
	image = strings.TrimSpace(image)
	if content == "" && image == "" {
		return outboundEvent{}, errors.New("empty message")
	}

	var id int64
	var createdAt time.Time
	err := s.db.QueryRow(ctx, `
		INSERT INTO chat_messages(sender_id, receiver_id, chat_content, chat_image, is_read, created_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), FALSE, NOW())
		RETURNING id, created_at
	`, sender.ID, receiverID, content, image).Scan(&id, &createdAt)
	if err != nil {
		return outboundEvent{}, err
	}

	message := map[string]any{
		"id":           id,
		"sender_id":    sender.ID,
		"receiver_id":  receiverID,
		"object_id":    receiverID,
		"chat_content": content,
		"chat_image":   image,
		"datetime":     createdAt.Format("2006-01-02 15:04"),
		"user": map[string]any{
			"id":          sender.ID,
			"user_name":   sender.Name,
			"user_avatar": sender.Avatar,
		},
		"imgList": buildImageList(image),
	}

	return outboundEvent{
		Type:    "chat.message",
		Targets: []int64{sender.ID, receiverID},
		Message: message,
	}, nil
}

func (s *wsServer) consumeRealtimeEvents() {
	pubsub := s.redis.Subscribe(context.Background(), "realtime:events")
	defer pubsub.Close()

	channel := pubsub.Channel()
	for msg := range channel {
		var event outboundEvent
		if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
			continue
		}
		s.hub.dispatch(event)
	}
}

func (s *wsServer) publishEvent(ctx context.Context, event outboundEvent) {
	raw, err := json.Marshal(event)
	if err != nil {
		return
	}
	_ = s.redis.Publish(ctx, "realtime:events", raw).Err()
}

func (s *wsServer) markPresence(ctx context.Context, userID int64) {
	_ = s.redis.ZAdd(ctx, "realtime:presence:last_seen", redis.Z{
		Score:  float64(time.Now().Unix()),
		Member: strconv.FormatInt(userID, 10),
	}).Err()
}

func buildImageList(url string) []map[string]any {
	if strings.TrimSpace(url) == "" {
		return []map[string]any{}
	}
	return []map[string]any{{"img_url": url}}
}

func respondJSON(w http.ResponseWriter, code int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
