
-- Tabela de indicações
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE, -- cada pessoa só pode ser indicada uma vez
  commission_paid boolean NOT NULL DEFAULT false,
  commission_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_referral CHECK (referrer_id != referred_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Usuário vê suas próprias indicações (como referrer)
CREATE POLICY "Users can view own referrals"
ON public.referrals FOR SELECT
USING (auth.uid() = referrer_id);

-- Ninguém modifica via cliente
CREATE POLICY "Block client insert on referrals"
ON public.referrals FOR INSERT
WITH CHECK (false);

CREATE POLICY "Block client update on referrals"
ON public.referrals FOR UPDATE
USING (false);

CREATE POLICY "Block client delete on referrals"
ON public.referrals FOR DELETE
USING (false);

-- Admin full access
CREATE POLICY "Admins can manage referrals"
ON public.referrals FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Index para buscar referral do referred_id rapidamente (usado no webhook)
CREATE INDEX idx_referrals_referred_id ON public.referrals (referred_id);
CREATE INDEX idx_referrals_referrer_id ON public.referrals (referrer_id);
