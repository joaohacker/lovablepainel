
UPDATE wallets SET balance = balance + 150, updated_at = now() WHERE user_id = '795013a3-5264-43a6-9735-5db8b93cb3ae';

INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id)
VALUES ('0203cc64-2592-4abf-9a83-aa6fba9598a8', 'deposit', 150, 'Crédito manual admin', NULL);
