
-- Creditar R$100 para fifagostoso34542112@gmail.com
SELECT credit_wallet(
  '3259c909-edd2-4ef5-b637-4450fd2abf99'::uuid,
  100.00,
  'Crédito manual - admin',
  'manual-admin-' || gen_random_uuid()::text
);
