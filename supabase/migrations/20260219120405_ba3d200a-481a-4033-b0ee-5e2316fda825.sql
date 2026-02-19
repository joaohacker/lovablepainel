
-- Fix 1: generations - drop the public policy that exposes sensitive data to anon
DROP POLICY IF EXISTS "Anyone can view active generations count" ON public.generations;
DROP POLICY IF EXISTS "Block public read access to generations" ON public.generations;

-- Recreate: only authenticated users can see active generations (not anon)
CREATE POLICY "Authenticated can view active generations"
ON public.generations FOR SELECT TO authenticated
USING (
  status IN ('running', 'waiting_invite', 'queued', 'creating')
  AND created_at > (now() - interval '24 hours')
);

-- Explicit anon block
CREATE POLICY "Block anon read generations"
ON public.generations FOR SELECT TO anon
USING (false);

-- Fix 2: orders - block anon access explicitly
CREATE POLICY "Block anon read orders"
ON public.orders FOR SELECT TO anon
USING (false);
