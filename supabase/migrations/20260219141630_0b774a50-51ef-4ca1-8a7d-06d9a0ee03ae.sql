
SELECT cron.schedule(
  'reconcile-payments-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lhdrgrsugdahfhfovnjr.supabase.co/functions/v1/reconcile-payments',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZHJncnN1Z2RhaGZoZm92bmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjY1NzUsImV4cCI6MjA4NjIwMjU3NX0.m3htoagtYKCS7g1hh7ksrl6h_a6hi-mNKGYYLhq21to"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
