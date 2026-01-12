-- Create recipes table
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    title_es TEXT,
    title_zh TEXT,
    description TEXT,
    description_es TEXT,
    description_zh TEXT,
    ingredients JSONB DEFAULT '[]'::jsonb,
    instructions JSONB DEFAULT '[]'::jsonb,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER,
    source_url TEXT,
    source_name TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create recipe_media table
CREATE TABLE recipe_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    storage_type TEXT NOT NULL CHECK (storage_type IN ('upload', 'link')),
    url TEXT NOT NULL,
    title TEXT,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    is_hero BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Add recipe_id to food_requests for linking
ALTER TABLE food_requests ADD COLUMN recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX idx_recipes_title ON recipes(title);
CREATE INDEX idx_recipes_created_by ON recipes(created_by);
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipe_media_recipe_id ON recipe_media(recipe_id);
CREATE INDEX idx_recipe_media_is_hero ON recipe_media(recipe_id, is_hero) WHERE is_hero = TRUE;
CREATE INDEX idx_food_requests_recipe_id ON food_requests(recipe_id);

-- Enable RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recipes
-- Everyone can view recipes
CREATE POLICY "Everyone can view recipes"
    ON recipes FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can insert recipes
CREATE POLICY "Admins can insert recipes"
    ON recipes FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Only admins can update recipes
CREATE POLICY "Admins can update recipes"
    ON recipes FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Only admins can delete recipes
CREATE POLICY "Admins can delete recipes"
    ON recipes FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- RLS Policies for recipe_media
-- Everyone can view recipe media
CREATE POLICY "Everyone can view recipe media"
    ON recipe_media FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can insert recipe media
CREATE POLICY "Admins can insert recipe media"
    ON recipe_media FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Only admins can update recipe media
CREATE POLICY "Admins can update recipe media"
    ON recipe_media FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Only admins can delete recipe media
CREATE POLICY "Admins can delete recipe media"
    ON recipe_media FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
