
-- Fix 2 paid deposits (R$500 each) that were never credited
-- Order 26d52280: user ac9baa3e, R$500
-- Order 9404cc91: user ad4b16c4, R$500

-- Set paid_at for orders missing it
UPDATE orders SET paid_at = now() 
WHERE id IN ('26d52280-0c08-470f-8c44-5c693b4015cb', '9404cc91-5f37-4914-8453-ea3361b11b96') 
AND paid_at IS NULL;

-- Credit wallet for user ac9baa3e (order 26d52280)
SELECT public.credit_wallet(
  'ac9baa3e-15f5-45c1-a083-0105b60d0240'::uuid,
  500.00,
  'Depósito via PIX (correção manual - pagamento não creditado)',
  '26d52280-0c08-470f-8c44-5c693b4015cb'
);

-- Credit wallet for user ad4b16c4 (order 9404cc91)
SELECT public.credit_wallet(
  'ad4b16c4-7903-4a6b-a616-e2bb9a1421f4'::uuid,
  500.00,
  'Depósito via PIX (correção manual - pagamento não creditado)',
  '9404cc91-5f37-4914-8453-ea3361b11b96'
);
