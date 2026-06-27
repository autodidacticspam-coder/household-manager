-- =====================================================
-- ADMIN-ONLY CATALOG MANAGEMENT AND GROUP MERGES
-- Chefs keep read/search access, while catalog edits, tags, and merges move
-- back to admin-only control.
-- =====================================================

-- Keep the shared catalog item filter in sync with the app parser.
CREATE OR REPLACE FUNCTION has_removed_menu_catalog_term(input TEXT)
RETURNS BOOLEAN AS $$
  WITH normalized AS (
    SELECT btrim(regexp_replace(normalize_menu_item_name(input), '[^a-z0-9]+', ' ', 'g')) AS value
  )
  SELECT value ~ '(^| )(adult|adults|kid|kids)( |$)'
  FROM normalized;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION is_likely_menu_catalog_item(input TEXT)
RETURNS BOOLEAN AS $$
  WITH normalized AS (
    SELECT btrim(regexp_replace(normalize_menu_item_name(input), '[^a-z0-9]+', ' ', 'g')) AS value
  )
  SELECT
    length(value) > 1
    AND value NOT IN (
      'adult',
      'adults',
      'child',
      'children',
      'kid',
      'kids',
      'menu notes',
      'note',
      'notes',
      'people',
      'prep',
      'prepped',
      'serves',
      'serving',
      'serving size',
      'servings',
      'tbd'
    )
    AND NOT has_removed_menu_catalog_term(value)
    AND value !~ '^[0-9]+[[:space:]]*(adults?|kids?|children|toddlers?|people|persons|guests?|servings?)([[:space:]]+(and[[:space:]]+)?[0-9]+[[:space:]]*(adults?|kids?|children|toddlers?|people|persons|guests?|servings?))*$'
    AND value !~ '^(serves|serving|servings|serving size|for)[[:space:]]+[0-9]+([[:space:]]+[0-9]+)?([[:space:]]+(adults?|kids?|children|toddlers?|people|persons|guests?|servings?))?$'
  FROM normalized;
$$ LANGUAGE SQL IMMUTABLE;

-- Menu item catalog writes are admin-only. The existing select policy remains
-- open so chefs can search the dish database and filter by tags.
DROP POLICY IF EXISTS "Admins and chefs can manage menu items" ON menu_items;
DROP POLICY IF EXISTS "Admins can manage menu items" ON menu_items;
CREATE POLICY "Admins can manage menu items"
  ON menu_items FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins and chefs can manage menu tag groups" ON menu_tag_groups;
DROP POLICY IF EXISTS "Admins can manage menu tag groups" ON menu_tag_groups;
CREATE POLICY "Admins can manage menu tag groups"
  ON menu_tag_groups FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins and chefs can manage menu tags" ON menu_tags;
DROP POLICY IF EXISTS "Admins can manage menu tags" ON menu_tags;
CREATE POLICY "Admins can manage menu tags"
  ON menu_tags FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins and chefs can manage menu item tags" ON menu_item_tags;
DROP POLICY IF EXISTS "Admins can manage menu item tags" ON menu_item_tags;
CREATE POLICY "Admins can manage menu item tags"
  ON menu_item_tags FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins and chefs can manage menu item merge events" ON menu_item_merge_events;
DROP POLICY IF EXISTS "Admins can manage menu item merge events" ON menu_item_merge_events;
CREATE POLICY "Admins can manage menu item merge events"
  ON menu_item_merge_events FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Replace the original two-item merge with an admin-only version.
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
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge menu items';
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

CREATE OR REPLACE FUNCTION merge_menu_catalog_item_group(
  source_item_ids UUID[],
  target_item_id UUID,
  canonical_name TEXT DEFAULT NULL,
  merge_note TEXT DEFAULT NULL
)
RETURNS UUID[] AS $$
DECLARE
  source_ids UUID[] := '{}'::UUID[];
  current_source_id UUID;
  event_ids UUID[] := '{}'::UUID[];
  event_id UUID;
  target_item menu_items%ROWTYPE;
  clean_canonical_name TEXT;
  conflicting_item menu_items%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge menu items';
  END IF;

  SELECT * INTO target_item
  FROM menu_items
  WHERE id = target_item_id
  FOR UPDATE;

  IF target_item.id IS NULL THEN
    RAISE EXCEPTION 'Canonical menu item not found';
  END IF;

  SELECT coalesce(array_agg(DISTINCT source_id), '{}'::UUID[]) INTO source_ids
  FROM unnest(source_item_ids) AS source_values(source_id)
  WHERE source_id IS NOT NULL
    AND source_id <> target_item.id;

  IF coalesce(array_length(source_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one duplicate item to merge';
  END IF;

  clean_canonical_name := nullif(btrim(canonical_name), '');

  IF clean_canonical_name IS NOT NULL
    AND normalize_menu_item_name(clean_canonical_name) <> target_item.normalized_name THEN
    SELECT * INTO conflicting_item
    FROM menu_items
    WHERE id <> target_item.id
      AND normalize_menu_item_name(name) = normalize_menu_item_name(clean_canonical_name)
    LIMIT 1;

    IF conflicting_item.id IS NOT NULL THEN
      RAISE EXCEPTION 'Canonical name already exists. Select that item as canonical or choose another name.';
    END IF;

    UPDATE menu_items
    SET
      name = clean_canonical_name,
      updated_by = auth.uid(),
      updated_at = NOW()
    WHERE id = target_item.id
    RETURNING * INTO target_item;
  END IF;

  FOREACH current_source_id IN ARRAY source_ids LOOP
    event_id := merge_menu_catalog_items(
      current_source_id,
      target_item.id,
      merge_menu_catalog_item_group.merge_note
    );
    event_ids := array_append(event_ids, event_id);
  END LOOP;

  RETURN event_ids;
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
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can unmerge menu items';
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
GRANT EXECUTE ON FUNCTION merge_menu_catalog_item_group(UUID[], UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION unmerge_menu_catalog_items(UUID, TEXT) TO authenticated;

-- Remove kid/adult catalog rows from active search. Preserve merge history rows
-- where foreign keys require it.
UPDATE menu_items
SET
  active = FALSE,
  updated_at = NOW(),
  merge_note = concat_ws(
    E'\n',
    NULLIF(merge_note, ''),
    'Automatically hidden because this catalog item contains kid/adult wording.'
  )
WHERE has_removed_menu_catalog_term(name)
  AND active = TRUE;

DELETE FROM menu_items
WHERE has_removed_menu_catalog_term(name)
  AND NOT EXISTS (
    SELECT 1
    FROM menu_item_merge_events
    WHERE menu_item_merge_events.source_item_id = menu_items.id
      OR menu_item_merge_events.target_item_id = menu_items.id
  );
