-- =====================================================
-- AVATAR STORAGE BUCKET
-- Create storage bucket for user avatars
-- =====================================================

-- Note: Run these commands in Supabase SQL Editor or Dashboard
-- Storage buckets are managed through Supabase Storage API

-- Create the avatars bucket (run in Supabase Dashboard > Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- RLS Policies for avatars bucket
-- These need to be created in Supabase Dashboard > Storage > Policies

-- Policy: Allow authenticated users to upload their own avatar
-- CREATE POLICY "Users can upload own avatar"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   bucket_id = 'avatars' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Allow users to update their own avatar
-- CREATE POLICY "Users can update own avatar"
-- ON storage.objects FOR UPDATE
-- TO authenticated
-- USING (
--   bucket_id = 'avatars' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Allow users to delete their own avatar
-- CREATE POLICY "Users can delete own avatar"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (
--   bucket_id = 'avatars' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Allow public read access to avatars
-- CREATE POLICY "Public avatar access"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'avatars');

-- Instructions:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a new bucket called "avatars"
-- 3. Make it public (or configure policies as above)
-- 4. The app will store avatars at: avatars/{user_id}/{filename}
