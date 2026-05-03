package server

import (
	"context"
	"encoding/json"
	"strconv"
	"time"
)

func cachedJSON[T any](s *Server, ctx context.Context, key string, ttl time.Duration, loader func(context.Context) (T, error)) (T, error) {
	var zero T
	if s.redis != nil {
		if raw, err := s.redis.Get(ctx, key).Bytes(); err == nil {
			var cached T
			if jsonErr := json.Unmarshal(raw, &cached); jsonErr == nil {
				return cached, nil
			}
		}
	}

	value, err := loader(ctx)
	if err != nil {
		return zero, err
	}
	s.cacheSetJSON(ctx, key, value, ttl)
	return value, nil
}

func (s *Server) cacheSetJSON(ctx context.Context, key string, value any, ttl time.Duration) {
	if s.redis == nil || ttl <= 0 {
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return
	}
	_ = s.redis.Set(ctx, key, raw, ttl).Err()
}

func (s *Server) cacheDelete(ctx context.Context, keys ...string) {
	if s.redis == nil || len(keys) == 0 {
		return
	}
	_ = s.redis.Del(ctx, keys...).Err()
}

func cacheKey(parts ...string) string {
	return "infinilink:" + stableHash(parts...)
}

func userCacheKey(userID int64) string {
	return cacheKey("user", "self", formatInt64(userID))
}

func publicUserCacheKey(viewerID, userID int64) string {
	return cacheKey("user", "public", formatInt64(viewerID), formatInt64(userID))
}

func formatInt64(value int64) string {
	return strconv.FormatInt(value, 10)
}
