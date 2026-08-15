import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
/**
 * トークンの期限が近いことに気づくための警告文。期限が無い / 判定できないときは null。
 *
 * GitHub は期限付きのトークンでだけ `github-authentication-token-expiration` を返す。
 * 無期限のトークンではヘッダ自体が来ないので、ここでは何も言わない
 * （無期限をやめる判断は運用側の話で、公開のたびに警告を出すことではない）。
 */
export declare const TOKEN_EXPIRY_WARNING_DAYS = 30;
export declare function upsertGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, content: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
    tokenWarning: string | null;
} | Response>;
export declare function deleteGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
    existed: boolean;
    tokenWarning: string | null;
} | Response>;
/**
 * コミット失敗の Response から、画面に出す1行の説明を取り出す。
 * 公開を止めずに警告だけ出す `github.mode: "backup"` のサイトで使う。
 */
export declare function describeCommitFailure(response: Response): Promise<string>;
