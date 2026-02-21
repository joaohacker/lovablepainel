-- =====================================================
-- PRD SECURITY GAPS — IMPLEMENTAÇÃO
-- =====================================================

-- 1) PREVENT_BALANCE_TAMPERING: Bloqueia UPDATE direto em wallets.balance
-- Apenas RPCs autorizadas (que setam app.balance_rpc = 'true') podem alterar o saldo
CREATE OR REPLACE FUNCTION public.prevent_balance_tampering()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Allow if called from authorized RPC context
  IF current_setting('app.balance_rpc', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- Block if balance is being changed
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    RAISE EXCEPTION 'Direct balance modification is not allowed. Use authorized RPCs.';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_balance_tampering
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_balance_tampering();

-- Revoke direct execution
REVOKE EXECUTE ON FUNCTION public.prevent_balance_tampering() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_balance_tampering() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_balance_tampering() FROM authenticated;

-- 2) UPDATE credit_wallet to set the RPC flag
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id uuid, p_amount numeric, p_description text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wallet RECORD; v_new_balance numeric; v_existing_count integer;
BEGIN
  -- Mark this as authorized RPC
  PERFORM set_config('app.balance_rpc', 'true', true);

  IF p_amount > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor máximo por operação: R$ 10.000');
  END IF;
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;

  -- Idempotência
  IF p_reference_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_count
    FROM public.wallet_transactions
    WHERE reference_id = p_reference_id AND type = 'deposit';
    IF v_existing_count > 0 THEN
      SELECT balance INTO v_new_balance FROM public.wallets WHERE user_id = p_user_id;
      RETURN jsonb_build_object('success', true, 'new_balance', COALESCE(v_new_balance, 0), 'already_credited', true);
    END IF;
  END IF;

  INSERT INTO public.wallets (user_id, balance) VALUES (p_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  v_new_balance := v_wallet.balance + p_amount;
  UPDATE public.wallets SET balance = v_new_balance WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (wallet_id, type, amount, description, reference_id) VALUES (v_wallet.id, 'deposit', p_amount, p_description, p_reference_id);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END; $function$;

-- 3) UPDATE debit_wallet to set the RPC flag
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id uuid, p_amount numeric, p_credits integer, p_description text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wallet RECORD; v_new_balance numeric;
BEGIN
  PERFORM set_config('app.balance_rpc', 'true', true);

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
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Carteira não encontrada'); END IF;
  IF v_wallet.balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_wallet.balance, 'required', p_amount); END IF;
  v_new_balance := v_wallet.balance - p_amount;
  UPDATE public.wallets SET balance = v_new_balance WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (wallet_id, type, amount, credits, description, reference_id) VALUES (v_wallet.id, 'debit', p_amount, p_credits, p_description, p_reference_id);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END; $function$;

-- Re-lock both
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM PUBLIC, anon, authenticated;

-- 4) REFUND LOCKS — prevent duplicate refunds in parallel execution
CREATE TABLE IF NOT EXISTS public.refund_locks (
  debit_transaction_id uuid PRIMARY KEY,
  locked_by text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.refund_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block all access to refund_locks"
  ON public.refund_locks FOR ALL
  USING (false);

-- 5) RECONCILE_BALANCES — compare wallets.balance vs SUM(wallet_transactions)
CREATE OR REPLACE FUNCTION public.reconcile_balances()
  RETURNS TABLE(
    r_user_id uuid,
    materialized_balance numeric,
    ledger_balance numeric,
    difference numeric
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.user_id,
    w.balance AS materialized_balance,
    COALESCE(
      SUM(CASE WHEN wt.type = 'deposit' THEN wt.amount ELSE 0 END) -
      SUM(CASE WHEN wt.type = 'debit' THEN wt.amount ELSE 0 END),
      0
    ) AS ledger_balance,
    w.balance - COALESCE(
      SUM(CASE WHEN wt.type = 'deposit' THEN wt.amount ELSE 0 END) -
      SUM(CASE WHEN wt.type = 'debit' THEN wt.amount ELSE 0 END),
      0
    ) AS difference
  FROM public.wallets w
  LEFT JOIN public.wallet_transactions wt ON wt.wallet_id = w.id
  GROUP BY w.user_id, w.balance
  HAVING ABS(
    w.balance - COALESCE(
      SUM(CASE WHEN wt.type = 'deposit' THEN wt.amount ELSE 0 END) -
      SUM(CASE WHEN wt.type = 'debit' THEN wt.amount ELSE 0 END),
      0
    )
  ) > 0.01
  ORDER BY ABS(
    w.balance - COALESCE(
      SUM(CASE WHEN wt.type = 'deposit' THEN wt.amount ELSE 0 END) -
      SUM(CASE WHEN wt.type = 'debit' THEN wt.amount ELSE 0 END),
      0
    )
  ) DESC;
END;
$$;

-- Only service role can call reconcile
REVOKE EXECUTE ON FUNCTION public.reconcile_balances() FROM PUBLIC, anon, authenticated;

-- 6) FRAUD ATTEMPTS LOG — append-only fraud detection
CREATE TABLE IF NOT EXISTS public.fraud_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_address text,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read fraud_attempts"
  ON public.fraud_attempts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Block all writes to fraud_attempts"
  ON public.fraud_attempts FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block updates on fraud_attempts"
  ON public.fraud_attempts FOR UPDATE
  USING (false);

CREATE POLICY "Block deletes on fraud_attempts"
  ON public.fraud_attempts FOR DELETE
  USING (false);

-- 7) Rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_address text,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block all access to rate_limits"
  ON public.rate_limits FOR ALL
  USING (false);

-- Rate limit check function
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
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
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
    
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;
  
  -- Record this request
  INSERT INTO public.rate_limits (user_id, ip_address, endpoint)
  VALUES (p_user_id, p_ip, p_endpoint);
  
  RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - v_count - 1);
END;
$$;

-- Only service role can call rate limit check
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;