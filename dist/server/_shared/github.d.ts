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
/**
 * いま公開されているファイルの中身を読む。
 *
 * 書き戻しの前に「サイトに出ている現物」を見たいときに使う。D1 の下書きから組み立て直すと、
 * まだ公開していない編集まで一緒に出てしまうため、直したい1行だけを差し替える用途で呼ぶ。
 * ファイルが無いときは `missing: true` を返す（呼び出し側が飛ばせるように、エラーにしない）。
 */
export declare function readGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string): Promise<{
    ok: true;
    content: string;
} | {
    ok: true;
    missing: true;
} | Response>;
export declare function upsertGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, content: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
    tokenWarning: string | null;
} | Response>;
/** 1コミットにまとめて書くファイル。 */
export interface GitHubFile {
    path: string;
    content: string;
}
/**
 * 複数のファイルを1コミットで書き換える（Git Data API）。
 *
 * Contents API は1回の呼び出しで1ファイルしか書けないため、カテゴリの改名のように
 * 記事の数だけファイルを直す操作では、途中で失敗すると「3本だけ新しい名前」という
 * 中途半端な状態が残る。戻すにも書き換えた本数ぶんのコミットが要り、その戻し自体も
 * 失敗しうる。ここでは ref の付け替えを最後の1回にまとめ、
 * 失敗したときは「1つも書かれていない」状態にする。
 *
 * 呼び出し回数はファイル数によらず5回。
 */
export declare function commitGitHubFiles(env: BlogAdminEnv, config: BlogAdminConfig, files: GitHubFile[], message: string): Promise<{
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
