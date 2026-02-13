
CREATE OR REPLACE FUNCTION public.reserve_credits(p_token_id uuid, p_farm_id text, p_client_name text, p_credits_requested integer, p_status text DEFAULT 'waiting_invite'::text, p_master_email text DEFAULT NULL::text, p_client_ip text DEFAULT NULL::text, p_queued boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token RECORD;
  v_used_total BIGINT;
  v_reserved_total BIGINT;
  v_remaining_total INTEGER;
  v_used_daily BIGINT;
  v_reserved_daily BIGINT;
  v_remaining_daily INTEGER;
  v_today_start TIMESTAMPTZ;
BEGIN
  -- Lock the token row to prevent concurrent reservations
  SELECT * INTO v_token FROM public.tokens WHERE id = p_token_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token não encontrado');
  END IF;

  IF NOT v_token.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token desativado');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token expirou');
  END IF;

  -- Check total limit
  IF v_token.total_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(credits_earned), 0) INTO v_used_total
    FROM public.generations
    WHERE token_id = p_token_id AND status IN ('completed', 'running');

    SELECT COALESCE(SUM(credits_requested), 0) INTO v_reserved_total
    FROM public.generations
    WHERE token_id = p_token_id AND status IN ('active', 'waiting_invite', 'queued', 'pending');

    v_remaining_total := v_token.total_limit - v_used_total - v_reserved_total;
    IF v_remaining_total <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Limite total de créditos atingido');
    END IF;
  END IF;

  -- Daily limit: day resets at 12:00 BRT (15:00 UTC)
  v_today_start := date_trunc('day', NOW()) + interval '15 hours';
  IF NOW() < v_today_start THEN
    v_today_start := v_today_start - interval '1 day';
  END IF;

  IF v_token.daily_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(credits_earned), 0) INTO v_used_daily
    FROM public.generations
    WHERE token_id = p_token_id AND status IN ('completed', 'running')
      AND created_at >= v_today_start;

    SELECT COALESCE(SUM(credits_requested), 0) INTO v_reserved_daily
    FROM public.generations
    WHERE token_id = p_token_id AND status IN ('active', 'waiting_invite', 'queued', 'pending')
      AND created_at >= v_today_start;

    v_remaining_daily := v_token.daily_limit - v_used_daily - v_reserved_daily;
    IF v_remaining_daily <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Limite diário de créditos atingido');
    END IF;
  END IF;

  -- All checks passed — insert atomically
  INSERT INTO public.generations (token_id, farm_id, client_name, credits_requested, status, master_email, client_ip)
  VALUES (p_token_id, p_farm_id, p_client_name, p_credits_requested,
    CASE WHEN p_queued THEN 'queued' ELSE p_status END,
    p_master_email, p_client_ip);

  INSERT INTO public.token_usages (token_id, farm_id, credits_requested, status, client_ip)
  VALUES (p_token_id, p_farm_id, p_credits_requested, 'active', p_client_ip);

  RETURN jsonb_build_object(
    'success', true,
    'remaining_total', CASE WHEN v_token.total_limit IS NOT NULL THEN v_remaining_total - p_credits_requested ELSE NULL END,
    'remaining_daily', CASE WHEN v_token.daily_limit IS NOT NULL THEN v_remaining_daily - p_credits_requested ELSE NULL END
  );
END;
$function$;
