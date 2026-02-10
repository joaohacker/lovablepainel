-- Block all public/anon access to tokens table explicitly
CREATE POLICY "Block public read access to tokens"
ON public.tokens
FOR SELECT
TO anon
USING (false);

-- Block all public/anon access to token_usages table  
CREATE POLICY "Block public read access to token_usages"
ON public.token_usages
FOR SELECT
TO anon
USING (false);

-- Block all public/anon access to generations table
CREATE POLICY "Block public read access to generations"
ON public.generations
FOR SELECT
TO anon
USING (false);