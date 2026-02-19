
-- Creditar R$60 para augustosbizera@gmail.com
UPDATE public.wallets SET balance = balance + 60 WHERE user_id = '246893e1-0546-45b5-88e7-566d093c5f5e';
INSERT INTO public.wallet_transactions (wallet_id, type, amount, description) VALUES ('250b81dc-83f2-421b-b2dc-710d947860da', 'deposit', 60, 'Crédito manual admin');
