-- Generic application defaults only. No household accounts or activity records.
SET search_path=public,extensions;
INSERT INTO public.task_categories(name,color,icon)
SELECT name,color,icon FROM (VALUES
('Childcare','#ec4899','baby'),('Cleaning','#3b82f6','spray-can'),('Laundry','#8b5cf6','shirt'),
('Organizing','#10b981','folder'),('Errands','#eab308','car'),('Repairs','#dc2626','wrench'),('Other','#6b7280','ellipsis')
) AS defaults(name,color,icon) WHERE NOT EXISTS(SELECT 1 FROM public.task_categories c WHERE c.name=defaults.name);
INSERT INTO public.employee_groups(name,description)
SELECT name,description FROM (VALUES ('Nanny','Childcare'),('Teacher','Education'),('Chef','Meal planning and preparation'),('Babysitter','Availability and bookings'),('Housekeepers','Household maintenance'),('Drivers','Transportation'))
AS defaults(name,description) WHERE NOT EXISTS(SELECT 1 FROM public.employee_groups g WHERE g.name=defaults.name);
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

-- =====================================================
-- MENU TAG SHORT LABELS AND EXPANDED DEFAULTS
-- Adds a short display code to tags (GF, KF, HP...), a Custom group for
-- user-created tags, and new default dietary tags.
-- =====================================================



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
