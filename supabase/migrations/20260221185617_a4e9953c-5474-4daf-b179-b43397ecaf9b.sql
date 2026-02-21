
-- =====================================================
-- SECURITY HARDENING MIGRATION - 10 ITEMS
-- =====================================================

-- === 1. WEBHOOK_EVENTS TABLE (Item 4: Anti-Replay) ===
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, event_type)
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block all access to webhook_events"
  ON public.webhook_events
  FOR ALL
  USING (false);

-- === 1. UPDATE debit_wallet with advisory lock + idempotency ===
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_credits integer,
  p_description text,
  p_reference_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet RECORD;
  v_new_balance numeric;
  v_existing_count integer;
BEGIN
  -- Mark as authorized RPC
  PERFORM set_config('app.balance_rpc', 'true', true);

  -- Advisory lock based on user_id to serialize concurrent debits
  PERFORM pg_advisory_xact_lock(('x' || left(replace(p_user_id::text, '-', ''), 15))::bit(64)::bigint);

  -- Idempotency check: if reference_id already exists as debit, reject
  IF p_reference_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_count
    FROM public.wallet_transactions
    WHERE reference_id = p_reference_id AND type = 'debit';
    IF v_existing_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Operação já processada', 'duplicate', true);
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;
  IF p_amount > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor máximo por operação: R$ 10.000');
  END IF;
  IF p_credits < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Créditos inválidos');
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carteira não encontrada');
  END IF;
  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_wallet.balance, 'required', p_amount);
  END IF;

  v_new_balance := v_wallet.balance - p_amount;
  UPDATE public.wallets SET balance = v_new_balance WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (wallet_id, type, amount, credits, description, reference_id)
  VALUES (v_wallet.id, 'debit', p_amount, p_credits, p_description, p_reference_id);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

-- === 3. UPDATE check_rate_limit with auto-ban ===
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_ip text,
  p_endpoint text,
  p_max_requests integer DEFAULT 10,
  p_window_seconds integer DEFAULT 60
)
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

  -- Cleanup old entries (older than 10 minutes)
  DELETE FROM public.rate_limits
  WHERE created_at < now() - interval '10 minutes';

  -- Count requests in window
  SELECT count(*) INTO v_count
  FROM public.rate_limits
  WHERE (user_id = p_user_id OR ip_address = p_ip)
    AND endpoint = p_endpoint
    AND created_at >= v_window_start;

  IF v_count >= p_max_requests THEN
    -- Log fraud attempt
    INSERT INTO public.fraud_attempts (user_id, ip_address, action, details)
    VALUES (p_user_id, p_ip, 'rate_limit_exceeded',
      jsonb_build_object('endpoint', p_endpoint, 'count', v_count, 'limit', p_max_requests));

    -- AUTO-BAN: Check if 3+ rate limit violations in last 10 minutes
    SELECT count(*) INTO v_fraud_count
    FROM public.fraud_attempts
    WHERE user_id = p_user_id
      AND action = 'rate_limit_exceeded'
      AND created_at > now() - interval '10 minutes';

    IF v_fraud_count >= 3 THEN
      -- Ban user
      INSERT INTO public.banned_users (user_id, reason)
      VALUES (p_user_id, 'Auto-ban: ' || v_fraud_count || ' rate limit violations in 10min')
      ON CONFLICT DO NOTHING;

      -- Ban IP if known
      IF p_ip IS NOT NULL AND p_ip <> 'unknown' THEN
        INSERT INTO public.banned_ips (ip_address, reason)
        VALUES (p_ip, 'Auto-ban: ' || v_fraud_count || ' rate limit violations in 10min')
        ON CONFLICT DO NOTHING;
      END IF;

      -- Log auto-ban event
      INSERT INTO public.fraud_attempts (user_id, ip_address, action, details)
      VALUES (p_user_id, p_ip, 'auto_banned',
        jsonb_build_object('reason', 'rate_limit_spam', 'violations', v_fraud_count));
    END IF;

    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;

  -- Record this request
  INSERT INTO public.rate_limits (user_id, ip_address, endpoint)
  VALUES (p_user_id, p_ip, p_endpoint);

  RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - v_count - 1);
END;
$function$;

-- === 7. DAILY RECONCILIATION FUNCTION ===
CREATE OR REPLACE FUNCTION public.daily_reconciliation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
BEGIN
  -- 1) Check for balance discrepancies and log them
  FOR rec IN SELECT * FROM public.reconcile_balances()
  LOOP
    INSERT INTO public.fraud_attempts (user_id, ip_address, action, details)
    VALUES (
      rec.r_user_id,
      'system',
      'balance_discrepancy',
      jsonb_build_object(
        'materialized_balance', rec.materialized_balance,
        'ledger_balance', rec.ledger_balance,
        'difference', rec.difference
      )
    );
  END LOOP;

  -- 2) Cleanup old webhook_events (older than 7 days)
  DELETE FROM public.webhook_events
  WHERE received_at < now() - interval '7 days';
END;
$function$;

-- Revoke execution permissions on sensitive functions
REVOKE EXECUTE ON FUNCTION public.daily_reconciliation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;

-- Schedule daily reconciliation via pg_cron (4 AM UTC)
SELECT cron.schedule(
  'daily_reconciliation',
  '0 4 * * *',
  $$SELECT public.daily_reconciliation()$$
);
