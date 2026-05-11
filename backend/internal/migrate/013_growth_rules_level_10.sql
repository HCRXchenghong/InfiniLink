UPDATE app_settings
SET setting_value = jsonb_set(
    setting_value,
    '{level_thresholds}',
    (
        CASE
            WHEN jsonb_typeof(setting_value->'level_thresholds') = 'array'
                 AND jsonb_array_length(setting_value->'level_thresholds') = 9
            THEN (setting_value->'level_thresholds') || to_jsonb(900000)
            ELSE COALESCE(setting_value->'level_thresholds', '[]'::jsonb)
        END
    ),
    true
)
WHERE setting_key = 'growth_rules'
  AND jsonb_typeof(setting_value) = 'object'
  AND jsonb_typeof(setting_value->'level_thresholds') = 'array'
  AND jsonb_array_length(setting_value->'level_thresholds') = 9;
