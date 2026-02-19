
-- Criar carteira e creditar R$150 para andrinha.gtba@gmail.com (user_id: 2d8a61e8-474d-4e0f-bc77-be0914d2f2a2)
INSERT INTO public.wallets (user_id, balance) VALUES ('2d8a61e8-474d-4e0f-bc77-be0914d2f2a2', 150)
ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + 150;

INSERT INTO public.wallet_transactions (wallet_id, type, amount, description)
VALUES (
  (SELECT id FROM public.wallets WHERE user_id = '2d8a61e8-474d-4e0f-bc77-be0914d2f2a2'),
  'deposit',
  150,
  'Crédito manual admin'
);
