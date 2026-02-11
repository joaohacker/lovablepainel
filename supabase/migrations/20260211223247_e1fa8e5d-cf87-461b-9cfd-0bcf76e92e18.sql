
-- Add cooldown_minutes column to tokens
ALTER TABLE public.tokens ADD COLUMN cooldown_minutes INTEGER DEFAULT 0;

-- Update existing tokens: daily_limit < 9999 → credits_per_use=1000, cooldown=10min
UPDATE public.tokens SET credits_per_use = 1000, cooldown_minutes = 10 WHERE daily_limit IS NOT NULL AND daily_limit < 9999;

-- Update existing tokens: daily_limit >= 10000 → credits_per_use=2000, cooldown=5min
UPDATE public.tokens SET credits_per_use = 2000, cooldown_minutes = 5 WHERE daily_limit IS NOT NULL AND daily_limit >= 10000;

-- Tokens without daily_limit keep their current values, cooldown=0 (no cooldown)
