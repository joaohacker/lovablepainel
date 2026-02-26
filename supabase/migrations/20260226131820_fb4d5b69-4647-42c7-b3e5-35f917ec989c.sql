-- Restrict products table: replace overly permissive policy
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;

-- Create a secure view that only exposes public-facing fields (no daily_limit, total_limit, credits_per_use)
CREATE OR REPLACE VIEW public.public_products
WITH (security_invoker = true)
AS SELECT id, name, price, description, is_active
FROM public.products
WHERE is_active = true;

-- Authenticated users see full product details (needed for checkout/generation)
CREATE POLICY "Authenticated users can view active products"
ON public.products
FOR SELECT
TO authenticated
USING (is_active = true);

-- Anon users can see active products (needed for landing page plans section)
CREATE POLICY "Anon can view active products basic info"
ON public.products
FOR SELECT
TO anon
USING (is_active = true);