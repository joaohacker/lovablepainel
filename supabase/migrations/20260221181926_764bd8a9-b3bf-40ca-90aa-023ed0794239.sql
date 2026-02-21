
-- Tabela de IPs banidos
CREATE TABLE public.banned_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text DEFAULT '',
  banned_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage banned_ips"
  ON public.banned_ips FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block anon access banned_ips"
  ON public.banned_ips FOR SELECT
  USING (false);

-- Tabela de usuários banidos
CREATE TABLE public.banned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  reason text DEFAULT '',
  banned_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage banned_users"
  ON public.banned_users FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block anon access banned_users"
  ON public.banned_users FOR SELECT
  USING (false);

-- Função helper para checar ban (usada nas edge functions)
CREATE OR REPLACE FUNCTION public.is_user_banned(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_users WHERE user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ip_banned(p_ip text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_ips WHERE ip_address = p_ip
  )
$$;
