-- Block anon access to coupons table
CREATE POLICY "Block anon read coupons"
ON public.coupons FOR SELECT TO anon
USING (false);