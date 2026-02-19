
-- Remove the public SELECT policy - coupons should NOT be readable by anyone except admins
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;

-- Only admins can do anything with coupons
-- The "Admins can manage coupons" ALL policy already exists, that's sufficient
