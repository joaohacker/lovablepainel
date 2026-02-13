
-- Add warning_message column to tokens
ALTER TABLE public.tokens ADD COLUMN warning_message text DEFAULT NULL;

-- Set warning for Wesley's token (cliente112)
UPDATE public.tokens 
SET warning_message = '⚠️ Sua workspace parece estar cheia. Remova membros extras para que os créditos sejam entregues corretamente.'
WHERE id = '0756fda0-3bdb-41c6-8d43-89fdc4301d50';
