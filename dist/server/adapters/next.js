const METHOD_MAP = [
    ["onRequestGet", "GET"],
    ["onRequestPost", "POST"],
    ["onRequestPut", "PUT"],
    ["onRequestDelete", "DELETE"],
];
/**
 * Pages Functions 形式のハンドラ群を Route Handler の export 形へ変換する。
 *
 * ```ts
 * // app/api/admin/posts/route.ts
 * import { env } from "cloudflare:workers";
 * import { createPostsHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/index";
 * import { toRouteHandlers } from "@5y1u5/cf-pages-blog-admin/server/adapters/next";
 * import { blogAdminConfig } from "@/blog-admin.config";
 *
 * export const { GET, POST } = toRouteHandlers(createPostsHandlers(blogAdminConfig), () => env);
 * ```
 *
 * @param handlers `createXxxHandlers(config)` の戻り値
 * @param resolveEnv 実行時に env を返す関数。モジュール読み込み時点では
 *   バインディングが用意できていない環境があるため、値ではなく関数で受ける
 */
export function toRouteHandlers(handlers, resolveEnv) {
    const routes = {};
    for (const [pagesName, methodName] of METHOD_MAP) {
        const handler = handlers[pagesName];
        if (!handler)
            continue;
        routes[methodName] = async (request, context) => {
            const params = (await context?.params) || {};
            return handler({ request, env: resolveEnv(), params });
        };
    }
    return routes;
}
/**
 * バインディング名が既定と違う環境のために、env を差し替えて渡す。
 *
 * このパッケージは `ADMIN_DB` / `ADMIN_ASSETS` という名前でバインディングを探すが、
 * 既存サイトが別の名前（`DB` など）で運用していることがある。
 * バインディングを配り直すとサイトの他の部分が壊れるため、名前の対応だけをここで吸収する。
 *
 * ```ts
 * const getEnv = () => mapEnv(env, { ADMIN_DB: "DB", ADMIN_ASSETS: "BLOG_ASSETS" });
 * ```
 */
export function mapEnv(source, aliases) {
    // env は Proxy であることがあり、スプレッドで中身が取れない環境がある。
    // 参照されたキーだけを都度引く Proxy を返して、元の env の性質を壊さない。
    return new Proxy({}, {
        get(_target, key) {
            const alias = aliases[key];
            if (alias && source[alias] !== undefined)
                return source[alias];
            return source[key];
        },
        has(_target, key) {
            const alias = aliases[key];
            return (alias ? alias in source : false) || key in source;
        },
    });
}
