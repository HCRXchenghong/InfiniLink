package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type wechatCodeSession struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

func (s *Server) exchangeWeChatCode(ctx context.Context, code string) (string, error) {
	if strings.TrimSpace(code) == "" {
		return "", nil
	}
	if strings.TrimSpace(s.cfg.WeChatAppID) == "" || strings.TrimSpace(s.cfg.WeChatAppSecret) == "" {
		return "", nil
	}

	query := url.Values{}
	query.Set("appid", s.cfg.WeChatAppID)
	query.Set("secret", s.cfg.WeChatAppSecret)
	query.Set("js_code", strings.TrimSpace(code))
	query.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.weixin.qq.com/sns/jscode2session?"+query.Encode(), nil)
	if err != nil {
		return "", fmt.Errorf("build wechat login request: %w", err)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request wechat login session: %w", err)
	}
	defer resp.Body.Close()

	var payload wechatCodeSession
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("decode wechat login session: %w", err)
	}
	if payload.ErrCode != 0 {
		return "", fmt.Errorf("wechat code2session failed: %d %s", payload.ErrCode, payload.ErrMsg)
	}
	return strings.TrimSpace(payload.OpenID), nil
}

func (s *Server) lookupWechatOpenID(ctx context.Context, userID int64) (string, error) {
	var openID string
	if err := s.db.QueryRow(ctx, `SELECT COALESCE(wechat_openid, '') FROM users WHERE id = $1`, userID).Scan(&openID); err != nil {
		return "", err
	}
	return strings.TrimSpace(openID), nil
}
