-- =====================================================
-- TASK TRANSLATIONS
-- Add translation columns for task titles and descriptions
-- =====================================================

-- Add translation columns to tasks table
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS title_es TEXT,
ADD COLUMN IF NOT EXISTS title_zh TEXT,
ADD COLUMN IF NOT EXISTS description_es TEXT,
ADD COLUMN IF NOT EXISTS description_zh TEXT,
ADD COLUMN IF NOT EXISTS source_locale TEXT DEFAULT 'en';

-- The original title and description columns remain as the English version
-- title = English title (or source language)
-- title_es = Spanish translation
-- title_zh = Chinese translation
-- description = English description (or source language)
-- description_es = Spanish translation
-- description_zh = Chinese translation
-- source_locale = the original language the task was created in

COMMENT ON COLUMN tasks.title_es IS 'Spanish translation of task title';
COMMENT ON COLUMN tasks.title_zh IS 'Chinese translation of task title';
COMMENT ON COLUMN tasks.description_es IS 'Spanish translation of task description';
COMMENT ON COLUMN tasks.description_zh IS 'Chinese translation of task description';
COMMENT ON COLUMN tasks.source_locale IS 'Original locale the task was created in (en, es, zh)';
