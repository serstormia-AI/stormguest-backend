-- Migration 009: add auth_user_id to users table
-- Allows direct Supabase Auth user lookup without listUsers(500)

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE INDEX IF NOT EXISTS users_auth_user_id_idx ON users(auth_user_id);
