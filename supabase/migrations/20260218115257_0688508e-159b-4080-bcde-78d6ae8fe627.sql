
INSERT INTO public.wallets (user_id, balance) 
VALUES ('246893e1-0546-45b5-88e7-566d093c5f5e', 20)
ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + 20;

INSERT INTO public.wallet_transactions (wallet_id, type, amount, description)
SELECT id, 'deposit', 20, '🎁 Bônus de fidelidade — obrigado por usar nosso painel!'
FROM public.wallets WHERE user_id = '246893e1-0546-45b5-88e7-566d093c5f5e';
