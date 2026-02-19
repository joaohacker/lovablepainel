-- Temporary: grant execute on credit_wallet to service role for this operation
-- Instead, directly insert wallet and transaction

INSERT INTO public.wallets (user_id, balance) VALUES ('7decce0a-6ddc-4f0c-b91c-5f5b9bdc2d15', 200.00)
ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + 200.00, updated_at = now();

INSERT INTO public.wallet_transactions (wallet_id, type, amount, description)
SELECT id, 'deposit', 200.00, 'Crédito manual admin'
FROM public.wallets WHERE user_id = '7decce0a-6ddc-4f0c-b91c-5f5b9bdc2d15';
