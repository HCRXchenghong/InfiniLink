package server

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	defaultProMembershipDays = 30
	defaultMaxMembershipDays = 30
	freeMembershipDays       = 7

	growthMultiplierBase = int64(100)
	maxMembershipDays    = 3650
)

type membershipState struct {
	Active    bool
	Tier      string
	ExpiresAt sql.NullTime
}

type userGrowthState struct {
	Score      int64
	Membership membershipState
}

func defaultMembershipDurationDays(tier string) int {
	switch normalizeMembershipTier(tier) {
	case membershipTierMax:
		return defaultMaxMembershipDays
	default:
		return defaultProMembershipDays
	}
}

func sanitizeMembershipDurationDays(tier string, value int) int {
	if value <= 0 {
		return defaultMembershipDurationDays(tier)
	}
	if value > maxMembershipDays {
		return maxMembershipDays
	}
	return value
}

func membershipDurationDays(plan membershipPlan) int {
	return sanitizeMembershipDurationDays(plan.Code, plan.DurationDays)
}

func membershipPurchaseBonusScore(rules growthRules, tier string) int64 {
	rules = normalizeGrowthRules(rules)
	switch normalizeMembershipTier(tier) {
	case membershipTierMax:
		return rules.MaxPurchaseBonus
	case membershipTierPro:
		return rules.ProPurchaseBonus
	default:
		return 0
	}
}

func membershipGrowthMultiplier(rules growthRules, tier string) int64 {
	rules = normalizeGrowthRules(rules)
	switch normalizeMembershipTier(tier) {
	case membershipTierMax:
		return rules.MaxGrowthMultiplierPercent
	case membershipTierPro:
		return rules.ProGrowthMultiplierPercent
	default:
		return growthMultiplierBase
	}
}

func applyMembershipGrowthMultiplier(rules growthRules, baseScore int64, tier string) int64 {
	if baseScore <= 0 {
		return 0
	}
	multiplier := membershipGrowthMultiplier(rules, tier)
	return (baseScore*multiplier + growthMultiplierBase - 1) / growthMultiplierBase
}

func activityGrowthScore(rules growthRules, onlineSeconds, activeSeconds int64) int64 {
	rules = normalizeGrowthRules(rules)
	if onlineSeconds < 0 {
		onlineSeconds = 0
	}
	if activeSeconds < 0 {
		activeSeconds = 0
	}
	return (onlineSeconds*rules.OnlineScorePerMinute + activeSeconds*rules.ActiveScorePerMinute) / 60
}

func resolveMembershipState(isMember bool, tier string, expiresAt sql.NullTime, now time.Time) membershipState {
	normalizedTier := resolveMembershipTier(isMember, tier)
	if normalizedTier == "" {
		return membershipState{ExpiresAt: expiresAt}
	}
	if expiresAt.Valid && !expiresAt.Time.After(now) {
		return membershipState{ExpiresAt: expiresAt}
	}
	return membershipState{
		Active:    true,
		Tier:      normalizedTier,
		ExpiresAt: expiresAt,
	}
}

func membershipDaysLeft(state membershipState, now time.Time) int {
	if !state.Active || !state.ExpiresAt.Valid {
		return 0
	}
	remaining := state.ExpiresAt.Time.Sub(now)
	if remaining <= 0 {
		return 0
	}
	return int((remaining + 24*time.Hour - time.Nanosecond) / (24 * time.Hour))
}

func buildMembershipPayload(state membershipState, now time.Time) map[string]any {
	expireText := ""
	if state.ExpiresAt.Valid {
		expireText = formatListDatetime(state.ExpiresAt.Time)
	}
	return map[string]any{
		"is_member":               boolToInt(state.Active),
		"membership_active":       boolToInt(state.Active),
		"membership_tier":         state.Tier,
		"membership_expires_at":   nullableTime(state.ExpiresAt),
		"membership_expire_text":  expireText,
		"membership_days_left":    membershipDaysLeft(state, now),
		"membership_is_temporary": 1,
	}
}

func resolveLevelNo(thresholds []int64, score int64) int {
	thresholds = normalizeGrowthRules(growthRules{LevelThresholds: thresholds}).LevelThresholds
	if score < 0 {
		score = 0
	}
	for index := len(thresholds) - 1; index >= 0; index-- {
		if score >= thresholds[index] {
			return index + 1
		}
	}
	return 1
}

func levelLabel(level int) string {
	if level < 1 {
		level = 1
	}
	maxLevel := len(defaultGrowthLevelThresholds)
	if level > maxLevel {
		level = maxLevel
	}
	return fmt.Sprintf("LV%d", level)
}

func buildLevelPayload(rules growthRules, score int64) map[string]any {
	rules = normalizeGrowthRules(rules)
	thresholds := rules.LevelThresholds
	if score < 0 {
		score = 0
	}
	level := resolveLevelNo(thresholds, score)
	currentMin := thresholds[level-1]
	nextLevel := level
	nextMin := currentMin
	progressPercent := 100
	scoreToNext := int64(0)
	if level < len(thresholds) {
		nextLevel = level + 1
		nextMin = thresholds[level]
		scoreToNext = nextMin - score
		if scoreToNext < 0 {
			scoreToNext = 0
		}
		rangeScore := nextMin - currentMin
		if rangeScore > 0 {
			progressPercent = int(((score - currentMin) * 100) / rangeScore)
			if progressPercent < 0 {
				progressPercent = 0
			}
			if progressPercent > 100 {
				progressPercent = 100
			}
		}
	}
	return map[string]any{
		"level_no":                level,
		"level_label":             levelLabel(level),
		"level_score":             score,
		"level_current_min_score": currentMin,
		"level_next_no":           nextLevel,
		"level_next_label":        levelLabel(nextLevel),
		"level_next_min_score":    nextMin,
		"level_score_to_next":     scoreToNext,
		"level_progress_percent":  progressPercent,
		"level_max_reached":       boolToInt(level >= len(thresholds)),
		"level_rule_version":      "settings",
	}
}

func (s *Server) withGrowthTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Server) loadUserGrowthStateForUpdate(ctx context.Context, tx pgx.Tx, userID int64) (userGrowthState, error) {
	var (
		score     int64
		isMember  bool
		tier      sql.NullString
		expiresAt sql.NullTime
	)
	err := tx.QueryRow(ctx, `
		SELECT
			COALESCE(level_score, 0),
			COALESCE(is_member, FALSE),
			COALESCE(membership_tier, ''),
			membership_expires_at
		FROM users
		WHERE id = $1
		FOR UPDATE
	`, userID).Scan(&score, &isMember, &tier, &expiresAt)
	if err != nil {
		return userGrowthState{}, err
	}
	return userGrowthState{
		Score:      score,
		Membership: resolveMembershipState(isMember, tier.String, expiresAt, time.Now()),
	}, nil
}

func (s *Server) updateUserGrowthStatsTx(ctx context.Context, tx pgx.Tx, rules growthRules, userID int64, currentScore, scoreDelta, onlineDelta, activeDelta, commentDelta, likeDelta, membershipBonusDelta int64) error {
	nextScore := currentScore + scoreDelta
	if nextScore < 0 {
		nextScore = 0
	}
	nextLevel := resolveLevelNo(rules.LevelThresholds, nextScore)
	_, err := tx.Exec(ctx, `
		UPDATE users
		SET
			level_score = $2,
			level_no = $3,
			online_seconds = COALESCE(online_seconds, 0) + $4,
			active_seconds = COALESCE(active_seconds, 0) + $5,
			comment_growth_count = COALESCE(comment_growth_count, 0) + $6,
			like_growth_count = COALESCE(like_growth_count, 0) + $7,
			membership_bonus_score = COALESCE(membership_bonus_score, 0) + $8,
			last_online_at = CASE WHEN $4 > 0 THEN NOW() ELSE last_online_at END,
			last_active_at = CASE WHEN $5 > 0 THEN NOW() ELSE last_active_at END,
			updated_at = NOW()
		WHERE id = $1
	`, userID, nextScore, nextLevel, onlineDelta, activeDelta, commentDelta, likeDelta, membershipBonusDelta)
	return err
}

func (s *Server) insertGrowthEventTx(ctx context.Context, tx pgx.Tx, userID int64, eventType, refType string, refID, scoreDelta int64) (bool, error) {
	tag, err := tx.Exec(ctx, `
		INSERT INTO user_growth_events(user_id, event_type, ref_type, ref_id, score_delta)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, event_type, ref_type, ref_id) DO NOTHING
	`, userID, eventType, refType, refID, scoreDelta)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func clampInt64(value, minValue, maxValue int64) int64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func (s *Server) recordUserActivity(ctx context.Context, userID int64, onlineSeconds, activeSeconds int64) error {
	onlineSeconds = clampInt64(onlineSeconds, 0, 600)
	activeSeconds = clampInt64(activeSeconds, 0, 300)
	if userID <= 0 || (onlineSeconds == 0 && activeSeconds == 0) {
		return nil
	}
	rules := s.growthRulesOrDefault(ctx)
	if err := s.withGrowthTx(ctx, func(tx pgx.Tx) error {
		state, err := s.loadUserGrowthStateForUpdate(ctx, tx, userID)
		if err != nil {
			return err
		}
		scoreDelta := activityGrowthScore(rules, onlineSeconds, activeSeconds)
		if state.Membership.Active {
			scoreDelta = applyMembershipGrowthMultiplier(rules, scoreDelta, state.Membership.Tier)
		}
		return s.updateUserGrowthStatsTx(ctx, tx, rules, userID, state.Score, scoreDelta, onlineSeconds, activeSeconds, 0, 0, 0)
	}); err != nil {
		return err
	}
	s.cacheDelete(ctx, userCacheKey(userID))
	return nil
}

func (s *Server) recordUserGrowthEvent(ctx context.Context, userID int64, eventType, refType string, refID, baseScore, commentDelta, likeDelta, membershipBonusDelta int64, applyMembershipMultiplier bool) error {
	if userID <= 0 || refID <= 0 {
		return nil
	}
	rules := s.growthRulesOrDefault(ctx)
	if err := s.withGrowthTx(ctx, func(tx pgx.Tx) error {
		inserted, err := s.insertGrowthEventTx(ctx, tx, userID, eventType, refType, refID, baseScore)
		if err != nil || !inserted {
			return err
		}
		state, err := s.loadUserGrowthStateForUpdate(ctx, tx, userID)
		if err != nil {
			return err
		}
		scoreDelta := baseScore
		if applyMembershipMultiplier && state.Membership.Active {
			scoreDelta = applyMembershipGrowthMultiplier(rules, scoreDelta, state.Membership.Tier)
		}
		return s.updateUserGrowthStatsTx(ctx, tx, rules, userID, state.Score, scoreDelta, 0, 0, commentDelta, likeDelta, membershipBonusDelta)
	}); err != nil {
		return err
	}
	s.cacheDelete(ctx, userCacheKey(userID))
	return nil
}

func (s *Server) applyMembershipToUserTx(ctx context.Context, tx pgx.Tx, userID int64, tier string, durationDays int) (membershipState, error) {
	targetTier := normalizeMembershipTier(tier)
	if targetTier == "" {
		targetTier = membershipTierPro
	}
	durationDays = sanitizeMembershipDurationDays(targetTier, durationDays)

	var (
		isMember  bool
		current   sql.NullString
		expiresAt sql.NullTime
	)
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(is_member, FALSE), COALESCE(membership_tier, ''), membership_expires_at
		FROM users
		WHERE id = $1
		FOR UPDATE
	`, userID).Scan(&isMember, &current, &expiresAt); err != nil {
		return membershipState{}, err
	}

	now := time.Now()
	currentState := resolveMembershipState(isMember, current.String, expiresAt, now)
	effectiveTier := targetTier
	if currentState.Active && membershipTierRank(currentState.Tier) > membershipTierRank(effectiveTier) {
		effectiveTier = currentState.Tier
	}
	baseTime := now
	if currentState.Active && currentState.ExpiresAt.Valid && currentState.ExpiresAt.Time.After(baseTime) {
		baseTime = currentState.ExpiresAt.Time
	}
	nextExpiresAt := baseTime.AddDate(0, 0, durationDays)
	nextState := resolveMembershipState(true, effectiveTier, sql.NullTime{Time: nextExpiresAt, Valid: true}, now)
	_, err := tx.Exec(ctx, `
		UPDATE users
		SET is_member = TRUE, membership_tier = $2, membership_expires_at = $3, updated_at = NOW()
		WHERE id = $1
	`, userID, effectiveTier, nextExpiresAt)
	return nextState, err
}

func (s *Server) clearMembershipForUserTx(ctx context.Context, tx pgx.Tx, userID int64) error {
	_, err := tx.Exec(ctx, `
		UPDATE users
		SET is_member = FALSE, membership_tier = '', membership_expires_at = NULL, updated_at = NOW()
		WHERE id = $1
	`, userID)
	return err
}

func (s *Server) recordMembershipPurchaseBonusTx(ctx context.Context, tx pgx.Tx, userID, orderID int64, planCode string) error {
	rules := s.growthRulesOrDefault(ctx)
	bonus := membershipPurchaseBonusScore(rules, planCode)
	if bonus <= 0 || userID <= 0 || orderID <= 0 {
		return nil
	}
	inserted, err := s.insertGrowthEventTx(ctx, tx, userID, "membership_purchase", "order", orderID, bonus)
	if err != nil || !inserted {
		return err
	}
	state, err := s.loadUserGrowthStateForUpdate(ctx, tx, userID)
	if err != nil {
		return err
	}
	return s.updateUserGrowthStatsTx(ctx, tx, rules, userID, state.Score, bonus, 0, 0, 0, 0, bonus)
}

type growthDB interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}
