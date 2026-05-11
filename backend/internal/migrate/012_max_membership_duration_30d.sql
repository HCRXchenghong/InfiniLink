UPDATE app_settings
SET setting_value = (
    SELECT jsonb_agg(
        CASE
            WHEN item->>'code' = 'max'
                 AND COALESCE((item->>'duration_days')::int, 90) = 90
            THEN jsonb_set(item, '{duration_days}', to_jsonb(30), true)
            ELSE item
        END
    )
    FROM jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(setting_value) = 'array' THEN setting_value
            ELSE '[]'::jsonb
        END
    ) AS item
)
WHERE setting_key = 'membership_plans'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
          CASE
              WHEN jsonb_typeof(setting_value) = 'array' THEN setting_value
              ELSE '[]'::jsonb
          END
      ) AS item
      WHERE item->>'code' = 'max'
        AND COALESCE((item->>'duration_days')::int, 90) = 90
  );
