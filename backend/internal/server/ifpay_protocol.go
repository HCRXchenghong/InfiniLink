package server

import (
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	ifPayHeaderAppID       = "X-IFPAY-App-Id"
	ifPayHeaderTimestamp   = "X-IFPAY-Timestamp"
	ifPayHeaderNonce       = "X-IFPAY-Nonce"
	ifPayHeaderSerial      = "X-IFPAY-Serial"
	ifPayHeaderSignature   = "X-IFPAY-Signature"
	ifPayHeaderDigest      = "Digest"
	ifPayHeaderIdempotency = "Idempotency-Key"
	ifPayDigestPrefix      = "SHA-256="
	ifPayOAuthStateTTL     = 10 * time.Minute
	ifPayTokenRefreshSkew  = 2 * time.Minute
	ifPayWebhookSkew       = 5 * time.Minute
)

var errIfPayOAuthRequired = errors.New("ifpay oauth required")

type ifPayOAuthState struct {
	UserID    int64  `json:"user_id"`
	ExpiresAt int64  `json:"expires_at"`
	ReturnURL string `json:"return_url,omitempty"`
}

type ifPayTokenEnvelope struct {
	Code         any             `json:"code"`
	Message      string          `json:"message"`
	Success      bool            `json:"success"`
	Data         json.RawMessage `json:"data"`
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	TokenType    string          `json:"token_type"`
	ExpiresIn    int64           `json:"expires_in"`
	Scope        string          `json:"scope"`
	SessionID    string          `json:"session_id"`
}

type ifPayTokenPayload struct {
	AccessToken      string    `json:"access_token"`
	RefreshToken     string    `json:"refresh_token"`
	TokenType        string    `json:"token_type"`
	ExpiresIn        int64     `json:"expires_in"`
	RefreshExpiresAt time.Time `json:"refresh_expires_at"`
	Scope            string    `json:"scope"`
	SessionID        string    `json:"session_id"`
}

type ifPayUserTokenRow struct {
	UserID             int64
	AppID              string
	IfPayUserID        string
	SessionID          string
	Scope              string
	AccessTokenCipher  string
	RefreshTokenCipher string
	AccessExpiresAt    *time.Time
	RefreshExpiresAt   *time.Time
	LastAuthorizedAt   time.Time
}

type ifPayWebhookEvent struct {
	EventID      string         `json:"event_id"`
	EventType    string         `json:"event_type"`
	ResourceType string         `json:"resource_type"`
	ResourceID   string         `json:"resource_id"`
	OccurredAt   time.Time      `json:"occurred_at"`
	Data         map[string]any `json:"data"`
}

func ifPayBuildDigest(body []byte) string {
	sum := sha256.Sum256(body)
	return ifPayDigestPrefix + base64.StdEncoding.EncodeToString(sum[:])
}

func ifPayVerifyDigest(expected string, body []byte) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return len(body) == 0
	}
	return strings.EqualFold(expected, ifPayBuildDigest(body))
}

func ifPayCanonicalMessage(method, requestPath, timestamp, nonce, digest string) string {
	return strings.Join([]string{
		strings.ToUpper(strings.TrimSpace(method)),
		strings.TrimSpace(requestPath),
		strings.TrimSpace(timestamp),
		strings.TrimSpace(nonce),
		strings.TrimSpace(digest),
	}, "\n")
}

func ifPayGenerateNonce(size int) (string, error) {
	if size <= 0 {
		size = 18
	}
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func ifPayParseRSAPrivateKeyPEM(raw string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(raw)))
	if block == nil {
		return nil, fmt.Errorf("invalid rsa private key pem")
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("private key is not rsa")
		}
		return rsaKey, nil
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func ifPayParseRSAPublicKeyPEM(raw string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(raw)))
	if block == nil {
		return nil, fmt.Errorf("invalid rsa public key pem")
	}
	if keyAny, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		key, ok := keyAny.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("public key is not rsa")
		}
		return key, nil
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("certificate public key is not rsa")
	}
	return key, nil
}

func ifPaySignRSASignature(privateKeyPEM, message string) (string, error) {
	key, err := ifPayParseRSAPrivateKeyPEM(privateKeyPEM)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

func ifPayVerifyRSASignature(publicKeyPEM, message, signature string) error {
	key, err := ifPayParseRSAPublicKeyPEM(publicKeyPEM)
	if err != nil {
		return err
	}
	rawSignature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signature))
	if err != nil {
		return fmt.Errorf("invalid signature encoding")
	}
	sum := sha256.Sum256([]byte(message))
	return rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], rawSignature)
}

func ifPaySecretKey(secret string) []byte {
	sum := sha256.Sum256([]byte(strings.TrimSpace(secret)))
	return sum[:]
}

func ifPayEncrypt(secret, plaintext string) (string, error) {
	if strings.TrimSpace(plaintext) == "" {
		return "", nil
	}
	block, err := aes.NewCipher(ifPaySecretKey(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func ifPayDecrypt(secret, ciphertext string) (string, error) {
	if strings.TrimSpace(ciphertext) == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(ciphertext))
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(ifPaySecretKey(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce := raw[:gcm.NonceSize()]
	payload := raw[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, payload, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func (s *Server) ifPayReady() bool {
	return strings.TrimSpace(s.cfg.IfPayBaseURL) != "" &&
		strings.TrimSpace(s.cfg.IfPayAppID) != "" &&
		strings.TrimSpace(s.cfg.IfPaySigningSerial) != "" &&
		strings.TrimSpace(s.cfg.IfPayPrivateKeyPEM) != "" &&
		strings.TrimSpace(s.cfg.IfPayClientID) != "" &&
		strings.TrimSpace(s.cfg.IfPayClientSecret) != ""
}

func (s *Server) ifPayWebhookReady() bool {
	return s.ifPayReady() && strings.TrimSpace(s.cfg.IfPayWebhookPublicKeyPEM) != ""
}

func (s *Server) ifPayAuthorizeURL() string {
	return joinURLPath(s.cfg.IfPayBaseURL, s.cfg.IfPayOAuthAuthorizePath)
}

func (s *Server) ifPayTokenURL() string {
	return joinURLPath(s.cfg.IfPayBaseURL, s.cfg.IfPayOAuthTokenPath)
}

func (s *Server) ifPayUserInfoURL() string {
	return joinURLPath(s.cfg.IfPayBaseURL, s.cfg.IfPayOAuthUserInfoPath)
}

func (s *Server) ifPayCallbackURL() string {
	return s.publicURL("api/v1/payment/ifpay/oauth/callback")
}

func (s *Server) buildIfPayOAuthState(userID int64, returnURL string) (string, error) {
	payload := ifPayOAuthState{
		UserID:    userID,
		ExpiresAt: time.Now().Add(ifPayOAuthStateTTL).Unix(),
		ReturnURL: strings.TrimSpace(returnURL),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	payloadPart := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	mac.Write([]byte(payloadPart))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payloadPart + "." + signature, nil
}

func (s *Server) parseIfPayOAuthState(raw string) (ifPayOAuthState, error) {
	var state ifPayOAuthState
	parts := strings.Split(strings.TrimSpace(raw), ".")
	if len(parts) != 2 {
		return state, fmt.Errorf("invalid state")
	}
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[1]), []byte(expected)) {
		return state, fmt.Errorf("invalid state signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return state, err
	}
	if err := json.Unmarshal(payload, &state); err != nil {
		return state, err
	}
	if state.UserID <= 0 || state.ExpiresAt <= 0 || time.Now().Unix() > state.ExpiresAt {
		return state, fmt.Errorf("state expired")
	}
	return state, nil
}

func (s *Server) ifPaySignedPath(fullURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(fullURL))
	if err != nil {
		return "", err
	}
	path := firstNonEmpty(parsed.EscapedPath(), "/")
	if parsed.RawQuery != "" {
		path += "?" + parsed.RawQuery
	}
	return path, nil
}

func normalizeIfPaySubMethod(value, platform string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "ifpay", "if-pay", "if_pay", "balance", "ifpay_balance":
		return "ifpay_balance"
	case "wechat", "wxpay", "wechatpay":
		return "wechat"
	case "alipay", "ali":
		return "alipay"
	case "usdt":
		return "usdt"
	case "bank_card", "bankcard", "bank":
		return "bank_card"
	}
	if normalizePayPlatform(platform) == "mini_program" {
		return "wechat"
	}
	return "ifpay_balance"
}

func parseIfPayTime(value any) *time.Time {
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "" || text == "<nil>" {
		return nil
	}
	if unixValue, err := strconv.ParseInt(text, 10, 64); err == nil && unixValue > 0 {
		timestamp := time.Unix(unixValue, 0)
		return &timestamp
	}
	if parsed, err := time.Parse(time.RFC3339, text); err == nil {
		return &parsed
	}
	return nil
}
