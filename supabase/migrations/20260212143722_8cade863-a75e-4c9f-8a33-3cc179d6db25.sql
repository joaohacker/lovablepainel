-- Cancel all active generations without deducting credits
UPDATE generations SET status = 'cancelled', credits_earned = 0 WHERE status IN ('creating', 'queued', 'waiting_invite', 'running', 'active', 'pending');

-- Cancel matching token_usages
UPDATE token_usages SET status = 'cancelled', credits_earned = 0, completed_at = now() WHERE status IN ('active', 'running', 'pending');