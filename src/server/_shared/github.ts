import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
import { serverError } from "./admin.js";

/** GitHub API に送る User-Agent。パッケージ固定で、導入先ごとに変える必要はない。 */
const USER_AGENT = "cf-pages-blog-admin";

interface GitHubContentResponse {
  sha?: string;
}

interface ResolvedGitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

function githubFailureMessage(
  action: "read" | "write",
  status: number,
  cfg: { owner: string; repo: string }
): string {
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

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * 接続先を決める。環境変数があればそちらを優先し、無ければ設定ファイルの値を使う。
 * どちらにも無ければエラーにする（暗黙の既定値は持たない）。
 */
function resolveGitHubTarget(
  env: BlogAdminEnv,
  config: BlogAdminConfig
): ResolvedGitHubConfig | Response {
  const owner = env.GITHUB_OWNER || config.github.owner;
  const repo = env.GITHUB_REPO || config.github.repo;
  const branch = env.GITHUB_BRANCH || config.github.branch || "main";
  if (!env.GITHUB_TOKEN || !owner || !repo) {
    return serverError("GitHub publish settings are not configured.");
  }
  return { token: env.GITHUB_TOKEN, owner, repo, branch };
}

async function githubFetch<T>(
  cfg: { token: string },
  url: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
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
  if (!res.ok) return { ok: false, status: res.status, body: text };
  return { ok: true, data: text ? (JSON.parse(text) as T) : ({} as T) };
}

function contentsUrl(cfg: ResolvedGitHubConfig, path: string): string {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    path
  ).replaceAll("%2F", "/")}`;
}

export async function upsertGitHubFile(
  env: BlogAdminEnv,
  config: BlogAdminConfig,
  path: string,
  content: string,
  message: string
): Promise<{ ok: true; commitSha: string | null } | Response> {
  const cfg = resolveGitHubTarget(env, config);
  if (cfg instanceof Response) return cfg;

  const base = contentsUrl(cfg, path);
  const existing = await githubFetch<GitHubContentResponse>(
    cfg,
    `${base}?ref=${encodeURIComponent(cfg.branch)}`
  );

  let sha: string | undefined;
  if (existing.ok) {
    sha = existing.data.sha;
  } else if (existing.status !== 404) {
    return serverError(githubFailureMessage("read", existing.status, cfg));
  }

  const updated = await githubFetch<{ commit?: { sha?: string } }>(cfg, base, {
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
  return { ok: true, commitSha: updated.data.commit?.sha || null };
}

export async function deleteGitHubFile(
  env: BlogAdminEnv,
  config: BlogAdminConfig,
  path: string,
  message: string
): Promise<{ ok: true; commitSha: string | null; existed: boolean } | Response> {
  const cfg = resolveGitHubTarget(env, config);
  if (cfg instanceof Response) return cfg;

  const base = contentsUrl(cfg, path);
  const existing = await githubFetch<GitHubContentResponse>(
    cfg,
    `${base}?ref=${encodeURIComponent(cfg.branch)}`
  );
  if (!existing.ok) {
    if (existing.status === 404) return { ok: true, commitSha: null, existed: false };
    return serverError(githubFailureMessage("read", existing.status, cfg));
  }
  const sha = existing.data.sha;
  if (!sha) return serverError("GitHub delete failed: missing file sha.");

  const deleted = await githubFetch<{ commit?: { sha?: string } }>(cfg, base, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: cfg.branch }),
  });
  if (!deleted.ok) {
    return serverError(githubFailureMessage("write", deleted.status, cfg));
  }
  return { ok: true, commitSha: deleted.data.commit?.sha || null, existed: true };
}

/**
 * コミット失敗の Response から、画面に出す1行の説明を取り出す。
 * 公開を止めずに警告だけ出す `github.mode: "backup"` のサイトで使う。
 */
export async function describeCommitFailure(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // JSON でない応答は無視して既定文を返す
  }
  return "GitHub へのバックアップに失敗しました。公開そのものは完了しています。";
}
