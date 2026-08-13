/**
 * サイト固有の設定。
 *
 * このモジュールは Cloudflare の型（D1Database / R2Bucket 等）を一切参照しない。
 * 管理画面 UI（ブラウザ側）と Pages Functions（Workers 側）の両方から import されるため、
 * どちらか一方でしか成立しない型が混ざると、もう一方のビルドが壊れるためである。
 * バインディングの型は ./config/env に分けてある。
 */

/** 管理画面のロール。値は D1 の users.role の CHECK 制約と一致させること。 */
export type AdminRole = "admin" | "client_publisher" | "client_viewer";

/**
 * 記事の作成・保存・公開・画像アップロード・カテゴリ追加ができるロール。
 * サーバー側ハンドラの RBAC と同じ並びにしてあり、片方だけ変えてはいけない。
 * `client_viewer` は閲覧専用で、これらの操作はすべて 403 になる。
 */
export const CONTENT_EDITOR_ROLES: AdminRole[] = ["admin", "client_publisher"];

/**
 * 編集操作のボタンを出してよいかを判定する。
 *
 * `role` が null（`/api/admin/me` の応答待ち、または取得に失敗した状態）のあいだは
 * true を返す。読み込みのたびに全ボタンが一瞬押せなくなるのを避けるためで、
 * 権限の最終判断はサーバー側の RBAC が持つ。
 */
export function canEditContent(role: AdminRole | null): boolean {
  return role === null || CONTENT_EDITOR_ROLES.includes(role);
}

/** 公開時に入力を必須にできる項目。 */
export type PublishRequirement = "title" | "body" | "slug" | "date" | "category";

/**
 * 記事の出し先の区分。1つのサイトで「お知らせ」と「ブログ」のように
 * 置き場所と URL が分かれる場合に使う。
 */
export interface BlogAdminPostType {
  /** D1 の post_type 列に入る値。 */
  value: string;
  /** 画面に出す名前。 */
  label: string;
  /** 公開 URL の接頭辞。`publish.publicPathPrefix` より優先される。 */
  publicPathPrefix: string;
}

export interface BlogAdminContentConfig {
  /** 記事 Markdown の出力先ディレクトリ。末尾スラッシュなし。 */
  postsDir: string;
  /** frontmatter のアイキャッチキー。 */
  heroImageKey: string;
  /** 本文にも指定にも画像が無いときの既定アイキャッチ。null なら frontmatter に出さない。 */
  defaultHeroImage: string | null;
  /** カテゴリ一覧を書き出す JSON のパス。postsDir とは独立して指定する。 */
  categoriesJsonPath: string;
  /**
   * 記事の区分。空なら区分なし（従来どおり単一の記事一覧として扱う）。
   * 指定すると編集画面に区分の選択が出て、公開 URL も区分ごとの接頭辞になる。
   * 先頭の要素が新規記事の既定値。
   */
  postTypes: BlogAdminPostType[];
}

export interface BlogAdminCategoryConfig {
  /** カテゴリ未指定時に振る slug。 */
  defaultSlug: string;
  /** カテゴリ未指定時に振る表示名。 */
  defaultLabel: string;
  /**
   * 既定カテゴリの探索順。先に見つかったものを使い、無ければ defaultSlug、
   * それも無ければ登録順の先頭、登録が1件も無ければ defaultSlug / defaultLabel を新規に振る。
   */
  preferredSlugs: string[];
}

export interface BlogAdminPublishConfig {
  /**
   * 公開に必須の項目。サーバー側の公開処理がこの並びで検証する。
   * 画面側の未入力判定からは、保存時にサーバーが自動採番する項目（`slug`）を除く。
   * 詳しくは `SERVER_ASSIGNED_FIELDS` を参照。
   */
  requiredFields: PublishRequirement[];
  /** 公開日の基準タイムゾーン（分）。日本標準時は 540。 */
  timezoneOffsetMinutes: number;
  /**
   * 未来日での公開を拒否するか。
   * 静的サイトを定期再ビルドしていない構成では、未来日で公開すると
   * 「公開は成功したのにページが出ない」サイレント失敗になるため既定は true。
   */
  blockFutureDate: boolean;
  /**
   * 公開 URL の接頭辞。公開後の URL は `<publicPathPrefix>/<slug>` になる。
   * 実際のサイトの記事 URL に合わせること。ここがずれると、公開完了の案内や
   * 記事削除の確認ダイアログに、存在しない URL が出る。
   */
  publicPathPrefix: string;
}

export interface BlogAdminGitHubConfig {
  /** 非機密。環境変数 GITHUB_OWNER が設定されていればそちらが優先される。 */
  owner: string;
  /** 非機密。環境変数 GITHUB_REPO が設定されていればそちらが優先される。 */
  repo: string;
  /** 非機密。環境変数 GITHUB_BRANCH が設定されていればそちらが優先される。 */
  branch: string;
  /**
   * 公開時の GitHub コミットをどう扱うか。
   *
   * - `"source"`（既定）… コミットした Markdown が記事の実体。失敗したら公開しない
   * - `"backup"` … 記事の実体は D1 にあり、コミットは控え。失敗しても公開は成立し、
   *   応答に `warning` が入る
   *
   * 静的サイトジェネレータが Markdown を読んで公開ページを作る構成なら `"source"`。
   * 公開ページが D1 を直接読む（SSR）構成なら `"backup"`。
   * SSR 構成で `"source"` のままにすると、GitHub が一時的に落ちただけで公開できなくなる。
   */
  mode: "source" | "backup";
}

export interface BlogAdminPermissionsConfig {
  /** 記事の物理削除を許可するロール。復元手段が無いため既定は管理者のみ。 */
  deletePost: AdminRole[];
}

/**
 * ブラウザを介さない書き込み（記事生成の自動化など）のための経路。
 * Cookie セッションを張れないので `Authorization: Bearer <token>` で通す。
 */
export interface BlogAdminAutomationConfig {
  /**
   * トークンを入れる環境変数名。**既定は `null` で、この経路は開かない。**
   * 名前を指定しても、その環境変数が未設定なら不成立のまま。
   */
  tokenEnvVar: string | null;
  /** トークンが一致したときに与えるロール。 */
  role: AdminRole;
  /** 監査列（`created_by` / `updated_by`）に残る利用者。 */
  user: { id: string; email: string; name: string };
}

export interface BlogAdminConfig {
  /**
   * D1 の client_id 列に入る値。既存データと必ず一致させること。
   * 間違えると「記事が1件も出てこない」形で壊れる（エラーにはならない）。
   */
  clientId: string;

  /** frontmatter の author と post_drafts.author の既定値。 */
  defaultAuthor: string;

  /**
   * セッション Cookie 名。__Host- 接頭辞つきにすること
   * （Secure / Path=/ / Domain 無し が前提）。
   */
  sessionCookieName: `__Host-${string}`;

  /** ログイン画面の見出しに出す短いラベル。 */
  brandLabel: string;

  content: BlogAdminContentConfig;
  category: BlogAdminCategoryConfig;
  publish: BlogAdminPublishConfig;
  github: BlogAdminGitHubConfig;
  permissions: BlogAdminPermissionsConfig;
  automation: BlogAdminAutomationConfig;
}

/** 既定値を持てない項目。間違えると静かに壊れるため、必ず明示させる。 */
type RequiredConfigKeys = "clientId" | "defaultAuthor" | "sessionCookieName";

export type BlogAdminConfigInput = Pick<BlogAdminConfig, RequiredConfigKeys> & {
  brandLabel?: string;
  content?: Partial<BlogAdminContentConfig>;
  category?: Partial<BlogAdminCategoryConfig>;
  publish?: Partial<BlogAdminPublishConfig>;
  github?: Partial<BlogAdminGitHubConfig>;
  permissions?: Partial<BlogAdminPermissionsConfig>;
  automation?: Partial<BlogAdminAutomationConfig>;
};

export const DEFAULT_BRAND_LABEL = "BLOG ADMIN";

const DEFAULT_CONTENT: BlogAdminContentConfig = {
  postsDir: "content/posts",
  heroImageKey: "heroImage",
  defaultHeroImage: null,
  categoriesJsonPath: "content/blog-categories.json",
  postTypes: [],
};

const DEFAULT_CATEGORY: BlogAdminCategoryConfig = {
  defaultSlug: "news",
  defaultLabel: "お知らせ",
  preferredSlugs: ["news"],
};

const DEFAULT_PUBLISH: BlogAdminPublishConfig = {
  requiredFields: ["title", "body"],
  timezoneOffsetMinutes: 540,
  blockFutureDate: true,
  publicPathPrefix: "/blog",
};

const DEFAULT_GITHUB: BlogAdminGitHubConfig = {
  owner: "",
  repo: "",
  branch: "main",
  mode: "source",
};

const DEFAULT_PERMISSIONS: BlogAdminPermissionsConfig = {
  deletePost: ["admin"],
};

// 既定では開かない経路。環境変数名を指定したサイトでだけ有効になる。
const DEFAULT_AUTOMATION: BlogAdminAutomationConfig = {
  tokenEnvVar: null,
  role: "client_publisher",
  user: { id: "automation", email: "", name: "Automation" },
};

/**
 * 設定を組み立てる。必須3項目以外は既定値で埋まる。
 * 設定項目が増えたときの追従漏れは、導入側の `tsc --noEmit` が検出する。
 */
export function defineBlogAdminConfig(input: BlogAdminConfigInput): BlogAdminConfig {
  return {
    clientId: input.clientId,
    defaultAuthor: input.defaultAuthor,
    sessionCookieName: input.sessionCookieName,
    brandLabel: input.brandLabel ?? DEFAULT_BRAND_LABEL,
    content: { ...DEFAULT_CONTENT, ...(input.content ?? {}) },
    category: { ...DEFAULT_CATEGORY, ...(input.category ?? {}) },
    publish: { ...DEFAULT_PUBLISH, ...(input.publish ?? {}) },
    github: { ...DEFAULT_GITHUB, ...(input.github ?? {}) },
    permissions: { ...DEFAULT_PERMISSIONS, ...(input.permissions ?? {}) },
    automation: {
      ...DEFAULT_AUTOMATION,
      ...(input.automation ?? {}),
      user: { ...DEFAULT_AUTOMATION.user, ...(input.automation?.user ?? {}) },
    },
  };
}

/**
 * 保存時にサーバーが自動で値を決める項目。
 *
 * `slug` は新規保存（POST /api/admin/posts）の時点でサーバーが必ず埋める。
 * タイトルから作れない（日本語のみ等）場合は `post-<日付>-<乱数>` を採番し、
 * 既存と衝突する場合は連番を付ける。したがってクライアントの入力欄が空でも、
 * DB に入る時点では必ず値がある。
 *
 * `requiredFields` にこれらが入っていても、画面側の未入力判定からは除外する。
 * 除外しないと、日本語タイトルの新規記事で公開ボタンが押せないまま詰む
 * （保存すれば埋まるのに、保存前は空なので未入力と判定されてしまう）。
 * サーバー側の検証はそのまま残るので、必須指定そのものは効いている。
 */
export const SERVER_ASSIGNED_FIELDS: PublishRequirement[] = ["slug"];

/** 画面側で未入力を判定する項目。サーバーが自動で埋めるものを除いた `requiredFields`。 */
export function clientPublishRequirements(
  config: BlogAdminConfig
): PublishRequirement[] {
  return config.publish.requiredFields.filter(
    (field) => !SERVER_ASSIGNED_FIELDS.includes(field)
  );
}

/**
 * 登録済みカテゴリから既定カテゴリを選ぶ。
 *
 * 探索順は `preferredSlugs` の並び → `defaultSlug` → 登録順の先頭。
 * 該当が無ければ null（呼び出し側が `defaultSlug` / `defaultLabel` で新規に振る）。
 *
 * 新規記事の初期選択（画面）と公開時の自動補完（サーバー）が食い違わないよう、
 * 判定はこの1か所に置く。
 */
export function resolveDefaultCategory<T extends { slug: string }>(
  config: BlogAdminConfig,
  categories: readonly T[]
): T | null {
  const bySlug = (slug: string): T | null =>
    categories.find((category) => category.slug === slug) ?? null;

  for (const slug of config.category.preferredSlugs) {
    const preferred = bySlug(slug);
    if (preferred) return preferred;
  }
  return bySlug(config.category.defaultSlug) ?? categories[0] ?? null;
}

/** 記事ファイルのパスを組み立てる（`postsDir/<slug>.md`）。 */
export function postFilePath(config: BlogAdminConfig, slug: string): string {
  return `${config.content.postsDir.replace(/\/+$/, "")}/${slug}.md`;
}

/** 公開 URL を組み立てる（`publicPathPrefix/<slug>`）。 */
export function publicPostUrl(
  config: BlogAdminConfig,
  slug: string,
  postType?: string | null
): string {
  const prefix = resolvePostTypePrefix(config, postType);
  return `${prefix.replace(/\/+$/, "")}/${slug}`;
}

/** 区分が設定されていればその接頭辞、無ければ publish.publicPathPrefix。 */
export function resolvePostTypePrefix(
  config: BlogAdminConfig,
  postType?: string | null
): string {
  const types = config.content.postTypes;
  if (!types.length) return config.publish.publicPathPrefix;
  const matched = types.find((t) => t.value === postType) || types[0];
  return matched ? matched.publicPathPrefix : config.publish.publicPathPrefix;
}

/** 保存してよい区分か。区分を使っていないサイトでは常に空文字を返す。 */
export function normalizePostType(
  config: BlogAdminConfig,
  raw?: string | null
): string {
  const types = config.content.postTypes;
  if (!types.length) return "";
  const value = (raw || "").trim();
  const matched = types.find((t) => t.value === value);
  return matched ? matched.value : (types[0]?.value ?? "");
}
