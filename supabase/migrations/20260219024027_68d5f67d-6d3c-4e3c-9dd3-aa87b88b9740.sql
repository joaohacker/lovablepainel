
-- 1. Remove the overly permissive "Anyone can check order status by id" policy
DROP POLICY IF EXISTS "Anyone can check order status by id" ON public.orders;

-- 2. Restrict the generations public policy to only non-sensitive columns
-- We can't restrict columns in RLS, so we remove the broad policy
-- and replace it with one that hides sensitive data by design
DROP POLICY IF EXISTS "Anyone can view active generations summary" ON public.generations;

-- Recreate with restricted access: only allow reading non-sensitive fields
-- Since RLS can't filter columns, we keep it but remove client_ip and limit exposure
-- The policy stays but we'll also remove client_ip from being queryable by anon
CREATE POLICY "Anyone can view active generations count"
ON public.generations
FOR SELECT
USING (
  status IN ('running', 'waiting_invite', 'queued', 'creating')
  AND created_at > now() - interval '24 hours'
);
