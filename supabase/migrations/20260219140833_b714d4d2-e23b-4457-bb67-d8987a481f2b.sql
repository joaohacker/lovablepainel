
-- Credit R$5.00 to leul.fonseca@gmail.com - webhook never confirmed payment
-- Update order to paid
UPDATE public.orders 
SET status = 'paid', paid_at = now()
WHERE id = 'fd9f022c-b469-482d-847b-86b25c70851a' AND status = 'pending';

-- Credit wallet (creates wallet if not exists)
SELECT public.credit_wallet(
  '4290c46d-e41a-4d40-8350-ebe4635beb3f'::uuid,
  5.00,
  'Crédito manual - PIX confirmado na API mas webhook falhou',
  'fd9f022c-b469-482d-847b-86b25c70851a'
);
