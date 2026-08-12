/**
 * サイト固有の設定。
 *
 * このモジュールは Cloudflare の型（D1Database / R2Bucket 等）を一切参照しない。
 * 管理画面 UI（ブラウザ側）と Pages Functions（Workers 側）の両方から import されるため、
 * どちらか一方でしか成立しない型が混ざると、もう一方のビルドが壊れるためである。
 * バインディングの型は ./config/env に分けてある。
 */
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
/** 記事ファイルのパスを組み立てる（`postsDir/<slug>.md`）。 */
export function postFilePath(config, slug) {
    return `${config.content.postsDir.replace(/\/+$/, "")}/${slug}.md`;
}
/** 公開 URL を組み立てる（`publicPathPrefix/<slug>`）。 */
export function publicPostUrl(config, slug) {
    return `${config.publish.publicPathPrefix.replace(/\/+$/, "")}/${slug}`;
}
