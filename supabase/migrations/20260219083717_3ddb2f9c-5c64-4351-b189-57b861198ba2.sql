
-- Atomic coupon usage increment (service role only, no public access)
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.coupons SET times_used = times_used + 1 WHERE id = p_coupon_id;
END;
$$;

-- Revoke public access
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage FROM PUBLIC, anon, authenticated;
