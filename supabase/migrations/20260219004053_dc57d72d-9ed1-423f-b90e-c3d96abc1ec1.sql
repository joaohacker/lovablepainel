
-- Reverse the two incorrect R$196 refunds for user b5501c63
-- Remove the refund transactions
DELETE FROM public.wallet_transactions 
WHERE id IN ('bb43d6fc-1fd9-4e98-9158-4422dc8e0660', '612674b6-9fdc-4eef-8fa4-bddd56b7a022');

-- Debit R$392 from wallet
UPDATE public.wallets 
SET balance = balance - 392.00, updated_at = now()
WHERE id = 'f6163529-039e-4936-8c30-abb29715d9c2';
