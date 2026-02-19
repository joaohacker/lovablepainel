
-- Add coupon tracking to orders
ALTER TABLE public.orders ADD COLUMN coupon_id UUID DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC DEFAULT 0;
