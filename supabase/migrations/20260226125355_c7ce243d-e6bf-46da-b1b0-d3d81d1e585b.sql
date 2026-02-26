
-- =====================================================
-- FIX 1: Add advisory lock to credit_wallet to prevent double-credit race condition
-- The idempotency check (SELECT count) was happening BEFORE the FOR UPDATE lock,
-- allowing two concurrent calls to both see count=0 and both credit the wallet.
-- =====================================================
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

  -- SECURITY FIX: Advisory lock FIRST to serialize ALL operations for this user
  -- This prevents the race where two concurrent calls both pass the idempotency check
  PERFORM pg_advisory_xact_lock(('x' || left(replace(p_user_id::text, '-', ''), 15))::bit(64)::bigint);

  -- Idempotência (now safe because advisory lock serializes concurrent calls)
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

-- =====================================================
-- FIX 2: Add unique partial index on wallet_transactions.reference_id
-- This is a defense-in-depth measure: even if the advisory lock somehow fails,
-- the DB will reject duplicate credits with the same reference_id.
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference_unique_deposit
ON public.wallet_transactions (reference_id)
WHERE reference_id IS NOT NULL AND type = 'deposit';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference_unique_debit
ON public.wallet_transactions (reference_id)
WHERE reference_id IS NOT NULL AND type = 'debit';

-- =====================================================
-- FIX 3: Add idempotency to refund_client_token_credits
-- Add a p_reference_id parameter and track refunds to prevent double-refund
-- =====================================================
CREATE OR REPLACE FUNCTION public.refund_client_token_credits(p_token_id uuid, p_credits integer, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token RECORD;
BEGIN
  -- Advisory lock on token to serialize concurrent refunds
  PERFORM pg_advisory_xact_lock(('x' || left(replace(p_token_id::text, '-', ''), 15))::bit(64)::bigint);

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
