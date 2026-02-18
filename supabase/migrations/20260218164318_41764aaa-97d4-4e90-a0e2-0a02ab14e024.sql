
-- Credit R$15.00 to josiel.soares.oficial@gmail.com
UPDATE wallets SET balance = balance + 15.00, updated_at = now() WHERE user_id = 'ccc5694d-63ce-4478-a471-500fbf4e7e52';

INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id)
SELECT id, 'deposit', 15.00, 'Crédito manual admin', 'admin_manual_credit_20260218'
FROM wallets WHERE user_id = 'ccc5694d-63ce-4478-a471-500fbf4e7e52';
