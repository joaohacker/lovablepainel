
-- CRITICAL: Revoke public access to wallet functions
-- These should ONLY be callable by service_role (edge functions)
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, integer, text, text) FROM authenticated;

-- Also lock down reserve_credits (used by token flow)
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, text, text, integer, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, text, text, integer, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, text, text, integer, text, text, text, boolean) FROM authenticated;

-- has_role needs to stay accessible (used by RLS policies)
-- It's safe because it only reads, doesn't modify anything
