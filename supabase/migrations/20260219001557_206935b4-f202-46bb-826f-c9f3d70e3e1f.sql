
-- Add settled_at to track when a generation's wallet was settled (refund processed)
ALTER TABLE public.generations ADD COLUMN settled_at timestamp with time zone DEFAULT NULL;

-- Index for finding unsettled completed generations quickly
CREATE INDEX idx_generations_unsettled ON public.generations (user_id, status) WHERE settled_at IS NULL AND user_id IS NOT NULL;
