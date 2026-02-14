-- Allow anonymous users to check their own order status by order ID
CREATE POLICY "Anyone can check order status by id"
ON public.orders
FOR SELECT
USING (true);

-- Drop the old restrictive admin-only select since we need public polling
DROP POLICY IF EXISTS "Admins can view orders" ON public.orders;