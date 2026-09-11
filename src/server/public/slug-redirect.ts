import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";

/**
 * slug を変えた記事の旧 URL を、いまの公開 URL へ送るための公開側の部品。
 *
 * 管理画面（PUT /api/admin/posts/<id>）が slug を変えるとき、変更前の公開パスを
 * `post_redirects` に残す。ここはその表を引いて、旧パスへ来た人を新パスへ 301 で送る。
 *
 * 使い方（Pages Functions のサイト）: 記事の公開接頭辞の下に `_middleware.ts` を置く。
 *
 *   // functions/blog/_middleware.ts
 *   import { createSlugRedirectMiddleware } from "@5y1u5/cf-pages-blog-admin/server/public/slug-redirect";
 *   import { blogAdminConfig } from "../../blog-admin.config";
 *   export const onRequest = createSlugRedirectMiddleware(blogAdminConfig);
 *
 * Worker のサイト（Pages Functions を使わない構成）は `resolvePostRedirect` を fetch の先頭で呼ぶ。
 *
 * 転送表が無いサイト（migration 0008 未適用）では何もしない（`ctx.next()` に流す）。
 */

/** 末尾のスラッシュを落として、転送表の from_path と同じ形にする。 */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

/**
 * pathname が旧 URL なら、いまの公開パス（例 `/blog/new-slug`）を返す。該当しなければ null。
 *
 * 転送先は記事の `published_url` をそのまま使う。公開を取り下げた記事（published_url が NULL）や
 * 未公開の記事へは送らない（404 のままにする。取り下げた記事へ 301 で送ると行き先も 404 になる）。
 */
export async function resolvePostRedirect(
  db: D1Database,
  config: BlogAdminConfig,
  pathname: string
): Promise<string | null> {
  const fromPath = normalizePath(pathname);
  try {
    const row = await db
      .prepare(
        `SELECT p.published_url AS target
         FROM post_redirects r
         JOIN post_drafts p ON p.id = r.post_id AND p.client_id = r.client_id
         WHERE r.client_id = ? AND r.from_path = ?
           AND p.status IN ('published', 'publishing')
           AND p.published_url IS NOT NULL
         LIMIT 1`
      )
      .bind(config.clientId, fromPath)
      .first<{ target: string }>();
    if (!row?.target) return null;
    const target = normalizePath(row.target);
    return target === fromPath ? null : target;
  } catch {
    // 転送表が無い（migration 未適用）か D1 が引けない。転送は諦めて通常の応答に任せる。
    return null;
  }
}

/**
 * Pages Functions の中間処理。転送表に当たれば 301、外れれば次へ流す。
 *
 * 先に表を引いてから次へ流す（404 かどうかを見てから引く形にしない）。
 * SPA のサイトは `/* /index.html 200` で 404 が出ないため、404 を頼りにすると転送が効かない。
 */
export function createSlugRedirectMiddleware(
  config: BlogAdminConfig
): PagesFunction<BlogAdminEnv> {
  return async (ctx) => {
    const db = ctx.env.ADMIN_DB;
    if (!db) return ctx.next();
    const url = new URL(ctx.request.url);
    const target = await resolvePostRedirect(db, config, url.pathname);
    if (!target) return ctx.next();
    const location = new URL(target, url);
    location.search = url.search;
    return Response.redirect(location.toString(), 301);
  };
}
