
-- Fix: banned_users needs explicit block for authenticated non-admin reads
-- Currently only has "Block anon access" and "Admins can manage" but no explicit block for authenticated non-admins
CREATE POLICY "Block authenticated non-admin reads on banned_users"
ON public.banned_users
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix: tokens table - add explicit block for authenticated non-admin reads  
-- Currently only has "Block public read access" (USING false) which blocks anon
-- but authenticated users could potentially read
CREATE POLICY "Block authenticated non-admin reads on tokens"
ON public.tokens
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix: Clean up potential duplicate/conflicting SELECT policies on tokens
-- The existing "Block public read access to tokens" uses USING(false) which is RESTRICTIVE
-- We need to ensure our new policy works. Actually since all are RESTRICTIVE (Permissive: No),
-- they act as AND conditions. The existing "Block public read" with USING(false) already blocks everyone.
-- But the admin policy above allows admins through. This is correct since RESTRICTIVE policies
-- require ALL to pass - but wait, that means the false policy blocks admins too.
-- We need to DROP the overly broad block and replace with targeted ones.

DROP POLICY IF EXISTS "Block public read access to tokens" ON public.tokens;
DROP POLICY IF EXISTS "Block authenticated non-admin reads on tokens" ON public.tokens;

-- Anon: block all
CREATE POLICY "Block anon access tokens"
ON public.tokens
FOR SELECT
TO anon
USING (false);

-- Authenticated non-admin: block
CREATE POLICY "Authenticated can read tokens if admin"
ON public.tokens
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
