
INSERT INTO public.wallets (user_id, balance) 
VALUES ('84d39cac-2deb-4e2f-a076-a79d877541c0', 200)
ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + 200;

INSERT INTO public.wallet_transactions (wallet_id, type, amount, description)
SELECT id, 'deposit', 200, 'Crédito manual admin'
FROM public.wallets WHERE user_id = '84d39cac-2deb-4e2f-a076-a79d877541c0';
