
-- 1) Bloquear leitura de balance_audit_log por usuários não-admin autenticados
CREATE POLICY "Block authenticated non-admin reads on balance_audit_log"
ON public.balance_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Bloquear leitura de fraud_attempts por usuários não-admin  
CREATE POLICY "Block authenticated non-admin reads on fraud_attempts"
ON public.fraud_attempts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3) Bloquear leitura de coupons por usuários não-admin
CREATE POLICY "Block authenticated non-admin reads on coupons"
ON public.coupons
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4) Índices de performance para tabelas de segurança
CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at ON public.rate_limits (created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_user_created ON public.fraud_attempts (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON public.webhook_events (received_at);
