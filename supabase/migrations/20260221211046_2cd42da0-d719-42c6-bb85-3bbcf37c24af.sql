
-- 1) Settle 4 ghost generations and refund client tokens
DO $$
DECLARE
  v_gen RECORD;
  v_refund_credits integer;
BEGIN
  -- Ghost 1: d0dff9df (on-demand, user abeddf7c, 5/500)
  UPDATE generations 
  SET status = 'cancelled', settled_at = now(), credits_earned = 5,
      error_message = 'Ghost auto-cancel: sem atividade >15min'
  WHERE id = 'd0dff9df-3c45-453f-8d85-c9429c648260' AND settled_at IS NULL;
  
  -- Refund on-demand user
  IF FOUND THEN
    PERFORM credit_wallet(
      'abeddf7c-7b72-4e41-a06a-947f31dd8b91'::uuid,
      (calc_credit_price(500) - calc_credit_price(5)),
      'Reembolso - geração fantasma cancelada (5/500 créditos)',
      '9ce8f0c0-8754-4805-8df8-2727ab9a6cc7'
    );
  END IF;

  -- Ghost 2: 6f041a44 (client_token 02c216f9, 5/1000)
  UPDATE generations 
  SET status = 'cancelled', settled_at = now(), credits_earned = 5,
      error_message = 'Ghost auto-cancel: sem atividade >15min'
  WHERE id = '6f041a44-a770-4f24-8257-afaeba474da2' AND settled_at IS NULL;
  
  IF FOUND THEN
    PERFORM refund_client_token_credits('02c216f9-6f48-4715-a72e-47fd9d2d0a11'::uuid, 995);
  END IF;

  -- Ghost 3: efb5e340 (client_token 88c09099, 0/175)
  UPDATE generations 
  SET status = 'cancelled', settled_at = now(), credits_earned = 0,
      error_message = 'Ghost auto-cancel: sem atividade >15min'
  WHERE id = 'efb5e340-3938-4a34-bfe3-c1d67c7a4c35' AND settled_at IS NULL;
  
  IF FOUND THEN
    PERFORM refund_client_token_credits('88c09099-4588-4c8a-bd84-ba3769689b3b'::uuid, 175);
  END IF;

  -- Ghost 4: 9b01e5c8 (client_token 9b2bb190, 60/145)
  UPDATE generations 
  SET status = 'cancelled', settled_at = now(), credits_earned = 60,
      error_message = 'Ghost auto-cancel: sem atividade >15min'
  WHERE id = '9b01e5c8-b308-49ea-9ba6-0e3900b78538' AND settled_at IS NULL;
  
  IF FOUND THEN
    PERFORM refund_client_token_credits('9b2bb190-4965-4765-8788-4f3e0bb77684'::uuid, 85);
  END IF;
END $$;

-- 2) Update auto_refund_cron to detect running ghosts (updated_at > 15 min ago)
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
  -- 0) Cancel RUNNING ghosts: no update in >15 minutes (stale farms)
  FOR gen IN
    SELECT id, farm_id, user_id, credits_requested, credits_earned, client_token_id
    FROM generations
    WHERE settled_at IS NULL
      AND status = 'running'
      AND updated_at < (now() - interval '15 minutes')
      AND created_at > (now() - interval '24 hours')
    LIMIT 50
  LOOP
    v_earned := COALESCE(gen.credits_earned, 0);

    UPDATE generations
    SET status = 'cancelled',
        settled_at = now(),
        error_message = 'Ghost auto-cancel: sem atividade >15min',
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
          'Reembolso automático - ghost cancelled (' || v_earned || '/' || gen.credits_requested || ' créditos)',
          gen.farm_id);
      END IF;
    ELSIF gen.client_token_id IS NOT NULL THEN
      v_refund_credits := gen.credits_requested - v_earned;
      IF v_refund_credits > 0 THEN
        PERFORM refund_client_token_credits(gen.client_token_id, v_refund_credits);
      END IF;
    END IF;
  END LOOP;

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
