
-- Corrigir saldos inflados: recalcular saldo correto para cada wallet afetada
-- Lógica: saldo_correto = sum(depósitos únicos por reference_id) + sum(depósitos sem reference_id) - sum(débitos)

-- Primeiro, recalcular e atualizar o saldo de cada carteira afetada
DO $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_correct_balance numeric;
  v_current_balance numeric;
  v_diff numeric;
  affected_users uuid[] := ARRAY[
    '1914edff-84e7-4bab-9529-19364b729463'::uuid,
    'd9a34521-6c55-41f2-a7e5-0fc5a676b282'::uuid,
    'e115546a-fdbc-4458-a5ca-24c1c2a55d18'::uuid,
    'b3c9cdd7-b231-4834-8f9f-65ea3111ab79'::uuid,
    '4290c46d-e41a-4d40-8350-ebe4635beb3f'::uuid,
    'daaa7ed4-421b-4cd0-a6dc-eb9e9fef90aa'::uuid,
    'd4d80fd5-29bc-48b9-b979-11bfbd0123ae'::uuid,
    'abdf2ec1-576a-40d1-9883-8bef430a2b01'::uuid
  ];
BEGIN
  FOREACH v_user_id IN ARRAY affected_users LOOP
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM wallets WHERE user_id = v_user_id;
    
    IF v_wallet_id IS NULL THEN CONTINUE; END IF;
    
    -- Calculate correct balance: 
    -- unique deposits (by reference_id) + deposits without reference_id - all debits
    SELECT COALESCE(
      (SELECT sum(amount) FROM (
        SELECT DISTINCT ON (reference_id) amount
        FROM wallet_transactions
        WHERE wallet_id = v_wallet_id AND type = 'deposit' AND reference_id IS NOT NULL
        ORDER BY reference_id, created_at ASC
      ) unique_deposits), 0
    ) + COALESCE(
      (SELECT sum(amount) FROM wallet_transactions
       WHERE wallet_id = v_wallet_id AND type = 'deposit' AND reference_id IS NULL), 0
    ) - COALESCE(
      (SELECT sum(amount) FROM wallet_transactions
       WHERE wallet_id = v_wallet_id AND type = 'debit'), 0
    ) INTO v_correct_balance;
    
    v_diff := v_current_balance - v_correct_balance;
    
    IF v_diff > 0.01 THEN
      -- Corrigir saldo
      UPDATE wallets SET balance = v_correct_balance WHERE id = v_wallet_id;
      
      -- Registrar a correção
      INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id)
      VALUES (v_wallet_id, 'debit', v_diff, 'Correção: remoção de créditos duplicados por bug de reconciliação', 'fix-duplicate-credits');
      
      RAISE NOTICE 'User % corrected: % -> % (diff: %)', v_user_id, v_current_balance, v_correct_balance, v_diff;
    END IF;
  END LOOP;
END $$;

-- Limpar transações duplicadas (manter apenas a primeira de cada reference_id)
DELETE FROM wallet_transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id, reference_id, type,
      ROW_NUMBER() OVER (PARTITION BY wallet_id, reference_id, type ORDER BY created_at ASC) as rn
    FROM wallet_transactions
    WHERE type = 'deposit'
    AND reference_id IS NOT NULL
    AND created_at > now() - interval '48 hours'
  ) ranked
  WHERE rn > 1
);
