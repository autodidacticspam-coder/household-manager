-- =====================================================
-- MENU TAG SHORT LABELS AND EXPANDED DEFAULTS
-- Adds a short display code to tags (GF, KF, HP...), a Custom group for
-- user-created tags, and new default dietary tags.
-- =====================================================

ALTER TABLE menu_tags ADD COLUMN IF NOT EXISTS label TEXT;

UPDATE menu_tags SET label = defaults.label
FROM (VALUES
  ('gluten-free', 'GF'),
  ('low-carb', 'LC'),
  ('vegetarian', 'VEG'),
  ('dairy-free', 'DF'),
  ('kid-friendly', 'KF'),
  ('family-favorite', 'FAV'),
  ('quick-prep', 'QP'),
  ('comfort-food', 'CF')
) AS defaults(slug, label)
WHERE menu_tags.slug = defaults.slug
  AND menu_tags.label IS NULL;

INSERT INTO menu_tag_groups (name, slug, description, sort_order)
VALUES ('Custom', 'custom', 'Tags created by the family', 60)
ON CONFLICT (slug) DO NOTHING;

WITH new_tags(group_slug, name, slug, label, description, color) AS (
  VALUES
    ('dietary', 'High Protein', 'high-protein', 'HP', 'Protein-forward dish', 'indigo'),
    ('dietary', 'Vegan', 'vegan', 'VG', 'No animal products', 'lime'),
    ('dietary', 'Nut Free', 'nut-free', 'NF', 'Made without nuts', 'stone')
)
INSERT INTO menu_tags (group_id, name, slug, label, description, color)
SELECT menu_tag_groups.id, new_tags.name, new_tags.slug, new_tags.label, new_tags.description, new_tags.color
FROM new_tags
JOIN menu_tag_groups ON menu_tag_groups.slug = new_tags.group_slug
ON CONFLICT (slug) DO NOTHING;
