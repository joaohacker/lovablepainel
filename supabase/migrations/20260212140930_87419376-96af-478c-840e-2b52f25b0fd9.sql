-- Reset: increase daily limit for token 481e... to allow more usage today
UPDATE tokens SET daily_limit = 12000 WHERE id = 'b5dabd64-be86-464b-bdd5-a715b5b8d3c0';

-- Unblock token 29b6...
UPDATE tokens SET is_active = true WHERE id = '4d2011f9-3b65-41de-9082-1792eb8b2ae4';