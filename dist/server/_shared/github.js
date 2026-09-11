import { serverError } from "./admin.js";
/** GitHub API に送る User-Agent。パッケージ固定で、導入先ごとに変える必要はない。 */
const USER_AGENT = "cf-pages-blog-admin";
function githubFailureMessage(action, status, cfg) {
    const prefix = `GitHub ${action} failed: ${status}`;
    if (status === 401) {
        return `${prefix}. GITHUB_TOKEN is invalid or expired.`;
    }
    if (status === 403) {
        return `${prefix}. Check that GITHUB_TOKEN has access to ${cfg.owner}/${cfg.repo} and Repository permissions > Contents is Read and write.`;
    }
    if (status === 404) {
        return `${prefix}. Check the configured owner / repo / branch.`;
    }
    return prefix;
}
function utf8ToBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const b of bytes)
        binary += String.fromCharCode(b);
    return btoa(binary);
}
function base64ToUtf8(value) {
    // Contents API の content は 60 文字ごとに改行が入る
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}
/**
 * 接続先を決める。環境変数があればそちらを優先し、無ければ設定ファイルの値を使う。
 * どちらにも無ければエラーにする（暗黙の既定値は持たない）。
 */
function resolveGitHubTarget(env, config) {
    const owner = env.GITHUB_OWNER || config.github.owner;
    const repo = env.GITHUB_REPO || config.github.repo;
    const branch = env.GITHUB_BRANCH || config.github.branch || "main";
    if (!env.GITHUB_TOKEN || !owner || !repo) {
        return serverError("GitHub publish settings are not configured.");
    }
    return { token: env.GITHUB_TOKEN, owner, repo, branch };
}
/**
 * トークンの期限が近いことに気づくための警告文。期限が無い / 判定できないときは null。
 *
 * GitHub は期限付きのトークンでだけ `github-authentication-token-expiration` を返す。
 * 無期限のトークンではヘッダ自体が来ないので、ここでは何も言わない
 * （無期限をやめる判断は運用側の話で、公開のたびに警告を出すことではない）。
 */
export const TOKEN_EXPIRY_WARNING_DAYS = 30;
function describeTokenExpiry(headers) {
    const raw = headers.get("github-authentication-token-expiration");
    if (!raw)
        return null;
    // 例: "2026-09-13 12:00:00 UTC"。この形をそのまま Date に渡すと環境差が出るため整形する。
    const parsed = Date.parse(raw.replace(" UTC", "Z").replace(" ", "T"));
    if (Number.isNaN(parsed))
        return null;
    const days = Math.floor((parsed - Date.now()) / (24 * 60 * 60 * 1000));
    if (days > TOKEN_EXPIRY_WARNING_DAYS)
        return null;
    if (days < 0)
        return "GITHUB_TOKEN の有効期限が切れています。新しいトークンに入れ替えてください。";
    return `GITHUB_TOKEN の有効期限まであと${days}日です。切れると公開が止まるため、早めに入れ替えてください。`;
}
async function githubFetch(cfg, url, init = {}) {
    const res = await fetch(url, {
        ...init,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${cfg.token}`,
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(init.headers || {}),
        },
    });
    const text = await res.text();
    if (!res.ok)
        return { ok: false, status: res.status, body: text };
    return {
        ok: true,
        data: text ? JSON.parse(text) : {},
        tokenWarning: describeTokenExpiry(res.headers),
    };
}
function contentsUrl(cfg, path) {
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`;
}
/**
 * いま公開されているファイルの中身を読む。
 *
 * 書き戻しの前に「サイトに出ている現物」を見たいときに使う。D1 の下書きから組み立て直すと、
 * まだ公開していない編集まで一緒に出てしまうため、直したい1行だけを差し替える用途で呼ぶ。
 * ファイルが無いときは `missing: true` を返す（呼び出し側が飛ばせるように、エラーにしない）。
 */
export async function readGitHubFile(env, config, path) {
    const cfg = resolveGitHubTarget(env, config);
    if (cfg instanceof Response)
        return cfg;
    const res = await githubFetch(cfg, `${contentsUrl(cfg, path)}?ref=${encodeURIComponent(cfg.branch)}`);
    if (!res.ok) {
        if (res.status === 404)
            return { ok: true, missing: true };
        return serverError(githubFailureMessage("read", res.status, cfg));
    }
    if (typeof res.data.content !== "string")
        return { ok: true, missing: true };
    return { ok: true, content: base64ToUtf8(res.data.content) };
}
export async function upsertGitHubFile(env, config, path, content, message) {
    const cfg = resolveGitHubTarget(env, config);
    if (cfg instanceof Response)
        return cfg;
    const base = contentsUrl(cfg, path);
    const existing = await githubFetch(cfg, `${base}?ref=${encodeURIComponent(cfg.branch)}`);
    let sha;
    if (existing.ok) {
        sha = existing.data.sha;
    }
    else if (existing.status !== 404) {
        return serverError(githubFailureMessage("read", existing.status, cfg));
    }
    const updated = await githubFetch(cfg, base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message,
            content: utf8ToBase64(content),
            branch: cfg.branch,
            ...(sha ? { sha } : {}),
        }),
    });
    if (!updated.ok) {
        return serverError(githubFailureMessage("write", updated.status, cfg));
    }
    return {
        ok: true,
        commitSha: updated.data.commit?.sha || null,
        tokenWarning: updated.tokenWarning,
    };
}
function gitUrl(cfg, suffix) {
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/${suffix}`;
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
export async function commitGitHubFiles(env, config, files, message) {
    const cfg = resolveGitHubTarget(env, config);
    if (cfg instanceof Response)
        return cfg;
    if (files.length === 0)
        return { ok: true, commitSha: null, tokenWarning: null };
    // ブランチ名は URL に埋める前にエスケープする。ただし `feature/x` のような
    // 階層はパスの区切りとして残す必要があるので、`/` だけ戻す（contentsUrl と同じ扱い）。
    const ref = `heads/${encodeURIComponent(cfg.branch).replaceAll("%2F", "/")}`;
    const head = await githubFetch(cfg, gitUrl(cfg, `ref/${ref}`));
    if (!head.ok)
        return serverError(githubFailureMessage("read", head.status, cfg));
    const baseCommitSha = head.data.object?.sha;
    if (!baseCommitSha)
        return serverError("GitHub write failed: branch head not found.");
    const baseCommit = await githubFetch(cfg, gitUrl(cfg, `commits/${baseCommitSha}`));
    if (!baseCommit.ok) {
        return serverError(githubFailureMessage("read", baseCommit.status, cfg));
    }
    const baseTreeSha = baseCommit.data.tree?.sha;
    if (!baseTreeSha)
        return serverError("GitHub write failed: base tree not found.");
    const tree = await githubFetch(cfg, gitUrl(cfg, "trees"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            base_tree: baseTreeSha,
            // content が null のものは削除。Git Data API は sha: null で「その path を tree から外す」。
            tree: files.map((file) => ({
                path: file.path,
                mode: "100644",
                type: "blob",
                ...(file.content === null ? { sha: null } : { content: file.content }),
            })),
        }),
    });
    if (!tree.ok)
        return serverError(githubFailureMessage("write", tree.status, cfg));
    if (!tree.data.sha)
        return serverError("GitHub write failed: tree was not created.");
    const commit = await githubFetch(cfg, gitUrl(cfg, "commits"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, tree: tree.data.sha, parents: [baseCommitSha] }),
    });
    if (!commit.ok)
        return serverError(githubFailureMessage("write", commit.status, cfg));
    if (!commit.data.sha)
        return serverError("GitHub write failed: commit was not created.");
    // ここで初めてブランチが動く。ここまでのどこで失敗しても、公開側からは何も変わっていない。
    const updated = await githubFetch(cfg, gitUrl(cfg, `refs/${ref}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commit.data.sha }),
    });
    if (!updated.ok)
        return serverError(githubFailureMessage("write", updated.status, cfg));
    return { ok: true, commitSha: commit.data.sha, tokenWarning: updated.tokenWarning };
}
export async function deleteGitHubFile(env, config, path, message) {
    const cfg = resolveGitHubTarget(env, config);
    if (cfg instanceof Response)
        return cfg;
    const base = contentsUrl(cfg, path);
    const existing = await githubFetch(cfg, `${base}?ref=${encodeURIComponent(cfg.branch)}`);
    if (!existing.ok) {
        if (existing.status === 404) {
            return { ok: true, commitSha: null, existed: false, tokenWarning: null };
        }
        return serverError(githubFailureMessage("read", existing.status, cfg));
    }
    const sha = existing.data.sha;
    if (!sha)
        return serverError("GitHub delete failed: missing file sha.");
    const deleted = await githubFetch(cfg, base, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sha, branch: cfg.branch }),
    });
    if (!deleted.ok) {
        return serverError(githubFailureMessage("write", deleted.status, cfg));
    }
    return {
        ok: true,
        commitSha: deleted.data.commit?.sha || null,
        existed: true,
        tokenWarning: deleted.tokenWarning,
    };
}
/**
 * コミット失敗の Response から、画面に出す1行の説明を取り出す。
 * 公開を止めずに警告だけ出す `github.mode: "backup"` のサイトで使う。
 */
export async function describeCommitFailure(response) {
    try {
        const body = (await response.clone().json());
        if (body.message)
            return body.message;
    }
    catch {
        // JSON でない応答は無視して既定文を返す
    }
    return "GitHub へのバックアップに失敗しました。公開そのものは完了しています。";
}
