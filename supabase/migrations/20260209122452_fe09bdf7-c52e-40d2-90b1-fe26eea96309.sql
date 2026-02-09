
-- Drop the circular policy
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Allow users to read their own role (fixes circular dependency)
CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);
