
-- Credit R$25 to luquinhasnun21213es@gmail.com
-- First ensure wallet exists, then update balance
INSERT INTO public.wallets (user_id, balance) 
VALUES ('c0c4c811-ac28-4c6d-af4f-846d526ca1d4', 25)
ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + 25;

INSERT INTO public.wallet_transactions (wallet_id, type, amount, description)
SELECT id, 'deposit', 25, 'Crédito manual admin'
FROM public.wallets WHERE user_id = 'c0c4c811-ac28-4c6d-af4f-846d526ca1d4';
