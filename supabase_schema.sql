-- SQL for creating or updating the ai_settings table in Supabase

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS ai_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, name)
);

-- Ensure all columns exist (in case the table was created with an older schema)
DO $$ 
BEGIN 
    -- Add user_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='user_id') THEN
        ALTER TABLE ai_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- Add name if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='name') THEN
        ALTER TABLE ai_settings ADD COLUMN name TEXT NOT NULL DEFAULT 'Default';
    END IF;

    -- Add provider_url if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='provider_url') THEN
        ALTER TABLE ai_settings ADD COLUMN provider_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1';
    END IF;

    -- Add model if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='model') THEN
        ALTER TABLE ai_settings ADD COLUMN model TEXT NOT NULL DEFAULT 'gpt-4o';
    END IF;

    -- Add api_key if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='api_key') THEN
        ALTER TABLE ai_settings ADD COLUMN api_key TEXT NOT NULL DEFAULT '';
    END IF;

    -- Add is_active if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='is_active') THEN
        ALTER TABLE ai_settings ADD COLUMN is_active BOOLEAN DEFAULT false;
    END IF;

    -- Add created_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='created_at') THEN
        ALTER TABLE ai_settings ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='updated_at') THEN
        ALTER TABLE ai_settings ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- Ensure UNIQUE constraint exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='ai_settings' AND constraint_name='ai_settings_user_id_name_key') THEN
        ALTER TABLE ai_settings ADD CONSTRAINT ai_settings_user_id_name_key UNIQUE (user_id, name);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

-- Create policies (using DO block to avoid error if policy already exists)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_settings' AND policyname = 'Users can manage their own settings') THEN
        CREATE POLICY "Users can manage their own settings"
        ON ai_settings FOR ALL
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ai_settings_updated_at ON ai_settings;
CREATE TRIGGER update_ai_settings_updated_at
    BEFORE UPDATE ON ai_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create user_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reminder_minutes INTEGER DEFAULT 15,
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id)
);

-- Ensure timezone column exists in user_settings
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='timezone') THEN
        ALTER TABLE user_settings ADD COLUMN timezone TEXT DEFAULT 'UTC';
    END IF;
END $$;

-- Enable RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for user_settings
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can manage their own user settings') THEN
        CREATE POLICY "Users can manage their own user settings"
        ON user_settings FOR ALL
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- Trigger for user_settings updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
