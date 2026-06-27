-- =====================================================
-- RESYNC MENU CATALOG AND CORE ADMIN TAGS
-- Keeps the catalog populated from all historical menu sources and ensures
-- the admin UI has stable GF/LC/KF tags to toggle.
-- =====================================================

WITH dietary_group AS (
  INSERT INTO menu_tag_groups (name, slug, description, sort_order)
  VALUES ('Dietary', 'dietary', 'Diet and restriction tags', 10)
  ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order
  RETURNING id
),
audience_group AS (
  INSERT INTO menu_tag_groups (name, slug, description, sort_order)
  VALUES ('Audience', 'audience', 'Who the dish tends to work well for', 20)
  ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order
  RETURNING id
),
core_tags(group_slug, name, slug, description, color) AS (
  VALUES
    ('dietary', 'Gluten Free', 'gluten-free', 'No gluten ingredients', 'emerald'),
    ('dietary', 'Low Carb', 'low-carb', 'Lower carbohydrate dish', 'sky'),
    ('audience', 'Kid Friendly', 'kid-friendly', 'Usually works well for kids', 'amber')
)
INSERT INTO menu_tags (group_id, name, slug, description, color)
SELECT
  CASE
    WHEN core_tags.group_slug = 'dietary' THEN dietary_group.id
    ELSE audience_group.id
  END,
  core_tags.name,
  core_tags.slug,
  core_tags.description,
  core_tags.color
FROM core_tags
CROSS JOIN dietary_group
CROSS JOIN audience_group
ON CONFLICT (slug) DO UPDATE
  SET
    group_id = EXCLUDED.group_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    color = EXCLUDED.color;

CREATE OR REPLACE FUNCTION sync_menu_catalog_from_history()
RETURNS VOID AS $$
BEGIN
  UPDATE menu_items
  SET
    normalized_name = normalize_menu_item_name(name),
    search_text = normalize_menu_item_name(
      concat_ws(' ', name, description, array_to_string(aliases, ' '), array_to_string(meal_types, ' '))
    )
  WHERE normalized_name IS NULL
    OR search_text IS NULL;

  WITH raw_items AS (
    SELECT btrim(menu_item) AS name, meal_type AS meal_type, NULL::DATE AS served_at
    FROM menu_ratings
    WHERE menu_item IS NOT NULL
      AND btrim(menu_item) <> ''

    UNION ALL

    SELECT btrim(food_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM food_requests
    WHERE food_name IS NOT NULL
      AND btrim(food_name) <> ''

    UNION ALL

    SELECT btrim(source_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE source_name IS NOT NULL
      AND btrim(source_name) <> ''

    UNION ALL

    SELECT btrim(canonical_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE canonical_name IS NOT NULL
      AND btrim(canonical_name) <> ''

    UNION ALL

    SELECT
      btrim(regexp_replace(line, '^[[:space:]\-\*]+', '', 'g')) AS name,
      meal.meal_type,
      weekly_menu.week_start AS served_at
    FROM weekly_menu
    CROSS JOIN LATERAL jsonb_array_elements(weekly_menu.meals) AS day_meal
    CROSS JOIN LATERAL (
      VALUES
        ('breakfast', day_meal ->> 'breakfast'),
        ('lunch', day_meal ->> 'lunch'),
        ('dinner', day_meal ->> 'dinner'),
        ('snacks', day_meal ->> 'snacks')
    ) AS meal(meal_type, content)
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(meal.content, ''), E'\\n+') AS line
    WHERE btrim(line) <> ''
  ),
  clean_items AS (
    SELECT *
    FROM raw_items
    WHERE is_likely_menu_catalog_item(name)
  ),
  aggregated AS (
    SELECT
      normalize_menu_item_name(name) AS normalized_name,
      (array_agg(name ORDER BY length(name), name))[1] AS display_name,
      array_remove(array_agg(DISTINCT meal_type), NULL) AS meal_types,
      count(*)::INTEGER AS times_seen,
      max(served_at) AS last_served_at
    FROM clean_items
    GROUP BY normalize_menu_item_name(name)
  )
  UPDATE menu_items
  SET
    active = CASE WHEN merged_into_id IS NULL THEN TRUE ELSE active END,
    category = coalesce(menu_items.category, NULLIF((aggregated.meal_types)[1], '')),
    meal_types = (
      SELECT coalesce(array_agg(DISTINCT meal_type ORDER BY meal_type), '{}'::TEXT[])
      FROM unnest(menu_items.meal_types || coalesce(aggregated.meal_types, '{}'::TEXT[])) AS meal_types(meal_type)
      WHERE meal_type IS NOT NULL
        AND meal_type <> ''
    ),
    times_served = GREATEST(coalesce(menu_items.times_served, 0), aggregated.times_seen),
    last_served_at = CASE
      WHEN menu_items.last_served_at IS NULL THEN aggregated.last_served_at
      WHEN aggregated.last_served_at IS NULL THEN menu_items.last_served_at
      ELSE GREATEST(menu_items.last_served_at, aggregated.last_served_at)
    END,
    search_text = normalize_menu_item_name(
      concat_ws(' ', menu_items.name, menu_items.description, array_to_string(menu_items.aliases, ' '), array_to_string(menu_items.meal_types, ' '))
    )
  FROM aggregated
  WHERE menu_items.normalized_name = aggregated.normalized_name;

  WITH raw_items AS (
    SELECT btrim(menu_item) AS name, meal_type AS meal_type, NULL::DATE AS served_at
    FROM menu_ratings
    WHERE menu_item IS NOT NULL
      AND btrim(menu_item) <> ''

    UNION ALL

    SELECT btrim(food_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM food_requests
    WHERE food_name IS NOT NULL
      AND btrim(food_name) <> ''

    UNION ALL

    SELECT btrim(source_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE source_name IS NOT NULL
      AND btrim(source_name) <> ''

    UNION ALL

    SELECT btrim(canonical_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE canonical_name IS NOT NULL
      AND btrim(canonical_name) <> ''

    UNION ALL

    SELECT
      btrim(regexp_replace(line, '^[[:space:]\-\*]+', '', 'g')) AS name,
      meal.meal_type,
      weekly_menu.week_start AS served_at
    FROM weekly_menu
    CROSS JOIN LATERAL jsonb_array_elements(weekly_menu.meals) AS day_meal
    CROSS JOIN LATERAL (
      VALUES
        ('breakfast', day_meal ->> 'breakfast'),
        ('lunch', day_meal ->> 'lunch'),
        ('dinner', day_meal ->> 'dinner'),
        ('snacks', day_meal ->> 'snacks')
    ) AS meal(meal_type, content)
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(meal.content, ''), E'\\n+') AS line
    WHERE btrim(line) <> ''
  ),
  clean_items AS (
    SELECT *
    FROM raw_items
    WHERE is_likely_menu_catalog_item(name)
  ),
  aggregated AS (
    SELECT
      normalize_menu_item_name(name) AS normalized_name,
      (array_agg(name ORDER BY length(name), name))[1] AS display_name,
      array_remove(array_agg(DISTINCT meal_type), NULL) AS meal_types,
      count(*)::INTEGER AS times_seen,
      max(served_at) AS last_served_at
    FROM clean_items
    GROUP BY normalize_menu_item_name(name)
  )
  INSERT INTO menu_items (name, normalized_name, meal_types, category, times_served, last_served_at, search_text)
  SELECT
    aggregated.display_name,
    aggregated.normalized_name,
    coalesce(aggregated.meal_types, '{}'::TEXT[]),
    NULLIF((aggregated.meal_types)[1], ''),
    aggregated.times_seen,
    aggregated.last_served_at,
    normalize_menu_item_name(aggregated.display_name)
  FROM aggregated
  WHERE NOT EXISTS (
    SELECT 1
    FROM menu_items
    WHERE menu_items.normalized_name = aggregated.normalized_name
  )
  ON CONFLICT (name) DO NOTHING;

  UPDATE menu_ratings
  SET menu_item_id = menu_items.id
  FROM menu_items
  WHERE menu_ratings.menu_item_id IS NULL
    AND menu_items.active = TRUE
    AND menu_items.normalized_name = normalize_menu_item_name(menu_ratings.menu_item);

  UPDATE food_requests
  SET menu_item_id = menu_items.id
  FROM menu_items
  WHERE food_requests.menu_item_id IS NULL
    AND menu_items.active = TRUE
    AND menu_items.normalized_name = normalize_menu_item_name(food_requests.food_name);

  WITH rating_stats AS (
    SELECT
      menu_item_id,
      count(*)::INTEGER AS total_ratings,
      round(avg(rating)::NUMERIC, 1) AS average_rating
    FROM menu_ratings
    WHERE menu_item_id IS NOT NULL
    GROUP BY menu_item_id
  )
  UPDATE menu_items
  SET
    total_ratings = rating_stats.total_ratings,
    average_rating = rating_stats.average_rating
  FROM rating_stats
  WHERE menu_items.id = rating_stats.menu_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT sync_menu_catalog_from_history();

REVOKE EXECUTE ON FUNCTION sync_menu_catalog_from_history() FROM PUBLIC;
