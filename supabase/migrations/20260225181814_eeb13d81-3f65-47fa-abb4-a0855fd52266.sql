
-- CRITICAL SECURITY: Revoke EXECUTE on sensitive financial RPCs from public roles
-- Only service_role (used by edge functions) should be able to call these

REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, text, text, integer, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, text, text, integer, text, text, text, boolean) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.refund_client_token_credits(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_client_token_credits(uuid, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.use_client_token_credits(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.use_client_token_credits(uuid, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.reconcile_balances() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_balances() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.auto_refund_cron() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_refund_cron() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.daily_reconciliation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.daily_reconciliation() FROM authenticated;

-- Keep these accessible (they are read-only safety checks):
-- has_role, is_user_banned, is_ip_banned, check_rate_limit, calc_credit_price
