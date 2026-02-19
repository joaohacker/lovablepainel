
-- Table for user-generated shareable credit links
CREATE TABLE public.client_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  owner_id uuid NOT NULL,
  total_credits integer NOT NULL,
  credits_used integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.client_tokens ENABLE ROW LEVEL SECURITY;

-- Owners can view their own client tokens
CREATE POLICY "Owners can view own client_tokens"
ON public.client_tokens FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Admins can manage all client tokens
CREATE POLICY "Admins can manage client_tokens"
ON public.client_tokens FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Block all public/anon access
CREATE POLICY "Block anon access to client_tokens"
ON public.client_tokens FOR SELECT
TO anon
USING (false);

-- Atomic function to use credits from a client token (prevents race conditions)
CREATE OR REPLACE FUNCTION public.use_client_token_credits(p_token_id uuid, p_credits integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_remaining integer;
BEGIN
  SELECT * INTO v_token FROM public.client_tokens WHERE id = p_token_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token não encontrado');
  END IF;
  
  IF NOT v_token.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link desativado');
  END IF;
  
  IF v_token.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link expirado');
  END IF;
  
  v_remaining := v_token.total_credits - v_token.credits_used;
  
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Créditos esgotados');
  END IF;
  
  IF p_credits > v_remaining THEN
    p_credits := v_remaining;
  END IF;
  
  UPDATE public.client_tokens SET credits_used = credits_used + p_credits WHERE id = p_token_id;
  
  RETURN jsonb_build_object('success', true, 'credits', p_credits, 'remaining', v_remaining - p_credits);
END;
$$;

-- Revoke direct execute from public/anon/authenticated (only edge functions via service role)
REVOKE EXECUTE ON FUNCTION public.use_client_token_credits(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_client_token_credits(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.use_client_token_credits(uuid, integer) FROM authenticated;
