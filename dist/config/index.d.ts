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
export declare const CONTENT_EDITOR_ROLES: AdminRole[];
/**
 * 編集操作のボタンを出してよいかを判定する。
 *
 * `role` が null（`/api/admin/me` の応答待ち、または取得に失敗した状態）のあいだは
 * true を返す。読み込みのたびに全ボタンが一瞬押せなくなるのを避けるためで、
 * 権限の最終判断はサーバー側の RBAC が持つ。
 */
export declare function canEditContent(role: AdminRole | null): boolean;
/** 公開時に入力を必須にできる項目。 */
export type PublishRequirement = "title" | "body" | "slug" | "date" | "category";
export interface BlogAdminContentConfig {
    /** 記事 Markdown の出力先ディレクトリ。末尾スラッシュなし。 */
    postsDir: string;
    /** frontmatter のアイキャッチキー。 */
    heroImageKey: string;
    /** 本文にも指定にも画像が無いときの既定アイキャッチ。null なら frontmatter に出さない。 */
    defaultHeroImage: string | null;
    /** カテゴリ一覧を書き出す JSON のパス。postsDir とは独立して指定する。 */
    categoriesJsonPath: string;
}
export interface BlogAdminCategoryConfig {
    /** カテゴリ未指定時に振る slug。 */
    defaultSlug: string;
    /** カテゴリ未指定時に振る表示名。 */
    defaultLabel: string;
    /**
     * 既定カテゴリの探索順。先に見つかったものを使い、無ければ登録済みの先頭、
     * それも無ければ defaultSlug / defaultLabel を新規に振る。
     */
    preferredSlugs: string[];
}
export interface BlogAdminPublishConfig {
    /** 公開に必須の項目。 */
    requiredFields: PublishRequirement[];
    /** 公開日の基準タイムゾーン（分）。日本標準時は 540。 */
    timezoneOffsetMinutes: number;
    /**
     * 未来日での公開を拒否するか。
     * 静的サイトを定期再ビルドしていない構成では、未来日で公開すると
     * 「公開は成功したのにページが出ない」サイレント失敗になるため既定は true。
     */
    blockFutureDate: boolean;
    /** 公開 URL の接頭辞。 */
    publicPathPrefix: string;
}
export interface BlogAdminGitHubConfig {
    /** 非機密。環境変数 GITHUB_OWNER が設定されていればそちらが優先される。 */
    owner: string;
    /** 非機密。環境変数 GITHUB_REPO が設定されていればそちらが優先される。 */
    repo: string;
    /** 非機密。環境変数 GITHUB_BRANCH が設定されていればそちらが優先される。 */
    branch: string;
}
export interface BlogAdminPermissionsConfig {
    /** 記事の物理削除を許可するロール。復元手段が無いため既定は管理者のみ。 */
    deletePost: AdminRole[];
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
};
export declare const DEFAULT_BRAND_LABEL = "BLOG ADMIN";
/**
 * 設定を組み立てる。必須3項目以外は既定値で埋まる。
 * 設定項目が増えたときの追従漏れは、導入側の `tsc --noEmit` が検出する。
 */
export declare function defineBlogAdminConfig(input: BlogAdminConfigInput): BlogAdminConfig;
/** 記事ファイルのパスを組み立てる（`postsDir/<slug>.md`）。 */
export declare function postFilePath(config: BlogAdminConfig, slug: string): string;
/** 公開 URL を組み立てる（`publicPathPrefix/<slug>`）。 */
export declare function publicPostUrl(config: BlogAdminConfig, slug: string): string;
export {};
