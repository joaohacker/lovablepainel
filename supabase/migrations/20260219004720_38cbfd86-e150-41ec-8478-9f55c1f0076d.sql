-- Cancel 3 stuck generations for ehdecasashop@gmail.com
UPDATE public.generations 
SET status = 'cancelled', settled_at = now(), updated_at = now()
WHERE id IN (
  '857cdf82-f0d1-4394-8768-5a842eef5506',
  '351d56e4-5d48-4cad-9171-c495da88a8f7',
  'f4722e97-7985-4771-b30b-94b860cfedcf'
);

-- Refund: 5 credits = R$0.18, 100 credits = R$3.50, 100 credits = R$3.50 = R$7.18
-- But the expired one (100 credits) was already refunded by auto-refund earlier
-- Let's only refund the 2 waiting_invite ones (5 + 100 = R$3.68)
SELECT public.credit_wallet(
  '795013a3-5264-43a6-9735-5db8b93cb3ae'::uuid,
  3.68,
  'Reembolso manual - 2 gerações waiting_invite canceladas (105 créditos)',
  NULL
);
