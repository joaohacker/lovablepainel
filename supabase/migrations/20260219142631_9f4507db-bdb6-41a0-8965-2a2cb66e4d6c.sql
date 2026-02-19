
-- Restore credits_used to match the original reservation values
-- (the new getRealRemaining ignores credits_used, using actual delivery instead)
-- Token 933e56ec: had 200 reserved in waiting_invite
UPDATE public.client_tokens SET credits_used = 200 
WHERE id = '3f982fea-09fc-48dc-99e6-fc35952057e0';

-- Token 5c8e858: had 200 reserved in waiting_invite  
UPDATE public.client_tokens SET credits_used = 200 
WHERE id = 'fcd1f645-7011-4c4a-a814-b939924c3645';

-- Token f302818: had 50 reserved
UPDATE public.client_tokens SET credits_used = 50 
WHERE id = 'dc35bb12-a282-4cd7-b307-8d35012783d7';
