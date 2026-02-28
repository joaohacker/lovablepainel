
-- Fix: allow admins to update generations
-- The current "Block user update" policy blocks ALL users including admins
DROP POLICY IF EXISTS "Block user update on generations" ON public.generations;

CREATE POLICY "Block user update on generations"
ON public.generations
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));
