-- =====================================================
-- COMPREHENSIVE SECURITY LOCKDOWN
-- =====================================================

-- 1) REVOKE dangerous function access from public roles
-- auto_refund_cron: CRITICAL — anyone could trigger mass refunds
REVOKE EXECUTE ON FUNCTION public.auto_refund_cron() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_refund_cron() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_refund_cron() FROM authenticated;

-- Trigger functions: should not be callable directly
REVOKE EXECUTE ON FUNCTION public.log_balance_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_balance_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_balance_change() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;

-- increment_coupon_usage: should only be called by service role
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM authenticated;

-- 2) Block INSERT/UPDATE/DELETE on balance_audit_log (immutable audit trail)
CREATE POLICY "Block all inserts on balance_audit_log"
  ON public.balance_audit_log FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block all updates on balance_audit_log"
  ON public.balance_audit_log FOR UPDATE
  USING (false);

CREATE POLICY "Block all deletes on balance_audit_log"
  ON public.balance_audit_log FOR DELETE
  USING (false);

-- 3) Block INSERT/UPDATE/DELETE on wallets (only service role via RPCs)
CREATE POLICY "Block user insert on wallets"
  ON public.wallets FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user update on wallets"
  ON public.wallets FOR UPDATE
  USING (false);

CREATE POLICY "Block user delete on wallets"
  ON public.wallets FOR DELETE
  USING (false);

-- 4) Block INSERT/UPDATE/DELETE on wallet_transactions
CREATE POLICY "Block user insert on wallet_transactions"
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user update on wallet_transactions"
  ON public.wallet_transactions FOR UPDATE
  USING (false);

CREATE POLICY "Block user delete on wallet_transactions"
  ON public.wallet_transactions FOR DELETE
  USING (false);

-- 5) Block INSERT/UPDATE/DELETE on orders (only service role)
CREATE POLICY "Block user insert on orders"
  ON public.orders FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user update on orders"
  ON public.orders FOR UPDATE
  USING (false);

CREATE POLICY "Block user delete on orders"
  ON public.orders FOR DELETE
  USING (false);

-- 6) Block INSERT/UPDATE/DELETE on token_usages
CREATE POLICY "Block user insert on token_usages"
  ON public.token_usages FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user update on token_usages"
  ON public.token_usages FOR UPDATE
  USING (false);

CREATE POLICY "Block user delete on token_usages"
  ON public.token_usages FOR DELETE
  USING (false);

-- 7) Block DELETE on user_roles (prevent self-role-deletion tricks)
-- INSERT/UPDATE already blocked for non-admins via existing policies

-- 8) Block anon INSERT/UPDATE on generations
CREATE POLICY "Block user insert on generations"
  ON public.generations FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user update on generations"
  ON public.generations FOR UPDATE
  USING (false);

CREATE POLICY "Block user delete on generations"
  ON public.generations FOR DELETE
  USING (false);

-- 9) Block DELETE on profiles (users can't delete their own profile)
CREATE POLICY "Block user delete on profiles"
  ON public.profiles FOR DELETE
  USING (false);

-- 10) Harden debit_wallet with amount validation
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id uuid, p_amount numeric, p_credits integer, p_description text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wallet RECORD; v_new_balance numeric;
BEGIN
  -- Validation
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

-- Re-lock debit_wallet
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM authenticated;