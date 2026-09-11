-- slug を変えた記事の、変更前の公開パス。
-- 管理画面から slug（URL の末尾）を変えられるようにしたため、公開済みの記事は旧 URL で
-- 検索結果やリンクから来る人が残る。旧パスを覚えておき、公開側の中間処理が新 URL へ 301 で送る。
--
-- 転送先は持たない。post_id で post_drafts を引き、そのときの published_url へ送る。
-- 何度 slug を変えても、どの旧パスからも 1 回で最新の URL に届く。
-- slug ではなく公開パスを持つのは、区分（/news と /blog）ごとに接頭辞が違うサイトで
-- 中間処理が接頭辞を解釈しなくて済むようにするため。
--
-- この表が無いサイトでも slug の変更自体は通る（転送だけ効かず、保存の応答で警告する）。
CREATE TABLE IF NOT EXISTS post_redirects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  from_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(client_id, from_path)
);

CREATE INDEX IF NOT EXISTS idx_post_redirects_post
  ON post_redirects(post_id);
