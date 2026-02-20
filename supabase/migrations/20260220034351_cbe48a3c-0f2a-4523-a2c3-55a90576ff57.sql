
-- REVERT: Remove the 2 incorrect R$500 credits that were applied to non-real payments
-- Debit R$500 from user ac9baa3e
SELECT public.debit_wallet(
  'ac9baa3e-15f5-45c1-a083-0105b60d0240'::uuid,
  500.00,
  0,
  'Reversão - crédito aplicado incorretamente (ordem não paga de fato)',
  'revert_26d52280'
);

-- Debit R$500 from user ad4b16c4
SELECT public.debit_wallet(
  'ad4b16c4-7903-4a6b-a616-e2bb9a1421f4'::uuid,
  500.00,
  0,
  'Reversão - crédito aplicado incorretamente (ordem não paga de fato)',
  'revert_9404cc91'
);

-- Reset these orders back to pending since they were never actually paid
UPDATE orders 
SET status = 'pending', paid_at = NULL 
WHERE id IN ('26d52280-0c08-470f-8c44-5c693b4015cb', '9404cc91-5f37-4914-8453-ea3361b11b96');
