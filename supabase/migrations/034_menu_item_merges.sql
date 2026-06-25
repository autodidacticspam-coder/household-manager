-- =====================================================
-- MENU ITEM MERGES
-- Canonical aliases for grouping similar rated/requested foods.
-- Rows are never deleted; unmerge marks the row inactive.
-- =====================================================

CREATE TABLE menu_item_merges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL CHECK (length(btrim(source_name)) > 0),
    canonical_name TEXT NOT NULL CHECK (length(btrim(canonical_name)) > 0),
    merge_note TEXT,
    merged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    merged_at TIMESTAMPTZ DEFAULT NOW(),
    unmerged_at TIMESTAMPTZ,
    unmerged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    unmerge_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (lower(btrim(source_name)) <> lower(btrim(canonical_name)))
);

CREATE TRIGGER update_menu_item_merges_updated_at
    BEFORE UPDATE ON menu_item_merges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX idx_menu_item_merges_active_source
    ON menu_item_merges (lower(btrim(source_name)))
    WHERE unmerged_at IS NULL;

CREATE INDEX idx_menu_item_merges_active_canonical
    ON menu_item_merges (lower(btrim(canonical_name)))
    WHERE unmerged_at IS NULL;

CREATE INDEX idx_menu_item_merges_merged_at
    ON menu_item_merges(merged_at DESC);

ALTER TABLE menu_item_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view menu item merges"
    ON menu_item_merges FOR SELECT
    USING (true);

CREATE POLICY "Admins can create menu item merges"
    ON menu_item_merges FOR INSERT
    WITH CHECK (is_admin() AND merged_by = auth.uid());

CREATE POLICY "Admins can unmerge menu items"
    ON menu_item_merges FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());
