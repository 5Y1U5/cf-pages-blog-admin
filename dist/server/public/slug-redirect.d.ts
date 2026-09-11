import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
/**
 * pathname が旧 URL なら、いまの公開パス（例 `/blog/new-slug`）を返す。該当しなければ null。
 *
 * 転送先は記事の `published_url` をそのまま使う。判定も `published_url` だけで行い、`status` は見ない。
 * 公開中の記事を開いて保存すると `status` は draft に戻るが、静的サイトでは記事が出たままで
 * `published_url` も残る。`status` で絞ると、保存しただけで旧 URL がリンク切れになる。
 * 公開の取り下げは `published_url` を NULL にするので、取り下げた記事へは送らない
 * （404 のままにする。取り下げた記事へ 301 で送ると行き先も 404 になる）。
 *
 * 旧 URL を別の記事がいま使っている（同じパスを `published_url` に持つ記事がある）ときは転送しない。
 * その URL は生きているので、そのまま次へ流す。
 */
export declare function resolvePostRedirect(db: D1Database, config: BlogAdminConfig, pathname: string): Promise<string | null>;
/**
 * Pages Functions の中間処理。転送表に当たれば 301、外れれば次へ流す。
 *
 * 先に表を引いてから次へ流す（404 かどうかを見てから引く形にしない）。
 * SPA のサイトは `/* /index.html 200` で 404 が出ないため、404 を頼りにすると転送が効かない。
 */
export declare function createSlugRedirectMiddleware(config: BlogAdminConfig): PagesFunction<BlogAdminEnv>;
