
-- Table linking auth users to specific tokens (1:1)
CREATE TABLE public.token_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_accounts_token_unique UNIQUE (token_id),
  CONSTRAINT token_accounts_user_unique UNIQUE (user_id)
);

ALTER TABLE public.token_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their own link
CREATE POLICY "Users can view own token_account"
  ON public.token_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- Service role manages all
CREATE POLICY "Service role can manage token_accounts"
  ON public.token_accounts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Admins can manage
CREATE POLICY "Admins can manage token_accounts"
  ON public.token_accounts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
