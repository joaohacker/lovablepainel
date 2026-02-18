
-- =============================================
-- FIX: Remove dangerous "Service role" policies
-- Service role ALREADY bypasses RLS, so these
-- policies only create security holes for
-- authenticated users.
-- =============================================

-- 1. WALLETS - Remove the policy that lets ANY user UPDATE/INSERT/DELETE wallets
DROP POLICY IF EXISTS "Service role can manage wallets" ON public.wallets;

-- Add proper restrictive policies: users can ONLY view their own wallet, nothing else
-- (credit_wallet and debit_wallet functions use SECURITY DEFINER, so they bypass RLS)

-- 2. WALLET_TRANSACTIONS - Remove the policy that lets ANY user INSERT fake transactions
DROP POLICY IF EXISTS "Service role can manage transactions" ON public.wallet_transactions;

-- Users can only VIEW their own transactions (already exists), no INSERT/UPDATE/DELETE

-- 3. ORDERS - Remove dangerous insert/update policies
DROP POLICY IF EXISTS "Service role can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;

-- 4. GENERATIONS - Remove dangerous insert/update policies  
DROP POLICY IF EXISTS "Service role can insert generation" ON public.generations;
DROP POLICY IF EXISTS "Service role can update generation" ON public.generations;

-- 5. TOKEN_USAGES - Remove dangerous insert/update policies
DROP POLICY IF EXISTS "Service role can insert usage" ON public.token_usages;
DROP POLICY IF EXISTS "Service role can update usage" ON public.token_usages;

-- 6. TOKEN_ACCOUNTS - Remove dangerous "service role" ALL policy
DROP POLICY IF EXISTS "Service role can manage token_accounts" ON public.token_accounts;
