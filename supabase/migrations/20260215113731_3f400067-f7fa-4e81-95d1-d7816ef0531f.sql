-- Fix stuck on-demand generations (one-time cleanup)
UPDATE public.generations 
SET status = 'expired', updated_at = now() 
WHERE token_id IS NULL 
  AND user_id IS NOT NULL 
  AND status IN ('waiting_invite', 'creating', 'queued') 
  AND created_at < now() - interval '1 hour';
