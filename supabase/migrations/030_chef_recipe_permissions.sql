-- Update RLS policies to allow chefs same permissions as admins for recipes

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can insert recipes" ON recipes;
DROP POLICY IF EXISTS "Admins can update recipes" ON recipes;
DROP POLICY IF EXISTS "Admins can delete recipes" ON recipes;
DROP POLICY IF EXISTS "Admins can insert recipe media" ON recipe_media;
DROP POLICY IF EXISTS "Admins can update recipe media" ON recipe_media;
DROP POLICY IF EXISTS "Admins can delete recipe media" ON recipe_media;

-- Recreate policies to include chefs

-- Recipes INSERT
CREATE POLICY "Admins and chefs can insert recipes"
    ON recipes FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'admin' OR users.position = 'chef')
        )
    );

-- Recipes UPDATE
CREATE POLICY "Admins and chefs can update recipes"
    ON recipes FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'admin' OR users.position = 'chef')
        )
    );

-- Recipes DELETE
CREATE POLICY "Admins and chefs can delete recipes"
    ON recipes FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'admin' OR users.position = 'chef')
        )
    );

-- Recipe Media INSERT
CREATE POLICY "Admins and chefs can insert recipe media"
    ON recipe_media FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'admin' OR users.position = 'chef')
        )
    );

-- Recipe Media UPDATE
CREATE POLICY "Admins and chefs can update recipe media"
    ON recipe_media FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'admin' OR users.position = 'chef')
        )
    );

-- Recipe Media DELETE
CREATE POLICY "Admins and chefs can delete recipe media"
    ON recipe_media FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'admin' OR users.position = 'chef')
        )
    );
