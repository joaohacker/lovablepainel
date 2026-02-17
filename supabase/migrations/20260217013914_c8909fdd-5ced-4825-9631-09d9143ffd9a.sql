-- Cancel old waiting_invite generations (>5 min)
UPDATE public.generations 
SET status = 'cancelled', 
    error_message = 'Cancelado automaticamente - aguardando convite por mais de 5 minutos',
    updated_at = NOW()
WHERE status = 'waiting_invite' 
  AND created_at < NOW() - INTERVAL '5 minutes';

-- Also mark corresponding token_usages as cancelled
UPDATE public.token_usages 
SET status = 'cancelled', 
    completed_at = NOW()
WHERE farm_id IN (
  'e3d02ee0-b3e1-4bcc-be27-d31556b69f75',
  '055a3a5b-0da9-4b64-b0cb-86de62837422',
  '1dcacd69-9ba6-4675-ba2a-4897415cae05',
  '4de7d01f-3c92-443d-926f-e2d9d763a53d',
  '193c172c-9623-46f7-9f23-526fd3baf872'
) AND status = 'active';