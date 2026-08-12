/**
 * Cloudflare Pages のバインディングと環境変数。
 * Workers の型に依存するため ./config 本体とは分けてある（理由は ./config の冒頭コメント）。
 */
export interface BlogAdminEnv {
    /** D1。バインディング名は固定。 */
    ADMIN_DB?: D1Database;
    /** R2。バインディング名は固定。 */
    ADMIN_ASSETS?: R2Bucket;
    /** GitHub の Personal Access Token。Pages のシークレットとして設定する。設定ファイルには書かない。 */
    GITHUB_TOKEN?: string;
    /** 設定ファイルの github.owner を上書きしたいときだけ指定する。 */
    GITHUB_OWNER?: string;
    /** 設定ファイルの github.repo を上書きしたいときだけ指定する。 */
    GITHUB_REPO?: string;
    /** 設定ファイルの github.branch を上書きしたいときだけ指定する。 */
    GITHUB_BRANCH?: string;
    /**
     * R2 のアセットを独自ドメイン等から配る場合の公開ベース URL。
     * 未設定なら /api/admin/assets/public/<key> を使う。
     */
    ASSET_PUBLIC_BASE_URL?: string;
}
