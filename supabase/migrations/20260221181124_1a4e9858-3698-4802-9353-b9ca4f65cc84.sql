
-- 1) Zerar todos os saldos negativos primeiro
UPDATE wallets SET balance = 0 WHERE balance < 0;

-- 2) Adicionar constraint física - IMPOSSÍVEL ter saldo negativo
ALTER TABLE wallets ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0);
