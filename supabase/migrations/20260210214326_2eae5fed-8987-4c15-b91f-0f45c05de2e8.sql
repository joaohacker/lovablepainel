-- Add client_ip column to generations table
ALTER TABLE public.generations ADD COLUMN client_ip text;

-- Add client_ip column to token_usages table
ALTER TABLE public.token_usages ADD COLUMN client_ip text;