-- Temporarily drop FK constraints that reference auth.users to allow data import
ALTER TABLE public.tokens DROP CONSTRAINT IF EXISTS tokens_created_by_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.token_accounts DROP CONSTRAINT IF EXISTS token_accounts_user_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
