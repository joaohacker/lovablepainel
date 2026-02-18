
-- Zero out fraudulent wallet balances
UPDATE public.wallets SET balance = 0 
WHERE user_id IN (
  '974fc04c-883f-4c3a-b99b-f7f5650eb9bf',  -- test-recovery-probe@proton.me (R$1.000.000)
  'b617025b-6278-4988-87cb-1844c4edf62e',  -- manual.hack.i4ydgo@lovable.tmp (R$999.999)
  '3a642c8d-495b-4138-95fb-828027af952c'   -- test.1fvwut@lovable.tmp (R$50)
);
