-- 操作の記録。誰がいつ何をしたかを残す。
-- 侵入や誤操作のあとに「何が起きたか」を追えるようにするための土台で、
-- 記事の中身そのものは残さない（本文は post_drafts と GitHub のコミット履歴にある）。
--
-- 記録に失敗しても本処理は止めない設計なので、このテーブルが無いサイトでも管理画面は動く。
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_client_time
  ON audit_logs(client_id, created_at DESC);
