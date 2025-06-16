-- SmartFind Database Schema for Supabase
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash VARCHAR(255), -- For email auth
    google_id VARCHAR(255), -- For Google OAuth
    profile_picture VARCHAR(500),
    auth_type VARCHAR(20) DEFAULT 'email', -- 'email' or 'google'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User tokens and usage table
CREATE TABLE IF NOT EXISTS user_data (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    paid_tokens INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    legacy_user_id VARCHAR(255), -- For migrating anonymous users
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Purchase history table
CREATE TABLE IF NOT EXISTS purchases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    amount_cents INTEGER NOT NULL,
    tokens_purchased INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_legacy_user_id ON user_data(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_session_id ON purchases(stripe_session_id);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- User data policies
CREATE POLICY "Users can view own data" ON user_data
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own data" ON user_data
    FOR UPDATE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own data" ON user_data
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Purchase policies
CREATE POLICY "Users can view own purchases" ON purchases
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Service role can manage purchases" ON purchases
    FOR ALL USING (current_setting('role') = 'service_role');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_data_updated_at BEFORE UPDATE ON user_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get user total tokens (from purchases + 50 free credits)
CREATE OR REPLACE FUNCTION get_user_total_purchased_tokens(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    -- SIMPLIFIED SYSTEM: Everyone gets 50 free credits + actual purchases
    -- This eliminates the need to track free vs paid separately
    RETURN 50 + COALESCE(
        (SELECT SUM(tokens_purchased) 
         FROM purchases 
         WHERE user_id = user_uuid AND status = 'completed'),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync user data
CREATE OR REPLACE FUNCTION sync_user_data(
    user_uuid UUID,
    local_tokens INTEGER DEFAULT 0,
    local_usage INTEGER DEFAULT 0,
    legacy_id VARCHAR DEFAULT NULL
)
RETURNS TABLE(
    cloud_tokens INTEGER,
    cloud_usage INTEGER,
    total_purchased INTEGER
) AS $$
DECLARE
    current_data user_data%ROWTYPE;
    purchased_tokens INTEGER;
    final_tokens INTEGER;
    final_usage INTEGER;
BEGIN
    -- Get current user data
    SELECT * INTO current_data 
    FROM user_data 
    WHERE user_id = user_uuid;
    
    -- Get total purchased tokens
    purchased_tokens := get_user_total_purchased_tokens(user_uuid);
    
    -- Calculate final usage (always use the maximum to prevent losing consumption data)
    IF current_data.id IS NULL THEN
        final_usage := local_usage;
    ELSE
        final_usage := GREATEST(current_data.usage_count, local_usage);
    END IF;
    
    -- Calculate remaining tokens based on purchases minus total usage
    final_tokens := GREATEST(0, purchased_tokens - final_usage);
    
    -- If no user data exists, create it
    IF current_data.id IS NULL THEN
        INSERT INTO user_data (user_id, paid_tokens, usage_count, legacy_user_id)
        VALUES (user_uuid, final_tokens, final_usage, legacy_id)
        RETURNING * INTO current_data;
    ELSE
        -- Update with proper consumption tracking
        -- Always preserve the maximum usage count and calculate tokens accordingly
        UPDATE user_data 
        SET 
            paid_tokens = final_tokens,
            usage_count = final_usage,
            last_sync_at = NOW(),
            legacy_user_id = COALESCE(current_data.legacy_user_id, legacy_id)
        WHERE user_id = user_uuid
        RETURNING * INTO current_data;
    END IF;
    
    -- Return synced data
    RETURN QUERY SELECT 
        current_data.paid_tokens,
        current_data.usage_count,
        purchased_tokens;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default admin user (optional, for testing)
-- INSERT INTO users (email, name, auth_type) 
-- VALUES ('admin@smartfind.com', 'SmartFind Admin', 'email')
-- ON CONFLICT (email) DO NOTHING; 