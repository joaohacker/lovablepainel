
-- Credit R$5.00 to reisestacio@gmail.com for orphaned order c58fbb32
-- Step 1: Assign user_id to the orphaned order
UPDATE public.orders 
SET user_id = 'df9b8193-6b61-4604-af89-e5c1144b5a2f' 
WHERE id = 'c58fbb32-c119-4edf-ba03-ae2f9b06d26d' 
  AND user_id IS NULL 
  AND status = 'paid';

-- Step 2: Credit the wallet
SELECT public.credit_wallet(
  'df9b8193-6b61-4604-af89-e5c1144b5a2f'::uuid,
  5.00,
  'Crédito manual - depósito PIX órfão',
  'c58fbb32-c119-4edf-ba03-ae2f9b06d26d'
);
