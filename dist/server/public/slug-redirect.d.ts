import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
/**
 * pathname が旧 URL なら、いまの公開パス（例 `/blog/new-slug`）を返す。該当しなければ null。
 *
 * 転送先は記事の `published_url` をそのまま使う。公開を取り下げた記事（published_url が NULL）や
 * 未公開の記事へは送らない（404 のままにする。取り下げた記事へ 301 で送ると行き先も 404 になる）。
 */
export declare function resolvePostRedirect(db: D1Database, config: BlogAdminConfig, pathname: string): Promise<string | null>;
/**
 * Pages Functions の中間処理。転送表に当たれば 301、外れれば次へ流す。
 *
 * 先に表を引いてから次へ流す（404 かどうかを見てから引く形にしない）。
 * SPA のサイトは `/* /index.html 200` で 404 が出ないため、404 を頼りにすると転送が効かない。
 */
export declare function createSlugRedirectMiddleware(config: BlogAdminConfig): PagesFunction<BlogAdminEnv>;
