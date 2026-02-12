-- Reset daily credits: cancel all of today's completed/running generations so daily limit is freed
UPDATE public.generations 
SET credits_earned = 0, status = 'cancelled' 
WHERE status IN ('completed', 'running') 
AND created_at >= date_trunc('day', now());

-- Also reset token_usages for today
UPDATE public.token_usages 
SET credits_earned = 0, status = 'cancelled', completed_at = now() 
WHERE status IN ('completed', 'running', 'active') 
AND created_at >= date_trunc('day', now());