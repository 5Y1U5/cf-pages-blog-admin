-- 記事の区分。1つのサイトで「お知らせ」と「ブログ」のように出し先が分かれる構成のため。
-- 区分を使わないサイトでは常に空文字のままで、挙動は変わらない。
ALTER TABLE post_drafts ADD COLUMN post_type TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_post_drafts_client_type_status
  ON post_drafts(client_id, post_type, status);
