-- Only admins can update user_roles
CREATE POLICY "Only admins can update user_roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete user_roles
CREATE POLICY "Only admins can delete user_roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert user_roles
CREATE POLICY "Only admins can insert user_roles"
ON public.user_roles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));