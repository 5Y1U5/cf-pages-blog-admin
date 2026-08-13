import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
export declare function upsertGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, content: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
} | Response>;
export declare function deleteGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
    existed: boolean;
} | Response>;
/**
 * コミット失敗の Response から、画面に出す1行の説明を取り出す。
 * 公開を止めずに警告だけ出す `github.mode: "backup"` のサイトで使う。
 */
export declare function describeCommitFailure(response: Response): Promise<string>;
