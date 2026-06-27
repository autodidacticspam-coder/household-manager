-- =====================================================
-- MENU CATALOG, TAGS, AND CATALOG-BASED MERGES
-- Turns historical text menu items into searchable records.
-- =====================================================

CREATE OR REPLACE FUNCTION normalize_menu_item_name(input TEXT)
RETURNS TEXT AS $$
  SELECT lower(regexp_replace(btrim(coalesce(input, '')), '\s+', ' ', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

-- Upgrade the existing menu_items table from the early food request schema.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS normalized_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS meal_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS search_text TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_note TEXT;

UPDATE menu_items
SET
  normalized_name = normalize_menu_item_name(name),
  search_text = normalize_menu_item_name(concat_ws(' ', name, description, array_to_string(aliases, ' ')))
WHERE normalized_name IS NULL OR search_text IS NULL;

ALTER TABLE menu_items
  ALTER COLUMN normalized_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_normalized_name
  ON menu_items(normalized_name);

CREATE INDEX IF NOT EXISTS idx_menu_items_active_name
  ON menu_items(active, name);

CREATE INDEX IF NOT EXISTS idx_menu_items_search_text
  ON menu_items(search_text);

CREATE INDEX IF NOT EXISTS idx_menu_items_aliases
  ON menu_items USING GIN(aliases);

CREATE INDEX IF NOT EXISTS idx_menu_items_meal_types
  ON menu_items USING GIN(meal_types);

CREATE OR REPLACE FUNCTION update_menu_item_catalog_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_name := normalize_menu_item_name(NEW.name);
  NEW.search_text := normalize_menu_item_name(
    concat_ws(' ', NEW.name, NEW.description, array_to_string(NEW.aliases, ' '), array_to_string(NEW.meal_types, ' '))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_menu_item_catalog_fields ON menu_items;
CREATE TRIGGER update_menu_item_catalog_fields
  BEFORE INSERT OR UPDATE OF name, description, aliases, meal_types
  ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_menu_item_catalog_fields();

-- Grouped tags: Dietary -> Gluten Free, Audience -> Kid Friendly, etc.
CREATE TABLE IF NOT EXISTS menu_tag_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (length(btrim(name)) > 0),
  CHECK (length(btrim(slug)) > 0)
);

CREATE TRIGGER update_menu_tag_groups_updated_at
  BEFORE UPDATE ON menu_tag_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS menu_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES menu_tag_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (length(btrim(name)) > 0),
  CHECK (length(btrim(slug)) > 0)
);

CREATE TRIGGER update_menu_tags_updated_at
  BEFORE UPDATE ON menu_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_menu_tags_group_id ON menu_tags(group_id);
CREATE INDEX IF NOT EXISTS idx_menu_tags_slug ON menu_tags(slug);

CREATE TABLE IF NOT EXISTS menu_item_tags (
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES menu_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_tags_tag_id ON menu_item_tags(tag_id);

ALTER TABLE menu_tag_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view menu tag groups" ON menu_tag_groups;
CREATE POLICY "Everyone can view menu tag groups"
  ON menu_tag_groups FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and chefs can manage menu tag groups" ON menu_tag_groups;
CREATE POLICY "Admins and chefs can manage menu tag groups"
  ON menu_tag_groups FOR ALL
  USING (is_admin_or_chef())
  WITH CHECK (is_admin_or_chef());

DROP POLICY IF EXISTS "Everyone can view menu tags" ON menu_tags;
CREATE POLICY "Everyone can view menu tags"
  ON menu_tags FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and chefs can manage menu tags" ON menu_tags;
CREATE POLICY "Admins and chefs can manage menu tags"
  ON menu_tags FOR ALL
  USING (is_admin_or_chef())
  WITH CHECK (is_admin_or_chef());

DROP POLICY IF EXISTS "Everyone can view menu item tags" ON menu_item_tags;
CREATE POLICY "Everyone can view menu item tags"
  ON menu_item_tags FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and chefs can manage menu item tags" ON menu_item_tags;
CREATE POLICY "Admins and chefs can manage menu item tags"
  ON menu_item_tags FOR ALL
  USING (is_admin_or_chef())
  WITH CHECK (is_admin_or_chef());

INSERT INTO menu_tag_groups (name, slug, description, sort_order)
VALUES
  ('Dietary', 'dietary', 'Diet and restriction tags', 10),
  ('Audience', 'audience', 'Who the dish tends to work well for', 20),
  ('Protein', 'protein', 'Primary protein or main ingredient', 30),
  ('Cuisine', 'cuisine', 'Cuisine or flavor family', 40),
  ('Prep', 'prep', 'Kitchen and serving style', 50)
ON CONFLICT (slug) DO NOTHING;

WITH default_tags(group_slug, name, slug, description, color) AS (
  VALUES
    ('dietary', 'Gluten Free', 'gluten-free', 'No gluten ingredients', 'emerald'),
    ('dietary', 'Low Carb', 'low-carb', 'Lower carbohydrate dish', 'sky'),
    ('dietary', 'Vegetarian', 'vegetarian', 'No meat or seafood', 'green'),
    ('dietary', 'Dairy Free', 'dairy-free', 'No dairy ingredients', 'teal'),
    ('audience', 'Kid Friendly', 'kid-friendly', 'Usually works well for kids', 'amber'),
    ('audience', 'Family Favorite', 'family-favorite', 'Known favorite or reliable repeat', 'rose'),
    ('protein', 'Beef', 'beef', 'Beef-forward dish', 'red'),
    ('protein', 'Chicken', 'chicken', 'Chicken-forward dish', 'orange'),
    ('protein', 'Pork', 'pork', 'Pork-forward dish', 'pink'),
    ('protein', 'Seafood', 'seafood', 'Fish or seafood dish', 'blue'),
    ('cuisine', 'Chinese', 'chinese', 'Chinese or Chinese-inspired dish', 'red'),
    ('cuisine', 'Italian', 'italian', 'Italian or Italian-inspired dish', 'green'),
    ('cuisine', 'Mexican', 'mexican', 'Mexican or Mexican-inspired dish', 'lime'),
    ('cuisine', 'Japanese', 'japanese', 'Japanese or Japanese-inspired dish', 'violet'),
    ('cuisine', 'Korean', 'korean', 'Korean or Korean-inspired dish', 'fuchsia'),
    ('prep', 'Quick Prep', 'quick-prep', 'Fast to make or assemble', 'slate'),
    ('prep', 'Comfort Food', 'comfort-food', 'Warm, familiar, filling dish', 'yellow'),
    ('prep', 'Spicy', 'spicy', 'Noticeably spicy', 'red')
)
INSERT INTO menu_tags (group_id, name, slug, description, color)
SELECT menu_tag_groups.id, default_tags.name, default_tags.slug, default_tags.description, default_tags.color
FROM default_tags
JOIN menu_tag_groups ON menu_tag_groups.slug = default_tags.group_slug
ON CONFLICT (slug) DO NOTHING;

-- Link ratings and requests to catalog records while keeping text columns.
ALTER TABLE menu_ratings
  ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL;

ALTER TABLE food_requests
  ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_ratings_menu_item_id ON menu_ratings(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_food_requests_menu_item_id ON food_requests(menu_item_id);

-- Seed catalog from historical menu JSON, ratings, requests, and old alias merges.
WITH raw_items AS (
  SELECT btrim(menu_item) AS name, meal_type AS meal_type, NULL::DATE AS served_at
  FROM menu_ratings
  WHERE btrim(menu_item) <> ''

  UNION ALL

  SELECT btrim(food_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
  FROM food_requests
  WHERE btrim(food_name) <> ''

  UNION ALL

  SELECT btrim(source_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
  FROM menu_item_merges
  WHERE btrim(source_name) <> ''

  UNION ALL

  SELECT btrim(canonical_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
  FROM menu_item_merges
  WHERE btrim(canonical_name) <> ''

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
  WHERE length(name) > 1
    AND lower(name) NOT IN ('prep', 'prepped')
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
);

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

CREATE OR REPLACE FUNCTION refresh_menu_item_rating_stats(target_menu_item_id UUID)
RETURNS VOID AS $$
BEGIN
  IF target_menu_item_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE menu_items
  SET
    total_ratings = stats.total_ratings,
    average_rating = stats.average_rating
  FROM (
    SELECT
      count(*)::INTEGER AS total_ratings,
      round(avg(rating)::NUMERIC, 1) AS average_rating
    FROM menu_ratings
    WHERE menu_item_id = target_menu_item_id
  ) AS stats
  WHERE menu_items.id = target_menu_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_menu_item_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM refresh_menu_item_rating_stats(NEW.menu_item_id);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_menu_item_rating_stats(OLD.menu_item_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_menu_item_rating_stats ON menu_ratings;
CREATE TRIGGER sync_menu_item_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON menu_ratings
  FOR EACH ROW
  EXECUTE FUNCTION sync_menu_item_rating_stats();

-- Catalog-level merge history replaces text-only merge review.
CREATE TABLE IF NOT EXISTS menu_item_merge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  target_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  merge_note TEXT,
  affected_rating_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  affected_request_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  merged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_by UUID REFERENCES users(id) ON DELETE SET NULL,
  undone_at TIMESTAMPTZ,
  undo_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (source_item_id <> target_item_id)
);

CREATE TRIGGER update_menu_item_merge_events_updated_at
  BEFORE UPDATE ON menu_item_merge_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_menu_item_merge_events_source ON menu_item_merge_events(source_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_merge_events_target ON menu_item_merge_events(target_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_merge_events_merged_at ON menu_item_merge_events(merged_at DESC);

ALTER TABLE menu_item_merge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view menu item merge events" ON menu_item_merge_events;
CREATE POLICY "Everyone can view menu item merge events"
  ON menu_item_merge_events FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and chefs can manage menu item merge events" ON menu_item_merge_events;
CREATE POLICY "Admins and chefs can manage menu item merge events"
  ON menu_item_merge_events FOR ALL
  USING (is_admin_or_chef())
  WITH CHECK (is_admin_or_chef());

CREATE OR REPLACE FUNCTION merge_menu_catalog_items(
  source_item_id UUID,
  target_item_id UUID,
  merge_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  source_item menu_items%ROWTYPE;
  target_item menu_items%ROWTYPE;
  rating_ids UUID[] := '{}'::UUID[];
  request_ids UUID[] := '{}'::UUID[];
  event_id UUID;
BEGIN
  IF NOT is_admin_or_chef() THEN
    RAISE EXCEPTION 'Only admins and chefs can merge menu items';
  END IF;

  IF source_item_id = target_item_id THEN
    RAISE EXCEPTION 'Choose two different menu items';
  END IF;

  SELECT * INTO source_item FROM menu_items WHERE id = source_item_id;
  SELECT * INTO target_item FROM menu_items WHERE id = target_item_id;

  IF source_item.id IS NULL OR target_item.id IS NULL THEN
    RAISE EXCEPTION 'Menu item not found';
  END IF;

  SELECT coalesce(array_agg(id), '{}'::UUID[]) INTO rating_ids
  FROM menu_ratings
  WHERE menu_item_id = source_item.id
    OR (menu_item_id IS NULL AND normalize_menu_item_name(menu_item) = source_item.normalized_name);

  SELECT coalesce(array_agg(id), '{}'::UUID[]) INTO request_ids
  FROM food_requests
  WHERE menu_item_id = source_item.id
    OR (menu_item_id IS NULL AND normalize_menu_item_name(food_name) = source_item.normalized_name);

  UPDATE menu_ratings
  SET menu_item_id = target_item.id, menu_item = target_item.name
  WHERE id = ANY(rating_ids);

  UPDATE food_requests
  SET menu_item_id = target_item.id, food_name = target_item.name
  WHERE id = ANY(request_ids);

  UPDATE menu_items
  SET
    active = FALSE,
    merged_into_id = target_item.id,
    merged_at = NOW(),
    merged_by = auth.uid(),
    merge_note = merge_menu_catalog_items.merge_note
  WHERE id = source_item.id;

  INSERT INTO menu_item_merge_events (
    source_item_id,
    target_item_id,
    source_name,
    target_name,
    merge_note,
    affected_rating_ids,
    affected_request_ids,
    merged_by
  )
  VALUES (
    source_item.id,
    target_item.id,
    source_item.name,
    target_item.name,
    merge_menu_catalog_items.merge_note,
    rating_ids,
    request_ids,
    auth.uid()
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION unmerge_menu_catalog_items(
  merge_event_id UUID,
  undo_note TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  merge_event menu_item_merge_events%ROWTYPE;
BEGIN
  IF NOT is_admin_or_chef() THEN
    RAISE EXCEPTION 'Only admins and chefs can unmerge menu items';
  END IF;

  SELECT * INTO merge_event
  FROM menu_item_merge_events
  WHERE id = merge_event_id;

  IF merge_event.id IS NULL THEN
    RAISE EXCEPTION 'Merge event not found';
  END IF;

  IF merge_event.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'This merge has already been undone';
  END IF;

  UPDATE menu_ratings
  SET menu_item_id = merge_event.source_item_id, menu_item = merge_event.source_name
  WHERE id = ANY(merge_event.affected_rating_ids);

  UPDATE food_requests
  SET menu_item_id = merge_event.source_item_id, food_name = merge_event.source_name
  WHERE id = ANY(merge_event.affected_request_ids);

  UPDATE menu_items
  SET
    active = TRUE,
    merged_into_id = NULL,
    merged_at = NULL,
    merged_by = NULL,
    merge_note = NULL
  WHERE id = merge_event.source_item_id;

  UPDATE menu_item_merge_events
  SET
    undone_at = NOW(),
    undone_by = auth.uid(),
    undo_note = unmerge_menu_catalog_items.undo_note
  WHERE id = merge_event.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION merge_menu_catalog_items(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION unmerge_menu_catalog_items(UUID, TEXT) TO authenticated;
