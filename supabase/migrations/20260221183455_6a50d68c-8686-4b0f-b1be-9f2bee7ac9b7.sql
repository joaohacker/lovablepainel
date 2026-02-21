-- 1) REVOKE refund_client_token_credits from public access
REVOKE EXECUTE ON FUNCTION public.refund_client_token_credits(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_client_token_credits(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_client_token_credits(uuid, integer) FROM authenticated;

-- 2) Create immutable balance audit log table
CREATE TABLE IF NOT EXISTS public.balance_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  old_balance numeric NOT NULL,
  new_balance numeric NOT NULL,
  change_amount numeric NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'unknown'
);

-- RLS: only admins can read audit log
ALTER TABLE public.balance_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read balance_audit_log"
  ON public.balance_audit_log
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Block all other access
CREATE POLICY "Block anon access balance_audit_log"
  ON public.balance_audit_log
  FOR SELECT
  USING (false);

-- No insert/update/delete for regular users (only trigger writes here)

-- 3) Create trigger to log every balance change
CREATE OR REPLACE FUNCTION public.log_balance_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    INSERT INTO public.balance_audit_log (wallet_id, user_id, old_balance, new_balance, change_amount, source)
    VALUES (
      NEW.id,
      NEW.user_id,
      OLD.balance,
      NEW.balance,
      NEW.balance - OLD.balance,
      CASE
        WHEN NEW.balance > OLD.balance THEN 'credit'
        ELSE 'debit'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_balance_audit
  AFTER UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_balance_change();

-- 4) Add max deposit cap validation in credit_wallet (R$ 10,000 per transaction)
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id uuid, p_amount numeric, p_description text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wallet RECORD; v_new_balance numeric; v_existing_count integer;
BEGIN
  -- CAP: Maximum R$ 10,000 per credit operation
  IF p_amount > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor máximo por operação: R$ 10.000');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;

  -- IDEMPOTÊNCIA: Se reference_id fornecido, verificar se já foi creditado
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

-- Ensure credit_wallet stays locked from public
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM authenticated;