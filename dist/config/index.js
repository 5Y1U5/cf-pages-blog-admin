/**
 * サイト固有の設定。
 *
 * このモジュールは Cloudflare の型（D1Database / R2Bucket 等）を一切参照しない。
 * 管理画面 UI（ブラウザ側）と Pages Functions（Workers 側）の両方から import されるため、
 * どちらか一方でしか成立しない型が混ざると、もう一方のビルドが壊れるためである。
 * バインディングの型は ./config/env に分けてある。
 */
/**
 * 記事の作成・保存・公開・画像アップロード・カテゴリ追加ができるロール。
 * サーバー側ハンドラの RBAC と同じ並びにしてあり、片方だけ変えてはいけない。
 * `client_viewer` は閲覧専用で、これらの操作はすべて 403 になる。
 */
export const CONTENT_EDITOR_ROLES = ["admin", "client_publisher"];
/**
 * 編集操作のボタンを出してよいかを判定する。
 *
 * `role` が null（`/api/admin/me` の応答待ち、または取得に失敗した状態）のあいだは
 * true を返す。読み込みのたびに全ボタンが一瞬押せなくなるのを避けるためで、
 * 権限の最終判断はサーバー側の RBAC が持つ。
 */
export function canEditContent(role) {
    return role === null || CONTENT_EDITOR_ROLES.includes(role);
}
export const DEFAULT_BRAND_LABEL = "BLOG ADMIN";
const DEFAULT_CONTENT = {
    postsDir: "content/posts",
    heroImageKey: "heroImage",
    defaultHeroImage: null,
    categoriesJsonPath: "content/blog-categories.json",
};
const DEFAULT_CATEGORY = {
    defaultSlug: "news",
    defaultLabel: "お知らせ",
    preferredSlugs: ["news"],
};
const DEFAULT_PUBLISH = {
    requiredFields: ["title", "body"],
    timezoneOffsetMinutes: 540,
    blockFutureDate: true,
    publicPathPrefix: "/blog",
};
const DEFAULT_GITHUB = {
    owner: "",
    repo: "",
    branch: "main",
};
const DEFAULT_PERMISSIONS = {
    deletePost: ["admin"],
};
/**
 * 設定を組み立てる。必須3項目以外は既定値で埋まる。
 * 設定項目が増えたときの追従漏れは、導入側の `tsc --noEmit` が検出する。
 */
export function defineBlogAdminConfig(input) {
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
export const SERVER_ASSIGNED_FIELDS = ["slug"];
/** 画面側で未入力を判定する項目。サーバーが自動で埋めるものを除いた `requiredFields`。 */
export function clientPublishRequirements(config) {
    return config.publish.requiredFields.filter((field) => !SERVER_ASSIGNED_FIELDS.includes(field));
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
export function resolveDefaultCategory(config, categories) {
    const bySlug = (slug) => categories.find((category) => category.slug === slug) ?? null;
    for (const slug of config.category.preferredSlugs) {
        const preferred = bySlug(slug);
        if (preferred)
            return preferred;
    }
    return bySlug(config.category.defaultSlug) ?? categories[0] ?? null;
}
/** 記事ファイルのパスを組み立てる（`postsDir/<slug>.md`）。 */
export function postFilePath(config, slug) {
    return `${config.content.postsDir.replace(/\/+$/, "")}/${slug}.md`;
}
/** 公開 URL を組み立てる（`publicPathPrefix/<slug>`）。 */
export function publicPostUrl(config, slug) {
    return `${config.publish.publicPathPrefix.replace(/\/+$/, "")}/${slug}`;
}
