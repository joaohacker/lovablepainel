
-- DROP the dangerous policy that leaks cross-user generation data
DROP POLICY IF EXISTS "Authenticated can view active generations" ON public.generations;
