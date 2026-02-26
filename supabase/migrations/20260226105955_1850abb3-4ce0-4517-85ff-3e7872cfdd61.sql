
-- Remove running ghost handling from auto_refund_cron and add upstream sync requirement
-- The edge function auto-refund will handle running ghosts with upstream API verification
CREATE OR REPLACE FUNCTION public.auto_refund_cron()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gen RECORD;
  v_full_cost numeric;
  v_delivered_cost numeric;
  v_refund_amount numeric;
  v_refund_credits integer;
  v_earned integer;
  v_rows integer;
BEGIN
  -- REMOVED: Section 0 (running ghost auto-cancel) moved to edge function
  -- which can verify upstream API before refunding.
  -- This prevents the exploit where credits are delivered but credits_earned
  -- isn't synced, causing a full refund + delivered credits = double spend.

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
$function$;
