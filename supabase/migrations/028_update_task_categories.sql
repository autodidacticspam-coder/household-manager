-- Add "Repairs" category
INSERT INTO task_categories (name, color, icon) VALUES
    ('Repairs', '#dc2626', 'wrench');

-- Move any tasks/templates from "Pet Care" to "Other" before deleting
UPDATE tasks
SET category_id = (SELECT id FROM task_categories WHERE name = 'Other')
WHERE category_id = (SELECT id FROM task_categories WHERE name = 'Pet Care');

UPDATE task_templates
SET category_id = (SELECT id FROM task_categories WHERE name = 'Other')
WHERE category_id = (SELECT id FROM task_categories WHERE name = 'Pet Care');

-- Delete "Pet Care" category
DELETE FROM task_categories WHERE name = 'Pet Care';

-- Move any tasks/templates from "Cooking" to "Other" before deleting
UPDATE tasks
SET category_id = (SELECT id FROM task_categories WHERE name = 'Other')
WHERE category_id = (SELECT id FROM task_categories WHERE name = 'Cooking');

UPDATE task_templates
SET category_id = (SELECT id FROM task_categories WHERE name = 'Other')
WHERE category_id = (SELECT id FROM task_categories WHERE name = 'Cooking');

-- Delete "Cooking" category
DELETE FROM task_categories WHERE name = 'Cooking';
