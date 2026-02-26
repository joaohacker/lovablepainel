-- Enable realtime for fraud_attempts and balance_audit_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.fraud_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.balance_audit_log;