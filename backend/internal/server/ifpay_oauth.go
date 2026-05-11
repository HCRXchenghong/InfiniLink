package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *Server) handleIFPayOAuthStart(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	if !s.ifPayReady() {
		s.respondError(w, http.StatusServiceUnavailable, "IF-Pay OAuth 配置未完成")
		return
	}

	authURL, err := s.buildIFPayAuthorizeURL(userID, r.URL.Query().Get("return_url"))
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "生成 IF-Pay 授权地址失败")
		return
	}
	status, _ := s.loadIfPayBindStatus(r.Context(), userID)
	s.respond(w, map[string]any{
		"auth_url": authURL,
		"bound":    status["bound"],
		"app_id":   s.cfg.IfPayAppID,
	}, "ok")
}

func (s *Server) handleIFPayOAuthStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUserID(w, r)
	if !ok {
		return
	}
	status, err := s.loadIfPayBindStatus(r.Context(), userID)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "读取 IF-Pay 绑定状态失败")
		return
	}
	s.respond(w, status, "ok")
}

func (s *Server) handleIFPayOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if !s.ifPayReady() {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("IF-Pay OAuth is not configured"))
		return
	}

	query := r.URL.Query()
	if errText := strings.TrimSpace(query.Get("error")); errText != "" {
		s.renderIFPayOAuthResult(w, false, "IF-Pay 授权失败："+errText)
		return
	}
	code := strings.TrimSpace(query.Get("code"))
	state, err := s.parseIfPayOAuthState(query.Get("state"))
	if err != nil || code == "" {
		s.renderIFPayOAuthResult(w, false, "IF-Pay 授权参数无效")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	tokenPayload, err := s.exchangeIFPayAuthCode(ctx, code)
	if err != nil {
		s.renderIFPayOAuthResult(w, false, "IF-Pay 换取令牌失败："+err.Error())
		return
	}
	ifPayUserID := ""
	if userinfo, userErr := s.fetchIFPayUserInfo(ctx, tokenPayload.AccessToken); userErr == nil {
		ifPayUserID = firstNonEmpty(anyString(userinfo["user_id"]), anyString(userinfo["sub"]))
	}
	if err := s.storeIfPayToken(ctx, state.UserID, ifPayUserID, tokenPayload); err != nil {
		s.renderIFPayOAuthResult(w, false, "保存 IF-Pay 授权失败："+err.Error())
		return
	}

	s.renderIFPayOAuthResult(w, true, "IF-Pay 授权成功，请返回小程序继续支付")
}

func (s *Server) buildIFPayAuthorizeURL(userID int64, returnURL string) (string, error) {
	state, err := s.buildIfPayOAuthState(userID, returnURL)
	if err != nil {
		return "", err
	}
	query := url.Values{}
	query.Set("client_id", strings.TrimSpace(s.cfg.IfPayClientID))
	query.Set("response_type", "code")
	query.Set("redirect_uri", s.ifPayCallbackURL())
	query.Set("scope", strings.TrimSpace(s.cfg.IfPayScopes))
	query.Set("state", state)
	return s.ifPayAuthorizeURL() + "?" + query.Encode(), nil
}

func (s *Server) exchangeIFPayAuthCode(ctx context.Context, code string) (ifPayTokenPayload, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", strings.TrimSpace(code))
	form.Set("redirect_uri", s.ifPayCallbackURL())
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.ifPayTokenURL(), strings.NewReader(form.Encode()))
	if err != nil {
		return ifPayTokenPayload{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(strings.TrimSpace(s.cfg.IfPayClientID)+":"+strings.TrimSpace(s.cfg.IfPayClientSecret))))

	response, err := s.httpClient.Do(request)
	if err != nil {
		return ifPayTokenPayload{}, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024))
	if err != nil {
		return ifPayTokenPayload{}, err
	}
	return parseIfPayTokenResponse(response.StatusCode, body)
}

func (s *Server) refreshIFPayAccessToken(ctx context.Context, row ifPayUserTokenRow) (string, error) {
	refreshToken, err := ifPayDecrypt(s.cfg.JWTSecret, row.RefreshTokenCipher)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(refreshToken) == "" {
		return "", errIfPayOAuthRequired
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.ifPayTokenURL(), strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(strings.TrimSpace(s.cfg.IfPayClientID)+":"+strings.TrimSpace(s.cfg.IfPayClientSecret))))

	response, err := s.httpClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024))
	if err != nil {
		return "", err
	}
	payload, err := parseIfPayTokenResponse(response.StatusCode, body)
	if err != nil {
		return "", err
	}
	if err := s.storeIfPayToken(ctx, row.UserID, row.IfPayUserID, payload); err != nil {
		return "", err
	}
	return payload.AccessToken, nil
}

func (s *Server) fetchIFPayUserInfo(ctx context.Context, accessToken string) (map[string]any, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, s.ifPayUserInfoURL(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))
	response, err := s.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}
	payload, err := parseIfPayEnvelope(response.StatusCode, body)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func (s *Server) storeIfPayToken(ctx context.Context, userID int64, ifPayUserID string, payload ifPayTokenPayload) error {
	accessCipher, err := ifPayEncrypt(s.cfg.JWTSecret, payload.AccessToken)
	if err != nil {
		return err
	}
	refreshCipher, err := ifPayEncrypt(s.cfg.JWTSecret, payload.RefreshToken)
	if err != nil {
		return err
	}
	accessExpiresAt := time.Now().Add(time.Duration(payload.ExpiresIn) * time.Second)
	var refreshExpiresAt any
	if !payload.RefreshExpiresAt.IsZero() {
		refreshExpiresAt = payload.RefreshExpiresAt
	}
	_, err = s.db.Exec(ctx, `
		INSERT INTO ifpay_user_tokens(
			user_id, app_id, ifpay_user_id, session_id, scope,
			access_token_cipher, refresh_token_cipher,
			access_expires_at, refresh_expires_at, last_authorized_at, updated_at
		)
		VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		ON CONFLICT (user_id, app_id) DO UPDATE
		SET
			ifpay_user_id = EXCLUDED.ifpay_user_id,
			session_id = EXCLUDED.session_id,
			scope = EXCLUDED.scope,
			access_token_cipher = EXCLUDED.access_token_cipher,
			refresh_token_cipher = EXCLUDED.refresh_token_cipher,
			access_expires_at = EXCLUDED.access_expires_at,
			refresh_expires_at = EXCLUDED.refresh_expires_at,
			last_authorized_at = NOW(),
			updated_at = NOW()
	`, userID, strings.TrimSpace(s.cfg.IfPayAppID), strings.TrimSpace(ifPayUserID), strings.TrimSpace(payload.SessionID), strings.TrimSpace(payload.Scope), accessCipher, refreshCipher, accessExpiresAt, refreshExpiresAt)
	if err == nil {
		s.cacheDelete(ctx, cacheKey("ifpay", "token", formatInt64(userID)))
	}
	return err
}

func (s *Server) loadIfPayBindStatus(ctx context.Context, userID int64) (map[string]any, error) {
	row, err := s.loadIfPayTokenRow(ctx, userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return map[string]any{
				"bound":  false,
				"app_id": strings.TrimSpace(s.cfg.IfPayAppID),
			}, nil
		}
		return nil, err
	}
	return map[string]any{
		"bound":              true,
		"app_id":             row.AppID,
		"ifpay_user_id":      row.IfPayUserID,
		"session_id":         row.SessionID,
		"scope":              row.Scope,
		"access_expires_at":  nullablePtrTime(row.AccessExpiresAt),
		"refresh_expires_at": nullablePtrTime(row.RefreshExpiresAt),
		"last_authorized_at": row.LastAuthorizedAt.Format(time.RFC3339),
	}, nil
}

func (s *Server) loadIfPayTokenRow(ctx context.Context, userID int64) (ifPayUserTokenRow, error) {
	var row ifPayUserTokenRow
	var accessExpiresAt sql.NullTime
	var refreshExpiresAt sql.NullTime
	err := s.db.QueryRow(ctx, `
		SELECT user_id, app_id, ifpay_user_id, session_id, scope, access_token_cipher, refresh_token_cipher, access_expires_at, refresh_expires_at, last_authorized_at
		FROM ifpay_user_tokens
		WHERE user_id = $1 AND app_id = $2
		LIMIT 1
	`, userID, strings.TrimSpace(s.cfg.IfPayAppID)).Scan(
		&row.UserID,
		&row.AppID,
		&row.IfPayUserID,
		&row.SessionID,
		&row.Scope,
		&row.AccessTokenCipher,
		&row.RefreshTokenCipher,
		&accessExpiresAt,
		&refreshExpiresAt,
		&row.LastAuthorizedAt,
	)
	if err == nil {
		if accessExpiresAt.Valid {
			value := accessExpiresAt.Time
			row.AccessExpiresAt = &value
		}
		if refreshExpiresAt.Valid {
			value := refreshExpiresAt.Time
			row.RefreshExpiresAt = &value
		}
	}
	return row, err
}

func (s *Server) ensureIfPayAccessToken(ctx context.Context, userID int64) (string, error) {
	row, err := s.loadIfPayTokenRow(ctx, userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", errIfPayOAuthRequired
		}
		return "", err
	}
	now := time.Now()
	if row.AccessExpiresAt != nil && row.AccessExpiresAt.After(now.Add(ifPayTokenRefreshSkew)) {
		accessToken, decryptErr := ifPayDecrypt(s.cfg.JWTSecret, row.AccessTokenCipher)
		if decryptErr != nil {
			return "", decryptErr
		}
		if strings.TrimSpace(accessToken) != "" {
			return accessToken, nil
		}
	}
	if row.RefreshExpiresAt == nil || row.RefreshExpiresAt.Before(now.Add(30*time.Second)) {
		return "", errIfPayOAuthRequired
	}
	return s.refreshIFPayAccessToken(ctx, row)
}

func (s *Server) clearIfPayToken(ctx context.Context, userID int64) {
	_, _ = s.db.Exec(ctx, `DELETE FROM ifpay_user_tokens WHERE user_id = $1 AND app_id = $2`, userID, strings.TrimSpace(s.cfg.IfPayAppID))
	s.cacheDelete(ctx, cacheKey("ifpay", "token", formatInt64(userID)))
}

func parseIfPayTokenResponse(statusCode int, body []byte) (ifPayTokenPayload, error) {
	var envelope ifPayTokenEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return ifPayTokenPayload{}, err
	}
	payload := ifPayTokenPayload{
		AccessToken:  strings.TrimSpace(envelope.AccessToken),
		RefreshToken: strings.TrimSpace(envelope.RefreshToken),
		TokenType:    strings.TrimSpace(envelope.TokenType),
		ExpiresIn:    envelope.ExpiresIn,
		Scope:        strings.TrimSpace(envelope.Scope),
		SessionID:    strings.TrimSpace(envelope.SessionID),
	}
	if len(envelope.Data) > 0 {
		var nested ifPayTokenPayload
		if err := json.Unmarshal(envelope.Data, &nested); err == nil {
			if strings.TrimSpace(payload.AccessToken) == "" {
				payload = nested
			} else {
				if payload.RefreshToken == "" {
					payload.RefreshToken = nested.RefreshToken
				}
				if payload.TokenType == "" {
					payload.TokenType = nested.TokenType
				}
				if payload.ExpiresIn == 0 {
					payload.ExpiresIn = nested.ExpiresIn
				}
				if payload.Scope == "" {
					payload.Scope = nested.Scope
				}
				if payload.SessionID == "" {
					payload.SessionID = nested.SessionID
				}
				if payload.RefreshExpiresAt.IsZero() {
					payload.RefreshExpiresAt = nested.RefreshExpiresAt
				}
			}
		}
	}
	if payload.ExpiresIn <= 0 {
		payload.ExpiresIn = 7200
	}
	if statusCode >= http.StatusBadRequest || strings.TrimSpace(payload.AccessToken) == "" {
		return ifPayTokenPayload{}, errors.New(firstNonEmpty(envelope.Message, "IF-Pay token 响应异常"))
	}
	return payload, nil
}

func parseIfPayEnvelope(statusCode int, body []byte) (map[string]any, error) {
	var envelope ifPayResponseEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, err
	}
	result := map[string]any{}
	if len(envelope.Data) > 0 {
		_ = json.Unmarshal(envelope.Data, &result)
	}
	if len(result) == 0 {
		_ = json.Unmarshal(body, &result)
		delete(result, "data")
	}
	if statusCode >= http.StatusBadRequest || (!envelope.Success && strings.TrimSpace(strings.ToUpper(fmt.Sprint(envelope.Code))) != "OK") {
		return nil, errors.New(firstNonEmpty(envelope.Message, "IF-Pay 请求失败"))
	}
	return result, nil
}

func (s *Server) renderIFPayOAuthResult(w http.ResponseWriter, success bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	html := fmt.Sprintf(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>IF-Pay 授权结果</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;background:#f5f7fb;margin:0;padding:32px;color:#111827}
    .wrap{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
    .state{font-size:18px;font-weight:600;margin-bottom:12px}
    .desc{font-size:14px;line-height:1.7;color:#4b5563}
    .btn{display:inline-block;margin-top:20px;padding:12px 18px;border-radius:12px;background:#111827;color:#fff;text-decoration:none}
  </style>
  <script src="https://res.wx.qq.com/open/js/jweixin-1.3.2.js"></script>
</head>
<body>
  <div class="wrap">
    <div class="state">IF-Pay 授权%s</div>
    <div class="desc">%s</div>
    <a class="btn" href="javascript:void(0)" onclick="goBack()">返回小程序</a>
  </div>
  <script>
    function goBack(){
      if (window.wx && wx.miniProgram) {
        try { wx.miniProgram.postMessage({ data: { type: 'ifpay-oauth', success: %t } }); } catch (e) {}
        try { wx.miniProgram.navigateBack(); return; } catch (e) {}
      }
      history.back();
    }
    setTimeout(goBack, %d);
  </script>
</body>
</html>`, map[bool]string{true: "成功", false: "失败"}[success], htmlEscape(message), success, map[bool]int{true: 1200, false: 0}[success])
	_, _ = io.Copy(w, bytes.NewBufferString(html))
}

func htmlEscape(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return replacer.Replace(value)
}

func nullablePtrTime(value *time.Time) any {
	if value == nil || value.IsZero() {
		return nil
	}
	return value.Format(time.RFC3339)
}
