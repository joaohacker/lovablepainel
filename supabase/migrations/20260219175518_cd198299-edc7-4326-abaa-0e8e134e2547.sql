
DO $$
DECLARE
  gen RECORD;
  v_earned integer;
  v_full_cost numeric;
  v_delivered_cost numeric;
  v_refund_amount numeric;
  v_refund_credits integer;
  v_rows integer;
BEGIN
  FOR gen IN
    SELECT id, farm_id, user_id, client_token_id, credits_requested, credits_earned, status
    FROM generations
    WHERE settled_at IS NULL
      AND status IN ('waiting_invite', 'queued', 'pending', 'creating', 'active', 'running')
  LOOP
    v_earned := COALESCE(gen.credits_earned, 0);

    UPDATE generations
    SET status = 'cancelled',
        settled_at = now(),
        error_message = 'Cancelado manualmente pelo admin - manutenção',
        credits_earned = v_earned
    WHERE id = gen.id AND settled_at IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN CONTINUE; END IF;

    -- On-demand wallet refund
    IF gen.user_id IS NOT NULL AND gen.client_token_id IS NULL THEN
      v_full_cost := calc_credit_price(gen.credits_requested);
      v_delivered_cost := CASE WHEN v_earned > 0 THEN calc_credit_price(v_earned) ELSE 0 END;
      v_refund_amount := ROUND((v_full_cost - v_delivered_cost)::numeric, 2);
      IF v_refund_amount > 0 THEN
        PERFORM credit_wallet(gen.user_id, v_refund_amount,
          'Reembolso - manutenção (' || v_earned || '/' || gen.credits_requested || ' créditos)',
          gen.farm_id);
      END IF;
    -- Client token refund
    ELSIF gen.client_token_id IS NOT NULL THEN
      v_refund_credits := gen.credits_requested - v_earned;
      IF v_refund_credits > 0 THEN
        PERFORM refund_client_token_credits(gen.client_token_id, v_refund_credits);
      END IF;
    END IF;
  END LOOP;
END;
$$;
