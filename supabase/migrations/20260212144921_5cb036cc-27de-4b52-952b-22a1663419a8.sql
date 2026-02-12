-- Cancel ALL remaining active generations (including 'allocating' status that was missed)
UPDATE generations 
SET status = 'cancelled', credits_earned = 0 
WHERE status NOT IN ('completed', 'cancelled', 'error', 'expired');

-- Cancel ALL remaining active token_usages
UPDATE token_usages 
SET status = 'cancelled', credits_earned = 0, completed_at = now() 
WHERE status NOT IN ('completed', 'cancelled', 'error', 'expired');