package server

import (
	"context"
	"encoding/json"
	"strings"
)

type operationAd struct {
	ID          string `json:"id"`
	Slot        string `json:"slot"`
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	ImageURL    string `json:"image_url"`
	ActionType  string `json:"action_type"`
	ActionValue string `json:"action_value"`
	ButtonText  string `json:"button_text"`
	Enabled     bool   `json:"enabled"`
	SortOrder   int    `json:"sort_order"`
}

const (
	operationAdSlotFeedStream       = "feed_stream"
	operationAdSlotHomeCarousel     = "home_carousel"
	operationAdSlotSplashScreen     = "splash_screen"
	operationAdSlotPostDetailInline = "post_detail_inline"
)

var operationAdKnownSlots = []string{
	operationAdSlotFeedStream,
	operationAdSlotHomeCarousel,
	operationAdSlotSplashScreen,
	operationAdSlotPostDetailInline,
}

func normalizeOperationAds(ads []operationAd, assetURL func(string) string) []operationAd {
	result := make([]operationAd, 0, len(ads))
	for index, item := range ads {
		slot := normalizeText(item.Slot)
		if slot == "" {
			slot = operationAdSlotFeedStream
		}

		actionType := strings.ToLower(normalizeText(item.ActionType))
		switch actionType {
		case "path", "webview", "none":
		default:
			actionType = "none"
		}

		adID := normalizeText(item.ID)
		if adID == "" {
			adID = "ad-" + formatInt64(int64(index+1))
		}

		imageURL := normalizeText(item.ImageURL)
		if imageURL == "" {
			imageURL = assetURL("illustrations/savings-cuate.png")
		}

		title := limitString(item.Title, 40)
		if title == "" {
			title = "InfiniLink 推荐"
		}

		subtitle := limitString(item.Subtitle, 120)
		buttonText := limitString(item.ButtonText, 12)
		if buttonText == "" {
			buttonText = "立即查看"
		}

		actionValue := normalizeText(item.ActionValue)
		if strings.HasPrefix(strings.ToLower(actionValue), "http://") || strings.HasPrefix(strings.ToLower(actionValue), "https://") {
			if actionType != "none" {
				actionType = "webview"
			}
		}
		if actionType == "path" && actionValue != "" && !strings.HasPrefix(actionValue, "/") {
			actionValue = "/" + strings.TrimLeft(actionValue, "/")
		}

		result = append(result, operationAd{
			ID:          adID,
			Slot:        slot,
			Title:       title,
			Subtitle:    subtitle,
			ImageURL:    imageURL,
			ActionType:  actionType,
			ActionValue: actionValue,
			ButtonText:  buttonText,
			Enabled:     item.Enabled,
			SortOrder:   item.SortOrder,
		})
	}

	if len(result) == 0 {
		return defaultOperationAds(assetURL)
	}

	defaults := defaultOperationAds(assetURL)
	for _, fallback := range defaults {
		exists := false
		for _, item := range result {
			if normalizeText(item.Slot) == normalizeText(fallback.Slot) {
				exists = true
				break
			}
		}
		if !exists {
			result = append(result, fallback)
		}
	}

	sortOperationAds(result)
	return result
}

func sortOperationAds(ads []operationAd) {
	for i := 0; i < len(ads); i++ {
		for j := i + 1; j < len(ads); j++ {
			if ads[j].SortOrder < ads[i].SortOrder || (ads[j].SortOrder == ads[i].SortOrder && ads[j].ID < ads[i].ID) {
				ads[i], ads[j] = ads[j], ads[i]
			}
		}
	}
}

func defaultOperationAds(assetURL func(string) string) []operationAd {
	return []operationAd{
		{
			ID:          "feed-membership",
			Slot:        operationAdSlotFeedStream,
			Title:       "InfiniLink 会员计划",
			Subtitle:    "解锁更多展示能力、身份标识和内容支持权益。",
			ImageURL:    assetURL("illustrations/plain-credit-card-cuate.png"),
			ActionType:  "path",
			ActionValue: "/pages/mine/members/members",
			ButtonText:  "查看权益",
			Enabled:     true,
			SortOrder:   10,
		},
		{
			ID:          "carousel-brand-story",
			Slot:        operationAdSlotHomeCarousel,
			Title:       "InfiniLink 品牌专区",
			Subtitle:    "在首页轮播展示你的活动、专题和转化入口。",
			ImageURL:    assetURL("illustrations/world-rafiki.png"),
			ActionType:  "path",
			ActionValue: "/pages/tabbar/index/index",
			ButtonText:  "进入查看",
			Enabled:     true,
			SortOrder:   20,
		},
		{
			ID:          "splash-membership",
			Slot:        operationAdSlotSplashScreen,
			Title:       "欢迎来到 InfiniLink",
			Subtitle:    "开屏位已接入后台，可配置活动图、品牌曝光和会员转化入口。",
			ImageURL:    assetURL("illustrations/outer-space-rafiki.png"),
			ActionType:  "path",
			ActionValue: "/pages/mine/members/members",
			ButtonText:  "立即查看",
			Enabled:     true,
			SortOrder:   30,
		},
		{
			ID:          "detail-support",
			Slot:        operationAdSlotPostDetailInline,
			Title:       "内容创作支持计划",
			Subtitle:    "文章详情页广告位已经接通，可投放专题活动、商品或会员权益。",
			ImageURL:    assetURL("illustrations/savings-cuate.png"),
			ActionType:  "path",
			ActionValue: "/pages/mine/members/members",
			ButtonText:  "查看计划",
			Enabled:     true,
			SortOrder:   40,
		},
	}
}

func groupOperationAdsBySlot(ads []operationAd) map[string]any {
	grouped := make(map[string]any, len(operationAdKnownSlots))
	for _, slot := range operationAdKnownSlots {
		grouped[slot] = filterOperationAdsBySlot(ads, slot)
	}
	return grouped
}

func (s *Server) getOperationAds(ctx context.Context) ([]operationAd, error) {
	return cachedJSON(s, ctx, appSettingCacheKey("operation_ads"), s.cfg.CacheTTL, func(ctx context.Context) ([]operationAd, error) {
		var raw string
		err := s.db.QueryRow(ctx, `
			SELECT setting_value::text
			FROM app_settings
			WHERE setting_key = 'operation_ads'
		`).Scan(&raw)
		if err != nil {
			return defaultOperationAds(s.assetURL), nil
		}

		var ads []operationAd
		if strings.TrimSpace(raw) != "" && strings.TrimSpace(raw) != "null" {
			if err := json.Unmarshal([]byte(raw), &ads); err != nil {
				return defaultOperationAds(s.assetURL), nil
			}
		}
		return normalizeOperationAds(ads, s.assetURL), nil
	})
}

func (s *Server) saveOperationAds(ctx context.Context, ads []operationAd) ([]operationAd, error) {
	normalized := normalizeOperationAds(ads, s.assetURL)
	raw, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}

	if _, err := s.db.Exec(ctx, `
		INSERT INTO app_settings(setting_key, setting_value, updated_at)
		VALUES ('operation_ads', $1::jsonb, NOW())
		ON CONFLICT (setting_key) DO UPDATE
		SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
	`, string(raw)); err != nil {
		return nil, err
	}
	s.cacheDelete(ctx, appSettingCacheKey("operation_ads"), cacheKey("app", "config"))
	return normalized, nil
}

func filterOperationAdsBySlot(ads []operationAd, slot string) []operationAd {
	slot = normalizeText(slot)
	if slot == "" {
		return ads
	}
	filtered := make([]operationAd, 0, len(ads))
	for _, item := range ads {
		if !item.Enabled {
			continue
		}
		if normalizeText(item.Slot) == slot {
			filtered = append(filtered, item)
		}
	}
	return filtered
}
