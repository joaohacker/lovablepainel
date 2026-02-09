
-- Fix token_usages: replace permissive public write policies with service_role-only
DROP POLICY IF EXISTS "Anyone can insert usage" ON public.token_usages;
DROP POLICY IF EXISTS "Anyone can update usage" ON public.token_usages;

CREATE POLICY "Service role can insert usage"
ON public.token_usages
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update usage"
ON public.token_usages
FOR UPDATE
TO service_role
USING (true);

-- Fix generations: replace permissive public write policies with service_role-only
DROP POLICY IF EXISTS "Anyone can insert generation" ON public.generations;
DROP POLICY IF EXISTS "Anyone can update generation" ON public.generations;

CREATE POLICY "Service role can insert generation"
ON public.generations
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update generation"
ON public.generations
FOR UPDATE
TO service_role
USING (true);
