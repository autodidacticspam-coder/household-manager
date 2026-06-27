-- =====================================================
-- CLEAN MENU CATALOG SEED DATA
-- Removes obvious serving-count/headcount notes that were imported from
-- historical menu text as if they were dishes.
-- =====================================================

CREATE OR REPLACE FUNCTION is_likely_menu_catalog_item(input TEXT)
RETURNS BOOLEAN AS $$
  WITH normalized AS (
    SELECT normalize_menu_item_name(input) AS value
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
    AND value !~ '^[0-9]+[[:space:]]*(adults?|kids?|children|toddlers?|people|persons|guests?|servings?)([[:space:]]+(and[[:space:]]+)?[0-9]+[[:space:]]*(adults?|kids?|children|toddlers?|people|persons|guests?|servings?))*$'
    AND value !~ '^(serves|serving|servings|serving size|for)[[:space:]]+[0-9]+([[:space:]]+[0-9]+)?([[:space:]]+(adults?|kids?|children|toddlers?|people|persons|guests?|servings?))?$'
  FROM normalized;
$$ LANGUAGE SQL IMMUTABLE;

UPDATE menu_items
SET
  active = FALSE,
  updated_at = NOW(),
  merge_note = concat_ws(
    E'\n',
    NULLIF(merge_note, ''),
    'Automatically hidden because this looks like a serving/headcount note, not a dish.'
  )
WHERE NOT is_likely_menu_catalog_item(name)
  AND active = TRUE
  AND (
    EXISTS (SELECT 1 FROM menu_ratings WHERE menu_ratings.menu_item_id = menu_items.id)
    OR EXISTS (SELECT 1 FROM food_requests WHERE food_requests.menu_item_id = menu_items.id)
    OR EXISTS (SELECT 1 FROM menu_item_tags WHERE menu_item_tags.menu_item_id = menu_items.id)
    OR EXISTS (
      SELECT 1
      FROM menu_item_merge_events
      WHERE menu_item_merge_events.source_item_id = menu_items.id
        OR menu_item_merge_events.target_item_id = menu_items.id
    )
    OR EXISTS (
      SELECT 1
      FROM menu_items AS merged_children
      WHERE merged_children.merged_into_id = menu_items.id
    )
  );

DELETE FROM menu_items
WHERE NOT is_likely_menu_catalog_item(name)
  AND NOT EXISTS (SELECT 1 FROM menu_ratings WHERE menu_ratings.menu_item_id = menu_items.id)
  AND NOT EXISTS (SELECT 1 FROM food_requests WHERE food_requests.menu_item_id = menu_items.id)
  AND NOT EXISTS (SELECT 1 FROM menu_item_tags WHERE menu_item_tags.menu_item_id = menu_items.id)
  AND NOT EXISTS (
    SELECT 1
    FROM menu_item_merge_events
    WHERE menu_item_merge_events.source_item_id = menu_items.id
      OR menu_item_merge_events.target_item_id = menu_items.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM menu_items AS merged_children
    WHERE merged_children.merged_into_id = menu_items.id
  );
