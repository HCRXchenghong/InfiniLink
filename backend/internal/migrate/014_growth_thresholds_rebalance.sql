UPDATE app_settings
SET setting_value = jsonb_set(
        setting_value,
        '{level_thresholds}',
        '[0,12000,32000,70000,140000,260000,440000,700000,1060000,1560000]'::jsonb,
        true
    ),
    updated_at = NOW()
WHERE setting_key = 'growth_rules'
  AND jsonb_typeof(setting_value) = 'object'
  AND (
    setting_value->'level_thresholds' = '[0,8000,22000,50000,95000,165000,270000,420000,620000,900000]'::jsonb
    OR setting_value->'level_thresholds' = '[0,8000,22000,50000,95000,165000,270000,420000,620000]'::jsonb
  );

WITH effective_thresholds AS (
  SELECT
    COALESCE(NULLIF((thresholds->>1), '')::bigint, 12000) AS lv2,
    COALESCE(NULLIF((thresholds->>2), '')::bigint, 32000) AS lv3,
    COALESCE(NULLIF((thresholds->>3), '')::bigint, 70000) AS lv4,
    COALESCE(NULLIF((thresholds->>4), '')::bigint, 140000) AS lv5,
    COALESCE(NULLIF((thresholds->>5), '')::bigint, 260000) AS lv6,
    COALESCE(NULLIF((thresholds->>6), '')::bigint, 440000) AS lv7,
    COALESCE(NULLIF((thresholds->>7), '')::bigint, 700000) AS lv8,
    COALESCE(NULLIF((thresholds->>8), '')::bigint, 1060000) AS lv9,
    COALESCE(NULLIF((thresholds->>9), '')::bigint, 1560000) AS lv10
  FROM (
    SELECT COALESCE(
      (
        SELECT CASE
          WHEN jsonb_typeof(setting_value) = 'object'
           AND jsonb_typeof(setting_value->'level_thresholds') = 'array'
          THEN setting_value->'level_thresholds'
          ELSE NULL
        END
        FROM app_settings
        WHERE setting_key = 'growth_rules'
        LIMIT 1
      ),
      '[0,12000,32000,70000,140000,260000,440000,700000,1060000,1560000]'::jsonb
    ) AS thresholds
  ) resolved
)
UPDATE users
SET level_no = CASE
    WHEN COALESCE(level_score, 0) >= (SELECT lv10 FROM effective_thresholds) THEN 10
    WHEN COALESCE(level_score, 0) >= (SELECT lv9 FROM effective_thresholds) THEN 9
    WHEN COALESCE(level_score, 0) >= (SELECT lv8 FROM effective_thresholds) THEN 8
    WHEN COALESCE(level_score, 0) >= (SELECT lv7 FROM effective_thresholds) THEN 7
    WHEN COALESCE(level_score, 0) >= (SELECT lv6 FROM effective_thresholds) THEN 6
    WHEN COALESCE(level_score, 0) >= (SELECT lv5 FROM effective_thresholds) THEN 5
    WHEN COALESCE(level_score, 0) >= (SELECT lv4 FROM effective_thresholds) THEN 4
    WHEN COALESCE(level_score, 0) >= (SELECT lv3 FROM effective_thresholds) THEN 3
    WHEN COALESCE(level_score, 0) >= (SELECT lv2 FROM effective_thresholds) THEN 2
    ELSE 1
  END,
  updated_at = NOW();
