
-- Fix overcharged client tokens: reset credits_used to match actually delivered credits

-- Token 933e56ec: credits_used=200 but 0 delivered → reset to 0
UPDATE public.client_tokens SET credits_used = 0 
WHERE id = '3f982fea-09fc-48dc-99e6-fc35952057e0' AND credits_used = 200;

-- Token 5c8e858: credits_used=200 but 0 delivered → reset to 0
UPDATE public.client_tokens SET credits_used = 0 
WHERE id = 'fcd1f645-7011-4c4a-a814-b939924c3645' AND credits_used = 200;

-- Token f302818: credits_used=50 but 0 delivered → reset to 0
UPDATE public.client_tokens SET credits_used = 0 
WHERE id = 'dc35bb12-a282-4cd7-b307-8d35012783d7' AND credits_used = 50;
