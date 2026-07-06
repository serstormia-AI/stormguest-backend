-- Conversation mode: 'bot' (Julia/Pedro responds) or 'human' (staff takes over)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS mode text DEFAULT 'bot';
