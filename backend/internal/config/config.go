package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName           string
	HTTPAddr          string
	PublicBaseURL     string
	DatabaseURL       string
	RedisAddr         string
	RedisUsername     string
	RedisPassword     string
	RedisDB           int
	RedisPoolSize     int
	JWTSecret         string
	TokenTTL          time.Duration
	UploadDir         string
	AssetsDir         string
	MaxUploadBytes    int64
	MembershipPrice   float64
	AutoMigrate       bool
	EnableSeedContent bool
	CacheTTL          time.Duration
	UserCacheTTL      time.Duration
	OrderLockTTL      time.Duration
	HTTPReadTimeout   time.Duration
	HTTPWriteTimeout  time.Duration
	HTTPIdleTimeout   time.Duration
	ShutdownTimeout   time.Duration
	MaxHeaderBytes    int
	DBMaxConns        int32
	DBMinConns        int32
	DBMaxConnLifetime time.Duration
	DBMaxConnIdleTime time.Duration
	DBHealthCheck     time.Duration
	WeChatAppID       string
	WeChatAppSecret   string
	WeChatPayMchID    string
	WeChatPayAPIv3Key string
	WeChatPaySerialNo string
	WeChatPayKeyPEM   string
	WeChatPayNotify   string
	IfPayBaseURL      string
	IfPayCreatePath   string
	IfPayAPISecret    string
	IfPayTimeout      time.Duration
	IfPayNotifySecret string
	DefaultPayMethod  string
	PaymentMockPaid   bool
}

func Load() Config {
	return Config{
		AppName:           getEnv("APP_NAME", "InfiniLink"),
		HTTPAddr:          getEnv("HTTP_ADDR", ":8080"),
		PublicBaseURL:     getEnv("PUBLIC_BASE_URL", "http://127.0.0.1"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/infinilink?sslmode=disable"),
		RedisAddr:         getEnv("REDIS_ADDR", "127.0.0.1:6379"),
		RedisUsername:     getEnv("REDIS_USERNAME", ""),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		RedisDB:           getEnvInt("REDIS_DB", 0),
		RedisPoolSize:     getEnvInt("REDIS_POOL_SIZE", 64),
		JWTSecret:         getEnv("JWT_SECRET", "change-me-in-production"),
		TokenTTL:          getEnvDuration("TOKEN_TTL", 180*24*time.Hour),
		UploadDir:         getEnv("UPLOAD_DIR", "./storage/uploads"),
		AssetsDir:         getEnv("ASSETS_DIR", "./static"),
		MaxUploadBytes:    getEnvInt64("MAX_UPLOAD_BYTES", 25<<20),
		MembershipPrice:   getEnvFloat64("MEMBERSHIP_PRICE", 99),
		AutoMigrate:       getEnvBool("AUTO_MIGRATE", true),
		EnableSeedContent: getEnvBool("ENABLE_SEED_CONTENT", true),
		CacheTTL:          getEnvDuration("CACHE_TTL", 5*time.Minute),
		UserCacheTTL:      getEnvDuration("USER_CACHE_TTL", 90*time.Second),
		OrderLockTTL:      getEnvDuration("ORDER_LOCK_TTL", 30*time.Second),
		HTTPReadTimeout:   getEnvDuration("HTTP_READ_TIMEOUT", 10*time.Second),
		HTTPWriteTimeout:  getEnvDuration("HTTP_WRITE_TIMEOUT", 30*time.Second),
		HTTPIdleTimeout:   getEnvDuration("HTTP_IDLE_TIMEOUT", 60*time.Second),
		ShutdownTimeout:   getEnvDuration("SHUTDOWN_TIMEOUT", 15*time.Second),
		MaxHeaderBytes:    getEnvInt("MAX_HEADER_BYTES", 1<<20),
		DBMaxConns:        int32(getEnvInt("DB_MAX_CONNS", 48)),
		DBMinConns:        int32(getEnvInt("DB_MIN_CONNS", 8)),
		DBMaxConnLifetime: getEnvDuration("DB_MAX_CONN_LIFETIME", time.Hour),
		DBMaxConnIdleTime: getEnvDuration("DB_MAX_CONN_IDLE_TIME", 15*time.Minute),
		DBHealthCheck:     getEnvDuration("DB_HEALTH_CHECK_PERIOD", time.Minute),
		WeChatAppID:       getEnv("WECHAT_APP_ID", ""),
		WeChatAppSecret:   getEnv("WECHAT_APP_SECRET", ""),
		WeChatPayMchID:    getEnv("WXPAY_MCH_ID", ""),
		WeChatPayAPIv3Key: getEnv("WXPAY_API_V3_KEY", ""),
		WeChatPaySerialNo: getEnv("WXPAY_SERIAL_NO", ""),
		WeChatPayKeyPEM:   normalizeMultilineEnv(getEnv("WXPAY_PRIVATE_KEY", "")),
		WeChatPayNotify:   getEnv("WXPAY_NOTIFY_URL", ""),
		IfPayBaseURL:      getEnv("IF_PAY_BASE_URL", ""),
		IfPayCreatePath:   getEnv("IF_PAY_CREATE_PATH", "/api/wallet/payment"),
		IfPayAPISecret:    getEnv("IF_PAY_API_SECRET", ""),
		IfPayTimeout:      getEnvDuration("IF_PAY_TIMEOUT", 8*time.Second),
		IfPayNotifySecret: getEnv("IF_PAY_NOTIFY_SECRET", ""),
		DefaultPayMethod:  getEnv("DEFAULT_PAY_METHOD", "wechat"),
		PaymentMockPaid:   getEnvBool("PAYMENT_MOCK_PAID", false),
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvInt64(key string, fallback int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
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

func getEnvFloat64(key string, fallback float64) float64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func normalizeMultilineEnv(value string) string {
	return strings.ReplaceAll(value, `\n`, "\n")
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
