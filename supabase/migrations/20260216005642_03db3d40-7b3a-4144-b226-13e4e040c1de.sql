-- Remove referências e depois os tokens

-- 1. Desvincular orders
UPDATE public.orders SET token_id = NULL WHERE token_id IN ('0220d4cd-f427-45aa-84fa-be91e7bf1e65', '9bfe7eba-3468-47b8-86ba-ac884623bad0');

-- 2. Limpar token_usages
DELETE FROM public.token_usages WHERE token_id IN ('0220d4cd-f427-45aa-84fa-be91e7bf1e65', '9bfe7eba-3468-47b8-86ba-ac884623bad0');

-- 3. Limpar token_accounts
DELETE FROM public.token_accounts WHERE token_id IN ('0220d4cd-f427-45aa-84fa-be91e7bf1e65', '9bfe7eba-3468-47b8-86ba-ac884623bad0');

-- 4. Limpar generations
DELETE FROM public.generations WHERE token_id IN ('0220d4cd-f427-45aa-84fa-be91e7bf1e65', '9bfe7eba-3468-47b8-86ba-ac884623bad0');

-- 5. Excluir os tokens
DELETE FROM public.tokens WHERE id IN ('0220d4cd-f427-45aa-84fa-be91e7bf1e65', '9bfe7eba-3468-47b8-86ba-ac884623bad0');