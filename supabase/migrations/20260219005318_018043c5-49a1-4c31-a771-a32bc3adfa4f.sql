
-- 1) Add client_token_id to generations to link client link generations
ALTER TABLE public.generations ADD COLUMN client_token_id uuid REFERENCES public.client_tokens(id);

-- 2) Remove expires_at default from client_tokens (no more expiration)
ALTER TABLE public.client_tokens ALTER COLUMN expires_at DROP DEFAULT;

-- 3) Clear existing expiration dates
UPDATE public.client_tokens SET expires_at = NULL;

-- 4) Create function to refund credits back to client_token
CREATE OR REPLACE FUNCTION public.refund_client_token_credits(p_token_id uuid, p_credits integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token RECORD;
BEGIN
  SELECT * INTO v_token FROM public.client_tokens WHERE id = p_token_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token não encontrado');
  END IF;
  
  -- Decrement credits_used (floor at 0)
  UPDATE public.client_tokens 
  SET credits_used = GREATEST(credits_used - p_credits, 0) 
  WHERE id = p_token_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'refunded', p_credits, 
    'new_credits_used', GREATEST(v_token.credits_used - p_credits, 0),
    'remaining', v_token.total_credits - GREATEST(v_token.credits_used - p_credits, 0)
  );
END;
$function$;

-- 5) Update use_client_token_credits to remove expiration check
CREATE OR REPLACE FUNCTION public.use_client_token_credits(p_token_id uuid, p_credits integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
