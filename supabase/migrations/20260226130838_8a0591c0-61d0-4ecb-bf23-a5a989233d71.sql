
-- Remove redundant policies on balance_audit_log
DROP POLICY IF EXISTS "Block authenticated non-admin reads on balance_audit_log" ON public.balance_audit_log;
DROP POLICY IF EXISTS "Block anon access balance_audit_log" ON public.balance_audit_log;
