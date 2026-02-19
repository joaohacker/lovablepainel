
-- 1) Tornar credit_wallet IDEMPOTENTE: se já existe transação com mesmo reference_id, retorna sem duplicar
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id uuid, p_amount numeric, p_description text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wallet RECORD; v_new_balance numeric; v_existing_count integer;
BEGIN
  -- IDEMPOTÊNCIA: Se reference_id fornecido, verificar se já foi creditado
  IF p_reference_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_count
    FROM public.wallet_transactions
    WHERE reference_id = p_reference_id AND type = 'deposit';
    
    IF v_existing_count > 0 THEN
      -- Já creditado, retornar sem duplicar
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

-- 2) Marcar todas as orders que foram creditadas (têm wallet_transactions) mas ainda estão pending
UPDATE orders o
SET status = 'paid', paid_at = now()
WHERE o.status = 'pending'
AND o.order_type = 'deposit'
AND EXISTS (
  SELECT 1 FROM wallet_transactions wt
  WHERE wt.reference_id = o.id::text AND wt.type = 'deposit'
);
