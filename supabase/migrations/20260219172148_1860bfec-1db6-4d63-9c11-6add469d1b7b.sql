
-- 1) Settle the stuck generation
UPDATE generations 
SET status = 'cancelled', 
    settled_at = now(), 
    credits_earned = 0,
    error_message = 'Cancelado manualmente - cliente não conseguiu convidar pelo celular'
WHERE id = 'f9713c68-f233-499a-9ef5-8c538ea3af8d' AND settled_at IS NULL;

-- 2) Refund 500 credits back to the token
UPDATE client_tokens 
SET credits_used = GREATEST(credits_used - 500, 0),
    is_active = true
WHERE id = '700fb388-bc8c-49c0-9875-1cbdbac8b395';
