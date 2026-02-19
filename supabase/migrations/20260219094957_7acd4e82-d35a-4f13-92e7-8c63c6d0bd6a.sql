
-- Add source/platform tracking column to orders
ALTER TABLE public.orders ADD COLUMN source text DEFAULT 'direto';
