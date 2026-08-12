-- ログイン総当たり対策：失敗試行を記録し、一定時間内の失敗回数で一時ロックする。
-- 成功時は該当メールの記録を消す。古い記録はログイン処理中に随時掃除する。
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
  ON login_attempts(email, created_at);
