
-- Allow admins to read all wallet_transactions
CREATE POLICY "Admins can view all wallet_transactions"
  ON public.wallet_transactions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
