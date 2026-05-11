package server

import (
	"context"
	"encoding/json"
	"strings"
)

type membershipPlan struct {
	Code                    string   `json:"code"`
	Name                    string   `json:"name"`
	BadgeText               string   `json:"badge_text"`
	Tagline                 string   `json:"tagline"`
	Description             string   `json:"description"`
	ButtonText              string   `json:"button_text"`
	Price                   float64  `json:"price"`
	DurationDays            int      `json:"duration_days"`
	Benefits                []string `json:"benefits"`
	Enabled                 bool     `json:"enabled"`
	SortOrder               int      `json:"sort_order"`
	GrowthBonusScore        int64    `json:"growth_bonus_score"`
	GrowthMultiplierPercent int64    `json:"growth_multiplier_percent"`
	TemporaryOnly           bool     `json:"temporary_only"`
}

const (
	membershipTierNone = ""
	membershipTierPro  = "pro"
	membershipTierMax  = "max"
)

var membershipKnownTiers = []string{
	membershipTierPro,
	membershipTierMax,
}

func normalizeMembershipTier(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case membershipTierPro:
		return membershipTierPro
	case membershipTierMax:
		return membershipTierMax
	default:
		return membershipTierNone
	}
}

func membershipTierRank(value string) int {
	switch normalizeMembershipTier(value) {
	case membershipTierPro:
		return 1
	case membershipTierMax:
		return 2
	default:
		return 0
	}
}

func resolveMembershipTier(isMember bool, tier string) string {
	normalized := normalizeMembershipTier(tier)
	if normalized != "" {
		return normalized
	}
	if isMember {
		return membershipTierPro
	}
	return membershipTierNone
}

func defaultMembershipPlans() []membershipPlan {
	plans := []membershipPlan{
		{
			Code:         membershipTierPro,
			Name:         "Pro",
			BadgeText:    "PRO",
			Tagline:      "适合希望获得会员身份、建圈能力与基础创作支持的用户。",
			Description:  "标准会员方案，覆盖社区身份展示、会员功能入口和内容创作常用能力。",
			ButtonText:   "开通 Pro",
			Price:        99,
			DurationDays: defaultMembershipDurationDays(membershipTierPro),
			Benefits: []string{
				"会员身份标识与个人主页展示",
				"建圈权限与基础圈主管理能力",
				"会员有效期内享受成长值加速与额外成长奖励",
				"会员活动入口与专属公告触达",
			},
			Enabled:   true,
			SortOrder: 10,
		},
		{
			Code:         membershipTierMax,
			Name:         "Max",
			BadgeText:    "MAX",
			Tagline:      "适合重度运营、品牌主理人和高频创作者的进阶会员方案。",
			Description:  "进阶会员方案，包含 Pro 全部能力，并提供更高等级身份和更强运营支持。",
			ButtonText:   "升级 Max",
			Price:        299,
			DurationDays: defaultMembershipDurationDays(membershipTierMax),
			Benefits: []string{
				"包含 Pro 全部会员权益",
				"更高等级身份标识与资料页展示",
				"会员有效期内享受更高成长值加速与额外成长奖励",
				"活动提报、专题合作与客服支持优先级更高",
				"后续上线的高级会员能力优先开放",
			},
			Enabled:   true,
			SortOrder: 20,
		},
	}
	rules := defaultGrowthRules()
	for index := range plans {
		plans[index] = decorateMembershipPlan(plans[index], rules)
	}
	return plans
}

func decorateMembershipPlan(plan membershipPlan, rules growthRules) membershipPlan {
	plan.Code = normalizeMembershipTier(plan.Code)
	plan.GrowthBonusScore = membershipPurchaseBonusScore(rules, plan.Code)
	plan.GrowthMultiplierPercent = membershipGrowthMultiplier(rules, plan.Code)
	plan.TemporaryOnly = true
	return plan
}

func normalizeMembershipBenefits(items []string) []string {
	result := make([]string, 0, len(items))
	for _, item := range items {
		text := limitString(strings.TrimSpace(item), 80)
		if text == "" {
			continue
		}
		result = append(result, text)
	}
	return result
}

func normalizeMembershipPlans(plans []membershipPlan) []membershipPlan {
	return normalizeMembershipPlansWithRules(plans, defaultGrowthRules())
}

func normalizeMembershipPlansWithRules(plans []membershipPlan, rules growthRules) []membershipPlan {
	rules = normalizeGrowthRules(rules)
	defaultMap := map[string]membershipPlan{}
	for _, item := range defaultMembershipPlans() {
		defaultMap[item.Code] = item
	}

	planMap := map[string]membershipPlan{}
	for _, tier := range membershipKnownTiers {
		planMap[tier] = decorateMembershipPlan(defaultMap[tier], rules)
	}

	for _, item := range plans {
		code := normalizeMembershipTier(item.Code)
		if code == "" {
			continue
		}
		base := planMap[code]
		base.Code = code
		base.Name = firstNonEmpty(limitString(strings.TrimSpace(item.Name), 16), base.Name)
		base.BadgeText = firstNonEmpty(limitString(strings.TrimSpace(item.BadgeText), 12), base.BadgeText)
		base.Tagline = firstNonEmpty(limitString(strings.TrimSpace(item.Tagline), 120), base.Tagline)
		base.Description = firstNonEmpty(limitString(strings.TrimSpace(item.Description), 240), base.Description)
		base.ButtonText = firstNonEmpty(limitString(strings.TrimSpace(item.ButtonText), 16), base.ButtonText)
		if item.Price > 0 {
			base.Price = roundMoney(item.Price)
		}
		base.DurationDays = membershipDurationDays(item)
		benefits := normalizeMembershipBenefits(item.Benefits)
		if len(benefits) > 0 {
			base.Benefits = benefits
		}
		base.Enabled = item.Enabled
		if item.SortOrder > 0 {
			base.SortOrder = item.SortOrder
		}
		planMap[code] = decorateMembershipPlan(base, rules)
	}

	result := make([]membershipPlan, 0, len(membershipKnownTiers))
	for _, tier := range membershipKnownTiers {
		result = append(result, decorateMembershipPlan(planMap[tier], rules))
	}
	for i := 0; i < len(result); i++ {
		for j := i + 1; j < len(result); j++ {
			if result[j].SortOrder < result[i].SortOrder {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	return result
}

func (s *Server) getMembershipPlans(ctx context.Context) ([]membershipPlan, error) {
	return cachedJSON(s, ctx, appSettingCacheKey("membership_plans"), s.cfg.CacheTTL, func(ctx context.Context) ([]membershipPlan, error) {
		rules := s.growthRulesOrDefault(ctx)
		var raw string
		err := s.db.QueryRow(ctx, `
			SELECT setting_value::text
			FROM app_settings
			WHERE setting_key = 'membership_plans'
		`).Scan(&raw)
		if err != nil {
			return normalizeMembershipPlansWithRules(nil, rules), nil
		}

		var plans []membershipPlan
		if strings.TrimSpace(raw) != "" && strings.TrimSpace(raw) != "null" {
			if err := json.Unmarshal([]byte(raw), &plans); err != nil {
				return normalizeMembershipPlansWithRules(nil, rules), nil
			}
		}
		return normalizeMembershipPlansWithRules(plans, rules), nil
	})
}

func (s *Server) saveMembershipPlans(ctx context.Context, plans []membershipPlan) ([]membershipPlan, error) {
	normalized := normalizeMembershipPlansWithRules(plans, s.growthRulesOrDefault(ctx))
	raw, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}

	if _, err := s.db.Exec(ctx, `
		INSERT INTO app_settings(setting_key, setting_value, updated_at)
		VALUES ('membership_plans', $1::jsonb, NOW())
		ON CONFLICT (setting_key) DO UPDATE
		SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
	`, string(raw)); err != nil {
		return nil, err
	}

	s.cacheDelete(ctx, appSettingCacheKey("membership_plans"), cacheKey("app", "config"), cacheKey("payment", "member-price"))
	return normalized, nil
}

func membershipPlanByCode(plans []membershipPlan, code string) (membershipPlan, bool) {
	normalized := normalizeMembershipTier(code)
	for _, item := range plans {
		if normalizeMembershipTier(item.Code) == normalized {
			return item, true
		}
	}
	return membershipPlan{}, false
}
