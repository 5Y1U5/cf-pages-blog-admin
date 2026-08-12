-- ユーザーの有効/無効フラグ。無効化されたユーザーはログイン・既存セッションとも拒否する。
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
