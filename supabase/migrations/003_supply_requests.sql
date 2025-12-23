-- =====================================================
-- SUPPLY REQUESTS
-- =====================================================

CREATE TYPE supply_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE supply_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    product_url TEXT,
    status supply_request_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_supply_requests_user_id ON supply_requests(user_id);
CREATE INDEX idx_supply_requests_status ON supply_requests(status);
CREATE INDEX idx_supply_requests_created_at ON supply_requests(created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_supply_requests_updated_at
    BEFORE UPDATE ON supply_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE supply_requests ENABLE ROW LEVEL SECURITY;

-- Employees can view their own requests
CREATE POLICY "Users can view own supply requests"
    ON supply_requests FOR SELECT
    USING (auth.uid() = user_id);

-- Employees can create their own requests
CREATE POLICY "Users can create own supply requests"
    ON supply_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all supply requests"
    ON supply_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admins can update any request
CREATE POLICY "Admins can update supply requests"
    ON supply_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Employees can delete their own pending requests
CREATE POLICY "Users can delete own pending supply requests"
    ON supply_requests FOR DELETE
    USING (auth.uid() = user_id AND status = 'pending');
