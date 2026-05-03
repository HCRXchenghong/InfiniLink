package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	AppName           string
	HTTPAddr          string
	PublicBaseURL     string
	DatabaseURL       string
	RedisAddr         string
	JWTSecret         string
	TokenTTL          time.Duration
	UploadDir         string
	AssetsDir         string
	MaxUploadBytes    int64
	MembershipPrice   float64
	AutoMigrate       bool
	EnableSeedContent bool
}

func Load() Config {
	return Config{
		AppName:           getEnv("APP_NAME", "InfiniLink"),
		HTTPAddr:          getEnv("HTTP_ADDR", ":8080"),
		PublicBaseURL:     getEnv("PUBLIC_BASE_URL", "http://127.0.0.1"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/infinilink?sslmode=disable"),
		RedisAddr:         getEnv("REDIS_ADDR", "127.0.0.1:6379"),
		JWTSecret:         getEnv("JWT_SECRET", "change-me-in-production"),
		TokenTTL:          getEnvDuration("TOKEN_TTL", 180*24*time.Hour),
		UploadDir:         getEnv("UPLOAD_DIR", "./storage/uploads"),
		AssetsDir:         getEnv("ASSETS_DIR", "./static"),
		MaxUploadBytes:    getEnvInt64("MAX_UPLOAD_BYTES", 25<<20),
		MembershipPrice:   getEnvFloat64("MEMBERSHIP_PRICE", 99),
		AutoMigrate:       getEnvBool("AUTO_MIGRATE", true),
		EnableSeedContent: getEnvBool("ENABLE_SEED_CONTENT", true),
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
