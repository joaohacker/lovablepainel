
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Pricing function (replicates JS calcularPreco)
CREATE OR REPLACE FUNCTION public.calc_credit_price(creditos integer)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  t numeric;
  unit_low numeric;
  unit_high numeric;
  unit_price numeric;
BEGIN
  IF creditos <= 0 THEN RETURN 0; END IF;
  IF creditos <= 100 THEN RETURN ROUND((creditos * 0.035)::numeric, 2); END IF;
  IF creditos >= 10000 THEN RETURN ROUND((creditos * 0.0196)::numeric, 2); END IF;

  IF creditos <= 1000 THEN
    t := (creditos - 100)::numeric / 900.0;
    unit_low := 0.035; unit_high := 0.0245;
    unit_price := unit_low + t * (unit_high - unit_low);
    RETURN ROUND((creditos * unit_price)::numeric, 2);
  END IF;

  IF creditos <= 5000 THEN
    t := (creditos - 1000)::numeric / 4000.0;
    unit_low := 0.0245; unit_high := 0.021;
    unit_price := unit_low + t * (unit_high - unit_low);
    RETURN ROUND((creditos * unit_price)::numeric, 2);
  END IF;

  t := (creditos - 5000)::numeric / 5000.0;
  unit_low := 0.021; unit_high := 0.0196;
  unit_price := unit_low + t * (unit_high - unit_low);
  RETURN ROUND((creditos * unit_price)::numeric, 2);
END;
$$;

-- Main auto-refund function
CREATE OR REPLACE FUNCTION public.auto_refund_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  gen RECORD;
  v_full_cost numeric;
  v_delivered_cost numeric;
  v_refund_amount numeric;
  v_refund_credits integer;
  v_earned integer;
  v_rows integer;
BEGIN
  -- 1) Cancel waiting_invite stuck > 10 minutes (last 24h only)
  FOR gen IN
    SELECT id, farm_id, user_id, credits_requested, credits_earned, client_token_id
    FROM generations
    WHERE settled_at IS NULL
      AND status = 'waiting_invite'
      AND created_at < (now() - interval '10 minutes')
      AND created_at > (now() - interval '24 hours')
    LIMIT 50
  LOOP
    v_earned := COALESCE(gen.credits_earned, 0);

    UPDATE generations
    SET status = 'cancelled',
        settled_at = now(),
        error_message = 'Cancelado automaticamente - waiting_invite_timeout',
        credits_earned = v_earned
    WHERE id = gen.id AND settled_at IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN CONTINUE; END IF;

    IF gen.user_id IS NOT NULL AND gen.client_token_id IS NULL THEN
      v_full_cost := calc_credit_price(gen.credits_requested);
      v_delivered_cost := CASE WHEN v_earned > 0 THEN calc_credit_price(v_earned) ELSE 0 END;
      v_refund_amount := ROUND((v_full_cost - v_delivered_cost)::numeric, 2);
      IF v_refund_amount > 0 THEN
        PERFORM credit_wallet(gen.user_id, v_refund_amount,
          'Reembolso automático - geração cancelled (' || gen.credits_requested || ' créditos)',
          gen.farm_id);
      END IF;
    ELSIF gen.client_token_id IS NOT NULL THEN
      v_refund_credits := gen.credits_requested - v_earned;
      IF v_refund_credits > 0 THEN
        PERFORM refund_client_token_credits(gen.client_token_id, v_refund_credits);
      END IF;
    END IF;
  END LOOP;

  -- 2) Settle expired/cancelled/error (last 24h only)
  FOR gen IN
    SELECT id, farm_id, user_id, credits_requested, credits_earned, status, client_token_id
    FROM generations
    WHERE settled_at IS NULL
      AND status IN ('expired', 'cancelled', 'error')
      AND created_at > (now() - interval '24 hours')
    LIMIT 50
  LOOP
    v_earned := COALESCE(gen.credits_earned, 0);

    UPDATE generations SET settled_at = now(), credits_earned = v_earned
    WHERE id = gen.id AND settled_at IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN CONTINUE; END IF;

    IF gen.user_id IS NOT NULL AND gen.client_token_id IS NULL THEN
      v_full_cost := calc_credit_price(gen.credits_requested);
      v_delivered_cost := CASE WHEN v_earned > 0 THEN calc_credit_price(v_earned) ELSE 0 END;
      v_refund_amount := ROUND((v_full_cost - v_delivered_cost)::numeric, 2);
      IF v_refund_amount > 0 THEN
        PERFORM credit_wallet(gen.user_id, v_refund_amount,
          'Reembolso automático - geração ' || gen.status || ' (' || v_earned || '/' || gen.credits_requested || ' créditos)',
          gen.farm_id);
      END IF;
    ELSIF gen.client_token_id IS NOT NULL THEN
      v_refund_credits := gen.credits_requested - v_earned;
      IF v_refund_credits > 0 THEN
        PERFORM refund_client_token_credits(gen.client_token_id, v_refund_credits);
      END IF;
    END IF;
  END LOOP;

  -- 3) Settle completed with partial delivery
  FOR gen IN
    SELECT id, farm_id, user_id, credits_requested, credits_earned, client_token_id
    FROM generations
    WHERE settled_at IS NULL
      AND status = 'completed'
      AND created_at > (now() - interval '24 hours')
    LIMIT 50
  LOOP
    v_earned := COALESCE(gen.credits_earned, 0);

    UPDATE generations SET settled_at = now()
    WHERE id = gen.id AND settled_at IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN CONTINUE; END IF;

    IF v_earned >= gen.credits_requested THEN CONTINUE; END IF;

    IF gen.user_id IS NOT NULL AND gen.client_token_id IS NULL THEN
      v_full_cost := calc_credit_price(gen.credits_requested);
      v_delivered_cost := CASE WHEN v_earned > 0 THEN calc_credit_price(v_earned) ELSE 0 END;
      v_refund_amount := ROUND((v_full_cost - v_delivered_cost)::numeric, 2);
      IF v_refund_amount > 0 THEN
        PERFORM credit_wallet(gen.user_id, v_refund_amount,
          'Reembolso automático - ' || v_earned || '/' || gen.credits_requested || ' créditos entregues',
          gen.farm_id);
      END IF;
    ELSIF gen.client_token_id IS NOT NULL THEN
      v_refund_credits := gen.credits_requested - v_earned;
      IF v_refund_credits > 0 THEN
        PERFORM refund_client_token_credits(gen.client_token_id, v_refund_credits);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Schedule cron job every 5 minutes
SELECT cron.schedule('auto-refund-every-5min', '*/5 * * * *', 'SELECT public.auto_refund_cron()');
