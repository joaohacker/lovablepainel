
-- Add branding columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS brand_name text,
ADD COLUMN IF NOT EXISTS brand_logo_url text;

-- Create storage bucket for brand logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-logos', 'brand-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own brand logo
CREATE POLICY "Users can upload own brand logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brand-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to update their own brand logo
CREATE POLICY "Users can update own brand logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brand-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own brand logo
CREATE POLICY "Users can delete own brand logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brand-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Anyone can view brand logos (public bucket)
CREATE POLICY "Brand logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-logos');
