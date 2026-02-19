
-- Credit R$5 to reisestacio@gmail.com (order 67bdebcc-961a-4de9-82c3-8d8dd2dd41fa confirmed paid on BrPix dashboard)
UPDATE orders SET status = 'paid', paid_at = now() WHERE id = '67bdebcc-961a-4de9-82c3-8d8dd2dd41fa' AND status = 'pending';

SELECT credit_wallet(
  'df9b8193-6b61-4604-af89-e5c1144b5a2f'::uuid,
  5.00,
  'Depósito via PIX (correção manual - confirmado BrPix)',
  '67bdebcc-961a-4de9-82c3-8d8dd2dd41fa'
);
