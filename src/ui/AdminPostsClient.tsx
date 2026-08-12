"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";

import type { AdminRole, BlogAdminConfig } from "../config/index.js";
import { canEditContent, publicPostUrl } from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { ADMIN_API, ADMIN_PATHS, editorPath, postApi } from "./paths.js";
import type { AdminRouter } from "./router.js";

interface AdminPostListItem {
  id: string;
  slug: string;
  title: string;
  date: string;
  category_label: string;
  status: string;
  updated_at: string;
  published_url?: string | null;
}

type PostTab = "published" | "draft";

const PUBLIC_STATUSES = new Set(["published", "publishing"]);
const LOAD_ERROR_MESSAGE = "記事一覧を取得できませんでした。時間をおいて再度お試しください。";
const VIEWER_NOTICE =
  "閲覧専用の権限でログインしています。記事の作成・保存・公開・画像アップロードはできません。";
const FORBIDDEN_MESSAGE = "権限がありません。この操作は許可されていません。";

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "下書き",
    review: "確認待ち",
    approved: "公開準備済み",
    publishing: "公開反映中",
    published: "公開中",
    archived: "非表示",
  };
  return labels[status] || "編集中";
}

function tabForPost(post: AdminPostListItem): PostTab {
  return PUBLIC_STATUSES.has(post.status) || Boolean(post.published_url)
    ? "published"
    : "draft";
}

export interface AdminPostsClientProps {
  config: BlogAdminConfig;
  router: AdminRouter;
  /**
   * ヘッダーに足したい導入先固有のボタン（管理者にだけ表示される）。
   * この画面に無い機能へのリンクを、パッケージ側に持ち込まずに置けるようにするための口。
   */
  headerActions?: ReactNode;
}

export function AdminPostsClient({ config, router, headerActions }: AdminPostsClientProps) {
  const { Link } = router;
  const [posts, setPosts] = useState<AdminPostListItem[]>([]);
  const [message, setMessage] = useState("読み込み中...");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PostTab>("published");
  const [role, setRole] = useState<AdminRole | null>(null);

  const isAdmin = role === "admin";
  // 閲覧専用（client_viewer）は記事を作れないので、新規作成の導線を出さない。
  const canEdit = canEditContent(role);
  const canDelete = role !== null && config.permissions.deletePost.includes(role);

  const counts = useMemo(
    () => ({
      published: posts.filter((post) => tabForPost(post) === "published").length,
      draft: posts.filter((post) => tabForPost(post) === "draft").length,
    }),
    [posts]
  );

  const visiblePosts = useMemo(
    () => posts.filter((post) => tabForPost(post) === activeTab),
    [activeTab, posts]
  );

  async function load() {
    const res = await fetch(ADMIN_API.posts, { cache: "no-store" });
    if (res.status === 401) {
      location.href = ADMIN_PATHS.login;
      return;
    }
    if (!res.ok) {
      setMessage(LOAD_ERROR_MESSAGE);
      setIsLoading(false);
      return;
    }
    const data = (await res.json()) as { posts?: AdminPostListItem[] };
    setPosts(data.posts || []);
    setMessage("");
    setIsLoading(false);
  }

  function refresh() {
    setIsLoading(true);
    setMessage("読み込み中...");
    void load();
  }

  async function deletePost(post: AdminPostListItem) {
    const isPublic = tabForPost(post) === "published";
    const lines = [
      "記事を削除します。",
      "",
      `　タイトル：${post.title || "（無題）"}`,
      `　状態：${isPublic ? "公開中" : "下書き（未公開）"}`,
      "",
      isPublic
        ? `この記事はいま公開されています。削除すると、サイトから記事ページごと消えます。\n記事の URL（${
            post.published_url || publicPostUrl(config, post.slug)
          }）は「ページが見つかりません（404）」になります。`
        : "この記事はまだ公開されていません。削除してもサイトの見た目は変わりません。",
      "",
      "削除した記事は元に戻せません。書き直す場合は最初から作り直しになります。",
      "",
      "本当に削除しますか？",
    ];
    if (!window.confirm(lines.join("\n"))) {
      return;
    }
    const res = await fetch(postApi(post.id), { method: "DELETE" });
    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return;
    }
    if (res.status === 403) {
      setMessage(FORBIDDEN_MESSAGE);
      return;
    }
    if (!res.ok) {
      setMessage("記事を削除できませんでした。時間をおいて再度お試しください。");
      return;
    }
    setPosts((current) => current.filter((item) => item.id !== post.id));
    setMessage("");
  }

  useEffect(() => {
    let cancelled = false;
    fetch(ADMIN_API.me, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { user?: { role?: AdminRole } };
        setRole(data.user?.role ?? null);
      })
      .catch(() => undefined);
    fetch(ADMIN_API.posts, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          location.href = ADMIN_PATHS.login;
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setMessage(LOAD_ERROR_MESSAGE);
            setIsLoading(false);
          }
          return;
        }
        const data = (await res.json()) as { posts?: AdminPostListItem[] };
        if (!cancelled) {
          setPosts(data.posts || []);
          setMessage("");
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage(LOAD_ERROR_MESSAGE);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[rgb(247,247,247)] px-4 pb-24 pt-6">
      <div className="mx-auto max-w-[960px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold tracking-[0.28em] text-foreground/50">
              {config.brandLabel}
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-tight">記事一覧</h1>
          </div>
          <div className="flex gap-2">
            {isAdmin ? (
              <>
                {headerActions}
                <Link
                  href={ADMIN_PATHS.users}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background"
                >
                  <UsersRound size={18} />
                  <span className="sr-only">ユーザー管理</span>
                </Link>
              </>
            ) : null}
            <button
              onClick={refresh}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background"
              aria-label="再読み込み"
            >
              <RefreshCw size={18} />
            </button>
            <AdminLogoutButton />
          </div>
        </div>

        {!canEdit ? (
          <p className="mt-6 rounded-lg border border-border bg-muted p-4 text-center text-[13px] font-bold text-foreground/75">
            {VIEWER_NOTICE}
          </p>
        ) : null}

        {message ? (
          <p className="mt-6 rounded-lg border border-border bg-background p-4 text-[13px]">
            {message}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 rounded-lg border border-border bg-background p-1">
          {[
            { value: "published" as const, label: "公開中", count: counts.published },
            { value: "draft" as const, label: "下書き", count: counts.draft },
          ].map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`flex h-11 items-center justify-center gap-2 rounded-md text-[13px] font-bold ${
                  isActive ? "bg-foreground text-background" : "text-foreground/70"
                }`}
              >
                {tab.label}
                <span className={isActive ? "text-background/70" : "text-foreground/45"}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3">
          {!isLoading && visiblePosts.length === 0 ? (
            <p className="rounded-lg border border-border bg-background p-4 text-[13px] text-foreground/60">
              {activeTab === "published"
                ? "公開中の記事はありません。"
                : "下書きの記事はありません。"}
            </p>
          ) : null}
          {visiblePosts.map((post) => (
            <Link
              key={post.id}
              href={editorPath(post.id)}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{post.title}</p>
                  <p className="mt-1 text-[12px] text-foreground/55">
                    {post.category_label} / {post.date}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">
                      {statusLabel(post.status)}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                      最終更新: {new Date(post.updated_at).toLocaleString("ja-JP")}
                    </span>
                  </div>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void deletePost(post);
                    }}
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground/40 hover:text-foreground"
                    aria-label="記事を削除"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {canEdit ? (
        <Link
          href={editorPath()}
          className="fixed inset-x-4 bottom-4 mx-auto flex h-12 max-w-[480px] items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background shadow-lg"
        >
          <Plus size={18} />
          新規記事
        </Link>
      ) : null}
      {isLoading ? null : <div className="h-1" />}
    </main>
  );
}
