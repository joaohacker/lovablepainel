
-- Wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallets' AND policyname = 'Users can view own wallet') THEN
    CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallets' AND policyname = 'Service role can manage wallets') THEN
    CREATE POLICY "Service role can manage wallets" ON public.wallets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'debit')),
  amount numeric NOT NULL,
  credits integer,
  description text NOT NULL DEFAULT '',
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_transactions' AND policyname = 'Users can view own transactions') THEN
    CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
      FOR SELECT USING (EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = wallet_id AND w.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_transactions' AND policyname = 'Service role can manage transactions') THEN
    CREATE POLICY "Service role can manage transactions" ON public.wallet_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add columns to existing tables
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'token';

-- RLS policies for new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generations' AND policyname = 'Users can view own generations') THEN
    CREATE POLICY "Users can view own generations" ON public.generations FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generations' AND policyname = 'Anyone can view active generations summary') THEN
    CREATE POLICY "Anyone can view active generations summary" ON public.generations FOR SELECT USING (status IN ('running', 'waiting_invite', 'queued', 'creating'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Users can view own orders') THEN
    CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Atomic debit function
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id uuid, p_amount numeric, p_credits integer, p_description text, p_reference_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_wallet RECORD; v_new_balance numeric;
BEGIN
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Carteira não encontrada'); END IF;
  IF v_wallet.balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_wallet.balance, 'required', p_amount); END IF;
  v_new_balance := v_wallet.balance - p_amount;
  UPDATE public.wallets SET balance = v_new_balance WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (wallet_id, type, amount, credits, description, reference_id) VALUES (v_wallet.id, 'debit', p_amount, p_credits, p_description, p_reference_id);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END; $$;

-- Credit wallet function
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid, p_amount numeric, p_description text, p_reference_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_wallet RECORD; v_new_balance numeric;
BEGIN
  INSERT INTO public.wallets (user_id, balance) VALUES (p_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  v_new_balance := v_wallet.balance + p_amount;
  UPDATE public.wallets SET balance = v_new_balance WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (wallet_id, type, amount, description, reference_id) VALUES (v_wallet.id, 'deposit', p_amount, p_description, p_reference_id);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END; $$;
