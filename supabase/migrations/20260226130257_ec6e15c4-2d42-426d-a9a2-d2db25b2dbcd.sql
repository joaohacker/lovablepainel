CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user_id uuid, p_ip text, p_endpoint text, p_max_requests integer DEFAULT 10, p_window_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_window_start timestamptz;
  v_fraud_count integer;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  DELETE FROM public.rate_limits
  WHERE created_at < now() - interval '10 minutes';

  SELECT count(*) INTO v_count
  FROM public.rate_limits
  WHERE (user_id = p_user_id OR ip_address = p_ip)
    AND endpoint = p_endpoint
    AND created_at >= v_window_start;

  IF v_count >= p_max_requests THEN
    INSERT INTO public.fraud_attempts (user_id, ip_address, action, details)
    VALUES (p_user_id, p_ip, 'rate_limit_exceeded',
      jsonb_build_object('endpoint', p_endpoint, 'count', v_count, 'limit', p_max_requests));

    -- AUTO-BAN: 10+ rate limit violations in last 10 minutes (was 3)
    SELECT count(*) INTO v_fraud_count
    FROM public.fraud_attempts
    WHERE user_id = p_user_id
      AND action = 'rate_limit_exceeded'
      AND created_at > now() - interval '10 minutes';

    IF v_fraud_count >= 10 THEN
      INSERT INTO public.banned_users (user_id, reason)
      VALUES (p_user_id, 'Auto-ban: ' || v_fraud_count || ' rate limit violations in 10min')
      ON CONFLICT DO NOTHING;

      IF p_ip IS NOT NULL AND p_ip <> 'unknown' THEN
        INSERT INTO public.banned_ips (ip_address, reason)
        VALUES (p_ip, 'Auto-ban: ' || v_fraud_count || ' rate limit violations in 10min')
        ON CONFLICT DO NOTHING;
      END IF;

      INSERT INTO public.fraud_attempts (user_id, ip_address, action, details)
      VALUES (p_user_id, p_ip, 'auto_banned',
        jsonb_build_object('reason', 'rate_limit_spam', 'violations', v_fraud_count));
    END IF;

    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;

  INSERT INTO public.rate_limits (user_id, ip_address, endpoint)
  VALUES (p_user_id, p_ip, p_endpoint);

  RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - v_count - 1);
END;
$function$;