-- 新規導入時にだけ使う初期スキーマ。
-- 二重波括弧のプレースホルダは `cf-pages-blog-admin init` が設定値で置換する。
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client_publisher', 'client_viewer')),
  client_id TEXT NOT NULL DEFAULT '{{clientId}}',
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '{{clientId}}',
  code TEXT NOT NULL,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (client_id, slug),
  UNIQUE (client_id, code)
);

CREATE TABLE IF NOT EXISTS post_drafts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '{{clientId}}',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  category_label TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  hero_image_key TEXT,
  hero_image_alt TEXT,
  author TEXT NOT NULL DEFAULT '{{defaultAuthor}}',
  author_role TEXT,
  body_markdown TEXT NOT NULL,
  og_description TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  faq_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'publishing', 'published', 'archived')),
  source_path TEXT,
  source_hash TEXT,
  published_url TEXT,
  published_commit_sha TEXT,
  last_published_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (client_id, slug)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '{{clientId}}',
  post_id TEXT,
  r2_key TEXT NOT NULL,
  public_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES post_drafts(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_post_drafts_client_status ON post_drafts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_post_id ON assets(post_id);
