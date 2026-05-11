package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type growthRules struct {
	LevelThresholds            []int64 `json:"level_thresholds"`
	OnlineScorePerMinute       int64   `json:"online_score_per_minute"`
	ActiveScorePerMinute       int64   `json:"active_score_per_minute"`
	CommentScore               int64   `json:"comment_score"`
	LikeScore                  int64   `json:"like_score"`
	ProPurchaseBonus           int64   `json:"pro_purchase_bonus"`
	MaxPurchaseBonus           int64   `json:"max_purchase_bonus"`
	ProGrowthMultiplierPercent int64   `json:"pro_growth_multiplier_percent"`
	MaxGrowthMultiplierPercent int64   `json:"max_growth_multiplier_percent"`
}

var defaultGrowthLevelThresholds = []int64{
	0,
	12000,
	32000,
	70000,
	140000,
	260000,
	440000,
	700000,
	1060000,
	1560000,
}

func defaultGrowthRules() growthRules {
	return growthRules{
		LevelThresholds:            append([]int64(nil), defaultGrowthLevelThresholds...),
		OnlineScorePerMinute:       6,
		ActiveScorePerMinute:       14,
		CommentScore:               180,
		LikeScore:                  35,
		ProPurchaseBonus:           3000,
		MaxPurchaseBonus:           9000,
		ProGrowthMultiplierPercent: 115,
		MaxGrowthMultiplierPercent: 135,
	}
}

func cloneLevelThresholds(values []int64) []int64 {
	if len(values) == 0 {
		return []int64{}
	}
	return append([]int64(nil), values...)
}

func normalizeGrowthRules(input growthRules) growthRules {
	defaults := defaultGrowthRules()
	result := defaults
	thresholds := cloneLevelThresholds(defaults.LevelThresholds)

	if len(input.LevelThresholds) > 0 {
		for index := 0; index < len(thresholds) && index < len(input.LevelThresholds); index++ {
			if input.LevelThresholds[index] >= 0 {
				thresholds[index] = input.LevelThresholds[index]
			}
		}
	}
	thresholds[0] = 0
	for index := 1; index < len(thresholds); index++ {
		if thresholds[index] <= thresholds[index-1] {
			fallback := defaults.LevelThresholds[index]
			if fallback <= thresholds[index-1] {
				fallback = thresholds[index-1] + 1
			}
			thresholds[index] = fallback
		}
	}
	result.LevelThresholds = thresholds

	if input.OnlineScorePerMinute > 0 {
		result.OnlineScorePerMinute = input.OnlineScorePerMinute
	}
	if input.ActiveScorePerMinute > 0 {
		result.ActiveScorePerMinute = input.ActiveScorePerMinute
	}
	if input.CommentScore > 0 {
		result.CommentScore = input.CommentScore
	}
	if input.LikeScore > 0 {
		result.LikeScore = input.LikeScore
	}
	if input.ProPurchaseBonus > 0 {
		result.ProPurchaseBonus = input.ProPurchaseBonus
	}
	if input.MaxPurchaseBonus > 0 {
		result.MaxPurchaseBonus = input.MaxPurchaseBonus
	}
	if input.ProGrowthMultiplierPercent >= 100 {
		result.ProGrowthMultiplierPercent = input.ProGrowthMultiplierPercent
	}
	if input.MaxGrowthMultiplierPercent >= result.ProGrowthMultiplierPercent {
		result.MaxGrowthMultiplierPercent = input.MaxGrowthMultiplierPercent
	}
	if result.MaxPurchaseBonus < result.ProPurchaseBonus {
		result.MaxPurchaseBonus = result.ProPurchaseBonus
	}
	return result
}

func (s *Server) getGrowthRules(ctx context.Context) (growthRules, error) {
	return cachedJSON(s, ctx, appSettingCacheKey("growth_rules"), s.cfg.CacheTTL, func(ctx context.Context) (growthRules, error) {
		var raw string
		err := s.db.QueryRow(ctx, `
			SELECT setting_value::text
			FROM app_settings
			WHERE setting_key = 'growth_rules'
		`).Scan(&raw)
		if err != nil {
			return defaultGrowthRules(), nil
		}

		var rules growthRules
		if strings.TrimSpace(raw) != "" && strings.TrimSpace(raw) != "null" {
			if err := json.Unmarshal([]byte(raw), &rules); err != nil {
				return defaultGrowthRules(), nil
			}
		}
		return normalizeGrowthRules(rules), nil
	})
}

func (s *Server) growthRulesOrDefault(ctx context.Context) growthRules {
	rules, err := s.getGrowthRules(ctx)
	if err != nil {
		return defaultGrowthRules()
	}
	return normalizeGrowthRules(rules)
}

func (s *Server) getGrowthRulesCacheVersion(ctx context.Context) (string, error) {
	return cachedJSON(s, ctx, appSettingCacheKey("growth_rules_version"), s.cfg.CacheTTL, func(ctx context.Context) (string, error) {
		var updatedAt sql.NullTime
		if err := s.db.QueryRow(ctx, `
			SELECT updated_at
			FROM app_settings
			WHERE setting_key = 'growth_rules'
		`).Scan(&updatedAt); err != nil {
			return "default", nil
		}
		if updatedAt.Valid {
			return strconv.FormatInt(updatedAt.Time.UnixNano(), 10), nil
		}
		return "default", nil
	})
}

func (s *Server) saveGrowthRules(ctx context.Context, rules growthRules) (growthRules, error) {
	normalized := normalizeGrowthRules(rules)
	raw, err := json.Marshal(normalized)
	if err != nil {
		return growthRules{}, err
	}

	if _, err := s.db.Exec(ctx, `
		INSERT INTO app_settings(setting_key, setting_value, updated_at)
		VALUES ('growth_rules', $1::jsonb, NOW())
		ON CONFLICT (setting_key) DO UPDATE
		SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
	`, string(raw)); err != nil {
		return growthRules{}, err
	}
	if err := s.recalculateAllUserLevels(ctx, normalized.LevelThresholds); err != nil {
		return growthRules{}, err
	}
	s.cacheDelete(ctx,
		appSettingCacheKey("growth_rules"),
		appSettingCacheKey("growth_rules_version"),
		appSettingCacheKey("membership_plans"),
		cacheKey("app", "config"),
		cacheKey("payment", "member-price"),
	)
	return normalized, nil
}

func (s *Server) recalculateAllUserLevels(ctx context.Context, thresholds []int64) error {
	normalized := normalizeGrowthRules(growthRules{LevelThresholds: thresholds}).LevelThresholds
	query := strings.Builder{}
	query.WriteString("UPDATE users SET level_no = CASE")
	args := make([]any, 0, len(normalized))
	for index := len(normalized) - 1; index >= 0; index-- {
		args = append(args, normalized[index])
		query.WriteString(fmt.Sprintf(" WHEN COALESCE(level_score, 0) >= $%d THEN %d", len(args), index+1))
	}
	query.WriteString(" ELSE 1 END, updated_at = NOW()")
	_, err := s.db.Exec(ctx, query.String(), args...)
	return err
}
