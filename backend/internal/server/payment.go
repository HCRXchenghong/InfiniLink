package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type orderRequest struct {
	Type           int             `json:"type"`
	Parame         json.RawMessage `json:"parame"`
	PaymentMethod  string          `json:"payment_method"`
	Platform       string          `json:"platform"`
	IdempotencyKey string          `json:"idempotency_key"`
	Description    string          `json:"description"`
}

type rewardOrderMeta struct {
	RewardPrice float64 `json:"rewardPrice"`
	PostsID     int64   `json:"postsId"`
	PostsUserID int64   `json:"postsUserId"`
}

type orderRow struct {
	ID              int64
	UserID          int64
	OrderNumber     string
	OrderType       int
	OrderPayPrice   float64
	PostsID         sql.NullInt64
	Status          string
	Provider        string
	ProviderOrderID sql.NullString
	IdempotencyKey  sql.NullString
	PaymentPayload  []byte
	PaymentMeta     []byte
	FailureReason   string
	PaidAt          sql.NullTime
	CreatedAt       time.Time
}

type ifPayResponseEnvelope struct {
	Code    any             `json:"code"`
	Message string          `json:"message"`
	Success bool            `json:"success"`
	Status  any             `json:"status"`
	Data    json.RawMessage `json:"data"`
}

func (s *Server) handlePaymentOptions(w http.ResponseWriter, r *http.Request) {
	options := []map[string]any{
		{
			"value":   "wechat",
			"label":   "微信支付",
			"enabled": s.wechatPayReady(),
			"tip":     "小程序客户端拉起支付",
		},
		{
			"value":   "ifpay",
			"label":   "IF-Pay 余额支付",
			"enabled": strings.TrimSpace(s.cfg.IfPayBaseURL) != "",
			"tip":     "走 Infinitech 钱包支付中心",
		},
	}
	s.respond(w, map[string]any{
		"default": s.defaultPaymentMethod(),
		"items":   options,
	}, "ok")
}

func (s *Server) handleOrderStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	orderNumber := strings.TrimSpace(r.URL.Query().Get("order_number"))
	if orderNumber == "" {
		s.respondError(w, 400, "订单号不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	order, err := s.fetchOrderByNumber(ctx, orderNumber)
	if err != nil {
		s.respondError(w, 404, "订单不存在")
		return
	}
	if order.UserID != userID {
		s.respondError(w, 403, "无权查看该订单")
		return
	}

	s.respond(w, map[string]any{
		"order_number":      order.OrderNumber,
		"status":            order.Status,
		"provider":          order.Provider,
		"provider_order_id": nullableString(order.ProviderOrderID),
		"failure_reason":    order.FailureReason,
		"paid_at":           nullableTime(order.PaidAt),
	}, "ok")
}

func (s *Server) handleOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}

	var payload orderRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.respondError(w, 400, "订单参数不正确")
		return
	}

	method := normalizeOrderPaymentMethod(payload.PaymentMethod, s.defaultPaymentMethod())
	platform := normalizePayPlatform(payload.Platform)
	idempotencyKey := s.resolveOrderIdempotencyKey(userID, payload, method)

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	price, postsID, meta, description, err := s.buildOrderSpec(ctx, userID, payload)
	if err != nil {
		s.respondError(w, 400, err.Error())
		return
	}

	orderNumber := s.newOrderNumber()
	order, err := s.insertOrder(ctx, userID, orderNumber, payload.Type, price, postsID, method, idempotencyKey, meta)
	if err != nil {
		var conflict *pgconn.PgError
		if errors.As(err, &conflict) && conflict.Code == "23505" {
			order, err = s.fetchOrderByIdempotencyKey(ctx, idempotencyKey)
			if err != nil {
				s.respondError(w, 409, "重复下单，请稍后重试")
				return
			}
			s.respondExistingOrder(w, order)
			return
		}
		s.respondError(w, 500, "创建订单失败")
		return
	}

	switch method {
	case "ifpay":
		result, err := s.createIfPayIntent(ctx, userID, order, platform, firstNonEmpty(payload.Description, description))
		if err != nil {
			s.markOrderFailed(ctx, order.OrderNumber, method, err.Error())
			s.respondError(w, 502, err.Error())
			return
		}
		if err := s.persistOrderIntent(ctx, order.OrderNumber, method, firstNonEmpty(anyString(result["third_party_order_id"]), order.OrderNumber), result); err != nil {
			s.respondError(w, 500, "写入支付结果失败")
			return
		}
		if isImmediateSuccess(anyString(result["status"])) {
			if err := s.markOrderPaid(ctx, order.OrderNumber, method, firstNonEmpty(anyString(result["third_party_order_id"]), order.OrderNumber), result); err != nil {
				s.respondError(w, 500, "确认订单失败")
				return
			}
		}
		s.respond(w, result, "ok")
	default:
		payPayload, providerOrderID, err := s.createWechatPayIntent(ctx, userID, order, platform, firstNonEmpty(payload.Description, description))
		if err != nil {
			s.markOrderFailed(ctx, order.OrderNumber, method, err.Error())
			s.respondError(w, 502, err.Error())
			return
		}
		if err := s.persistOrderIntent(ctx, order.OrderNumber, "wechat", providerOrderID, payPayload); err != nil {
			s.respondError(w, 500, "写入支付结果失败")
			return
		}
		s.respond(w, payPayload, "ok")
	}
}

func (s *Server) buildOrderSpec(ctx context.Context, userID int64, payload orderRequest) (float64, int64, map[string]any, string, error) {
	switch payload.Type {
	case 1:
		var isMember bool
		if err := s.db.QueryRow(ctx, `SELECT COALESCE(is_member, FALSE) FROM users WHERE id = $1`, userID).Scan(&isMember); err == nil && isMember {
			return 0, 0, nil, "", errors.New("你已经是会员了")
		}
		return s.cfg.MembershipPrice, 0, map[string]any{
			"scene": "membership",
		}, "InfiniLink 会员开通", nil
	case 2:
		var reward rewardOrderMeta
		if err := json.Unmarshal(payload.Parame, &reward); err != nil {
			return 0, 0, nil, "", errors.New("打赏参数不正确")
		}
		reward.RewardPrice = roundMoney(reward.RewardPrice)
		if reward.PostsID <= 0 || reward.RewardPrice < 1 || reward.RewardPrice > 1000 {
			return 0, 0, nil, "", errors.New("打赏金额必须在 1-1000 元之间")
		}
		var postOwnerID int64
		if err := s.db.QueryRow(ctx, `SELECT user_id FROM posts WHERE id = $1 AND is_deleted = FALSE`, reward.PostsID).Scan(&postOwnerID); err != nil {
			return 0, 0, nil, "", errors.New("打赏的内容不存在")
		}
		if postOwnerID == userID {
			return 0, 0, nil, "", errors.New("不能给自己的内容打赏")
		}
		reward.PostsUserID = postOwnerID
		return reward.RewardPrice, reward.PostsID, map[string]any{
			"scene":         "reward",
			"posts_user_id": postOwnerID,
			"reward_price":  reward.RewardPrice,
		}, "InfiniLink 内容打赏", nil
	default:
		return 0, 0, nil, "", errors.New("暂不支持的订单类型")
	}
}

func (s *Server) insertOrder(ctx context.Context, userID int64, orderNumber string, orderType int, price float64, postsID int64, provider, idempotencyKey string, meta map[string]any) (orderRow, error) {
	var order orderRow
	metaJSON, _ := json.Marshal(meta)
	err := s.db.QueryRow(ctx, `
		INSERT INTO orders(user_id, order_number, order_type, order_pay_price, posts_id, status, provider, idempotency_key, payment_meta, updated_at)
		VALUES ($1, $2, $3, $4, NULLIF($5, 0), 'pending', $6, NULLIF($7, ''), NULLIF($8::jsonb, '{}'::jsonb), NOW())
		RETURNING id, user_id, order_number, order_type, order_pay_price, posts_id, status, provider, provider_order_id, idempotency_key, payment_payload, payment_meta, failure_reason, paid_at, created_at
	`, userID, orderNumber, orderType, price, postsID, provider, idempotencyKey, string(metaJSON)).Scan(
		&order.ID,
		&order.UserID,
		&order.OrderNumber,
		&order.OrderType,
		&order.OrderPayPrice,
		&order.PostsID,
		&order.Status,
		&order.Provider,
		&order.ProviderOrderID,
		&order.IdempotencyKey,
		&order.PaymentPayload,
		&order.PaymentMeta,
		&order.FailureReason,
		&order.PaidAt,
		&order.CreatedAt,
	)
	return order, err
}

func (s *Server) fetchOrderByIdempotencyKey(ctx context.Context, idempotencyKey string) (orderRow, error) {
	return s.fetchOrder(ctx, `SELECT id, user_id, order_number, order_type, order_pay_price, posts_id, status, provider, provider_order_id, idempotency_key, payment_payload, payment_meta, failure_reason, paid_at, created_at FROM orders WHERE idempotency_key = $1 ORDER BY id DESC LIMIT 1`, idempotencyKey)
}

func (s *Server) fetchOrderByNumber(ctx context.Context, orderNumber string) (orderRow, error) {
	return s.fetchOrder(ctx, `SELECT id, user_id, order_number, order_type, order_pay_price, posts_id, status, provider, provider_order_id, idempotency_key, payment_payload, payment_meta, failure_reason, paid_at, created_at FROM orders WHERE order_number = $1 LIMIT 1`, orderNumber)
}

func (s *Server) fetchOrder(ctx context.Context, query string, args ...any) (orderRow, error) {
	var order orderRow
	err := s.db.QueryRow(ctx, query, args...).Scan(
		&order.ID,
		&order.UserID,
		&order.OrderNumber,
		&order.OrderType,
		&order.OrderPayPrice,
		&order.PostsID,
		&order.Status,
		&order.Provider,
		&order.ProviderOrderID,
		&order.IdempotencyKey,
		&order.PaymentPayload,
		&order.PaymentMeta,
		&order.FailureReason,
		&order.PaidAt,
		&order.CreatedAt,
	)
	return order, err
}

func (s *Server) respondExistingOrder(w http.ResponseWriter, order orderRow) {
	switch normalizeOrderPaymentMethod(order.Provider, s.defaultPaymentMethod()) {
	case "wechat":
		if len(order.PaymentPayload) == 0 || strings.TrimSpace(order.Status) == "paid" {
			s.respondError(w, 409, "订单已处理，请刷新订单状态")
			return
		}
		var payload map[string]any
		if err := json.Unmarshal(order.PaymentPayload, &payload); err != nil {
			s.respondError(w, 409, "订单已存在，请重新发起支付")
			return
		}
		s.respond(w, payload, "ok")
	default:
		s.respond(w, map[string]any{
			"order_number":      order.OrderNumber,
			"status":            order.Status,
			"provider":          order.Provider,
			"provider_order_id": nullableString(order.ProviderOrderID),
			"paid_at":           nullableTime(order.PaidAt),
		}, "ok")
	}
}

func (s *Server) persistOrderIntent(ctx context.Context, orderNumber, provider, providerOrderID string, payload any) error {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `
		UPDATE orders
		SET
			status = CASE WHEN status = 'pending' THEN 'awaiting_client_pay' ELSE status END,
			provider = $2,
			provider_order_id = NULLIF($3, ''),
			payment_payload = $4::jsonb,
			updated_at = NOW()
		WHERE order_number = $1
	`, orderNumber, provider, providerOrderID, string(payloadJSON))
	return err
}

func (s *Server) markOrderFailed(ctx context.Context, orderNumber, provider, reason string) {
	_, _ = s.db.Exec(ctx, `
		UPDATE orders
		SET status = 'failed', provider = $2, failure_reason = $3, updated_at = NOW()
		WHERE order_number = $1 AND status <> 'paid'
	`, orderNumber, provider, limitString(reason, 300))
}

func (s *Server) markOrderPaid(ctx context.Context, orderNumber, provider, providerOrderID string, source any) error {
	sourceJSON, _ := json.Marshal(source)

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var (
		orderID     int64
		userID      int64
		orderType   int
		price       float64
		postsID     sql.NullInt64
		status      string
		paymentMeta []byte
		postOwnerID int64
	)
	if err := tx.QueryRow(ctx, `
		SELECT id, user_id, order_type, order_pay_price, posts_id, status, payment_meta
		FROM orders
		WHERE order_number = $1
		FOR UPDATE
	`, orderNumber).Scan(&orderID, &userID, &orderType, &price, &postsID, &status, &paymentMeta); err != nil {
		return err
	}
	if status == "paid" {
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		return nil
	}

	if _, err := tx.Exec(ctx, `
		UPDATE orders
		SET
			status = 'paid',
			provider = $2,
			provider_order_id = COALESCE(NULLIF($3, ''), provider_order_id),
			callback_payload = $4::jsonb,
			callback_received_at = NOW(),
			paid_at = COALESCE(paid_at, NOW()),
			failure_reason = '',
			updated_at = NOW()
		WHERE id = $1
	`, orderID, provider, providerOrderID, string(sourceJSON)); err != nil {
		return err
	}

	switch orderType {
	case 1:
		if _, err := tx.Exec(ctx, `UPDATE users SET is_member = TRUE, updated_at = NOW() WHERE id = $1`, userID); err != nil {
			return err
		}
	case 2:
		var meta map[string]any
		_ = json.Unmarshal(paymentMeta, &meta)
		postOwnerID := parseInt64(fmt.Sprint(meta["posts_user_id"]), 0)
		if postOwnerID == 0 && postsID.Valid {
			_ = tx.QueryRow(ctx, `SELECT user_id FROM posts WHERE id = $1`, postsID.Int64).Scan(&postOwnerID)
		}
		if postsID.Valid && postOwnerID > 0 {
			if _, err := tx.Exec(ctx, `
				INSERT INTO post_rewards(order_id, post_id, from_user_id, to_user_id, exceptional_price)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (order_id) DO NOTHING
			`, orderID, postsID.Int64, userID, postOwnerID, price); err != nil {
				return err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.cacheDelete(ctx, userCacheKey(userID))
	if postOwnerID > 0 {
		s.cacheDelete(ctx, userCacheKey(postOwnerID))
	}

	if orderType == 2 && postsID.Valid {
		_ = s.refreshPostCounters(ctx, postsID.Int64)
		s.createNotification(ctx, postsID.Int64, userID, 2, "收到新的打赏")
	}
	return nil
}

func (s *Server) handleIFPayNotify(w http.ResponseWriter, r *http.Request) {
	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		writePaymentCallbackAck(w, "ifpay", false)
		return
	}
	defer r.Body.Close()

	if secret := strings.TrimSpace(s.cfg.IfPayNotifySecret); secret != "" && strings.TrimSpace(r.Header.Get("X-IFPAY-SECRET")) != secret {
		writePaymentCallbackAck(w, "ifpay", false)
		return
	}

	var payload map[string]any
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		writePaymentCallbackAck(w, "ifpay", false)
		return
	}

	orderNumber := firstNonEmpty(
		anyString(payload["orderNumber"]),
		anyString(payload["order_number"]),
		anyString(payload["orderId"]),
		anyString(payload["order_id"]),
		anyString(payload["outTradeNo"]),
	)
	status := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		anyString(payload["status"]),
		anyString(payload["tradeStatus"]),
		anyString(payload["trade_status"]),
	)))
	success := toBool(payload["success"]) || isImmediateSuccess(status)
	callbackID, _ := s.recordPaymentCallback(r.Context(), "ifpay", orderNumber, firstNonEmpty(anyString(payload["providerOrderId"]), anyString(payload["provider_order_id"])), firstNonEmpty(anyString(payload["event"]), status), success, rawBody)
	if success && orderNumber != "" {
		if err := s.markOrderPaid(r.Context(), orderNumber, "ifpay", firstNonEmpty(anyString(payload["providerOrderId"]), anyString(payload["provider_order_id"])), payload); err != nil {
			s.finishPaymentCallback(r.Context(), callbackID, "failed", err.Error())
			writePaymentCallbackAck(w, "ifpay", false)
			return
		}
		s.finishPaymentCallback(r.Context(), callbackID, "success", "")
		writePaymentCallbackAck(w, "ifpay", true)
		return
	}

	s.finishPaymentCallback(r.Context(), callbackID, "failed", firstNonEmpty(status, "callback rejected"))
	writePaymentCallbackAck(w, "ifpay", false)
}

func writePaymentCallbackAck(w http.ResponseWriter, channel string, success bool) {
	switch channel {
	case "wechat":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if success {
			_, _ = w.Write([]byte(`{"code":"SUCCESS","message":"成功"}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":"FAIL","message":"失败"}`))
	default:
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if success {
			_, _ = w.Write([]byte("ok"))
			return
		}
		_, _ = w.Write([]byte("fail"))
	}
}

func (s *Server) recordPaymentCallback(ctx context.Context, provider, orderNumber, providerOrderID, eventType string, verified bool, rawBody []byte) (int64, error) {
	var callbackID int64
	err := s.db.QueryRow(ctx, `
		INSERT INTO payment_callbacks(provider, order_number, provider_order_id, event_type, verified, process_status, payload)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
		RETURNING id
	`, provider, orderNumber, providerOrderID, eventType, verified, callbackProcessStatus(verified), string(rawBody)).Scan(&callbackID)
	return callbackID, err
}

func (s *Server) finishPaymentCallback(ctx context.Context, callbackID int64, status, errMsg string) {
	if callbackID == 0 {
		return
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE payment_callbacks
		SET process_status = $2, error_message = $3, processed_at = NOW()
		WHERE id = $1
	`, callbackID, status, limitString(errMsg, 300))
}

func callbackProcessStatus(verified bool) string {
	if verified {
		return "processing"
	}
	return "failed"
}

func (s *Server) createIfPayIntent(ctx context.Context, userID int64, order orderRow, platform, description string) (map[string]any, error) {
	if strings.TrimSpace(s.cfg.IfPayBaseURL) == "" {
		return nil, errors.New("IF-Pay 未配置，请先设置 IF_PAY_BASE_URL")
	}

	body := map[string]any{
		"userId":         formatInt64(userID),
		"userType":       "customer",
		"platform":       platform,
		"orderId":        order.OrderNumber,
		"amount":         moneyToCents(order.OrderPayPrice),
		"paymentMethod":  "ifpay",
		"paymentChannel": "ifpay",
		"description":    firstNonEmpty(description, "InfiniLink 订单支付"),
		"idempotencyKey": nullableString(order.IdempotencyKey),
	}

	payloadJSON, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, joinURLPath(s.cfg.IfPayBaseURL, s.cfg.IfPayCreatePath), strings.NewReader(string(payloadJSON)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if secret := strings.TrimSpace(s.cfg.IfPayAPISecret); secret != "" {
		req.Header.Set("X-IFPAY-SECRET", secret)
	}

	client := &http.Client{Timeout: s.cfg.IfPayTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 IF-Pay 失败: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 IF-Pay 响应失败: %w", err)
	}

	var envelope ifPayResponseEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("解析 IF-Pay 响应失败: %w", err)
	}

	if resp.StatusCode >= http.StatusBadRequest || (!envelope.Success && strings.TrimSpace(strings.ToLower(fmt.Sprint(envelope.Code))) != "ok") {
		return nil, errors.New(firstNonEmpty(envelope.Message, "IF-Pay 支付失败"))
	}

	result := map[string]any{}
	if len(envelope.Data) > 0 {
		_ = json.Unmarshal(envelope.Data, &result)
	}
	if len(result) == 0 {
		result["status"] = firstNonEmpty(fmt.Sprint(envelope.Status), "success")
	}
	if _, ok := result["paymentMethod"]; !ok {
		result["paymentMethod"] = "ifpay"
	}
	if _, ok := result["gateway"]; !ok {
		result["gateway"] = "ifpay"
	}
	if _, ok := result["third_party_order_id"]; !ok {
		result["third_party_order_id"] = firstNonEmpty(
			anyString(result["thirdPartyOrderId"]),
			anyString(result["transactionId"]),
			order.OrderNumber,
		)
	}
	return result, nil
}

func (s *Server) resolveOrderIdempotencyKey(userID int64, payload orderRequest, method string) string {
	if key := strings.TrimSpace(payload.IdempotencyKey); key != "" {
		return key
	}
	bucketSeconds := int64(s.cfg.OrderLockTTL / time.Second)
	if bucketSeconds <= 0 {
		bucketSeconds = 30
	}
	return stableHash(
		"order",
		formatInt64(userID),
		fmt.Sprintf("%d", payload.Type),
		method,
		string(payload.Parame),
		fmt.Sprintf("%d", time.Now().UTC().Unix()/bucketSeconds),
	)
}

func (s *Server) newOrderNumber() string {
	now := time.Now().UTC()
	return fmt.Sprintf("IL%s%06d", now.Format("20060102150405"), now.UnixNano()%1_000_000)
}

func defaultPaymentDescription(orderType int) string {
	if orderType == 2 {
		return "InfiniLink 内容打赏"
	}
	return "InfiniLink 会员开通"
}

func normalizeOrderPaymentMethod(value, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(firstNonEmpty(value, fallback))) {
	case "ifpay", "if-pay", "if_pay", "balance":
		return "ifpay"
	case "wxpay", "wechatpay":
		return "wechat"
	default:
		return "wechat"
	}
}

func normalizePayPlatform(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "app", "app-plus":
		return "app"
	default:
		return "mini_program"
	}
}

func moneyToCents(value float64) int64 {
	return int64(math.Round(roundMoney(value) * 100))
}

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

func nullableTime(value sql.NullTime) string {
	if value.Valid {
		return value.Time.Format(time.RFC3339)
	}
	return ""
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

func isImmediateSuccess(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success", "paid", "completed":
		return true
	default:
		return false
	}
}

func toBool(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		switch strings.ToLower(strings.TrimSpace(typed)) {
		case "1", "true", "yes", "ok", "success":
			return true
		}
	}
	return false
}

func anyString(value any) string {
	if value == nil {
		return ""
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "<nil>" {
		return ""
	}
	return text
}

func joinURLPath(baseURL, path string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return base
	}
	if !strings.HasPrefix(trimmedPath, "/") {
		trimmedPath = "/" + trimmedPath
	}
	return base + trimmedPath
}

func (s *Server) defaultPaymentMethod() string {
	return normalizeOrderPaymentMethod(s.cfg.DefaultPayMethod, "wechat")
}
