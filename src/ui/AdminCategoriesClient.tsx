"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";

import type { AdminRole, BlogAdminConfig } from "../config/index.js";
import { canEditContent } from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { AdminPasswordPanel } from "./AdminPasswordPanel.js";
import { ADMIN_API, ADMIN_PATHS, categoryApi } from "./paths.js";
import type { AdminRouter } from "./router.js";

interface AdminCategoryItem {
  id: string;
  code: string;
  slug: string;
  label: string;
  description: string | null;
}

const LOAD_ERROR_MESSAGE =
  "カテゴリ一覧を取得できませんでした。時間をおいて再度お試しください。";
const VIEWER_NOTICE = "閲覧専用の権限でログインしています。カテゴリの追加・変更はできません。";
// 公開済み記事のファイルも同時に書き換わる。サイトへ反映されるのは
// そのコミットでビルドが走ったあとなので、その時間差だけ伝えておく。
const RENAME_NOTICE = "サイトの表示は、この変更のビルドが終わってから切り替わります。";

export interface AdminCategoriesClientProps {
  config: BlogAdminConfig;
  router: AdminRouter;
}

export function AdminCategoriesClient({ router }: AdminCategoriesClientProps) {
  const { Link } = router;
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [message, setMessage] = useState("読み込み中...");
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [busyId, setBusyId] = useState("");

  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState("");
  const [editingLabel, setEditingLabel] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const canEdit = canEditContent(role);
  const canDelete = role === "admin";

  useEffect(() => {
    let cancelled = false;
    fetch(ADMIN_API.me, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          user?: { role?: AdminRole };
          mustChangePassword?: boolean;
        };
        setRole(data.user?.role ?? null);
        setMustChangePassword(Boolean(data.mustChangePassword));
      })
      .catch(() => undefined);

    fetch(ADMIN_API.categories, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.navigate(ADMIN_PATHS.login);
          return;
        }
        // パスワードの変更が済むまでサーバーが 403 を返す。理由は変更フォームが説明する。
        if (res.status === 403) {
          if (!cancelled) {
            setMessage("");
            setIsLoading(false);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setMessage(LOAD_ERROR_MESSAGE);
            setIsLoading(false);
          }
          return;
        }
        const data = (await res.json()) as { categories?: AdminCategoryItem[] };
        if (!cancelled) {
          setCategories(data.categories || []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCategory() {
    setIsCreating(true);
    setMessage("");
    const res = await fetch(ADMIN_API.categories, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: newSlug.trim().toLowerCase(), label: newLabel.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      category?: AdminCategoryItem;
      message?: string;
    };
    setIsCreating(false);

    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return;
    }
    if (!res.ok || !data.category) {
      setMessage(data.message || "カテゴリを追加できませんでした。");
      return;
    }
    const added = data.category;
    // 同じスラッグを送ると既存カテゴリの更新になる。一覧に2行並べないよう入れ替える。
    setCategories((current) =>
      current.some((item) => item.id === added.id)
        ? current.map((item) => (item.id === added.id ? added : item))
        : [...current, added]
    );
    setNewSlug("");
    setNewLabel("");
    setMessage("カテゴリを追加しました。");
  }

  function startEditing(category: AdminCategoryItem) {
    setEditingId(category.id);
    setEditingLabel(category.label);
    setEditingDescription(category.description || "");
    setMessage("");
  }

  function cancelEditing() {
    setEditingId("");
    setEditingLabel("");
    setEditingDescription("");
  }

  async function saveEditing(category: AdminCategoryItem) {
    const label = editingLabel.trim();
    if (!label) {
      setMessage("表示名を入力してください。");
      return;
    }
    setBusyId(category.id);
    setMessage("");
    const res = await fetch(categoryApi(category.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, description: editingDescription.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      category?: AdminCategoryItem;
      updatedPosts?: number;
      republishedPosts?: number;
      skippedPosts?: { id: string; slug: string }[];
      message?: string;
    };
    setBusyId("");

    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return;
    }
    if (!res.ok || !data.category) {
      setMessage(data.message || "カテゴリを変更できませんでした。");
      return;
    }
    const saved = data.category;
    setCategories((current) =>
      current.map((item) => (item.id === saved.id ? saved : item))
    );
    cancelEditing();
    const followed = data.updatedPosts || 0;
    const republished = data.republishedPosts || 0;
    const skipped = data.skippedPosts || [];
    // 書き戻せなかった記事は、サイト側に古い名前が残る。次の公開で直る旨まで伝える。
    const skippedNotice = skipped.length
      ? ` サイト側の書き換えができなかった記事が ${skipped.length} 件あります（${skipped
          .map((post) => post.slug)
          .join("、")}）。この記事を次に公開すると新しい名前になります。`
      : "";
    setMessage(
      followed > 0
        ? `名前を変更しました。このカテゴリの記事 ${followed} 件（うち公開中 ${republished} 件）にも反映しています。${RENAME_NOTICE}${skippedNotice}`
        : "名前を変更しました。"
    );
  }

  async function removeCategory(category: AdminCategoryItem) {
    if (!window.confirm(`「${category.label}」を削除します。よろしいですか？`)) return;
    setBusyId(category.id);
    setMessage("");
    const res = await fetch(categoryApi(category.id), { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setBusyId("");

    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return;
    }
    if (!res.ok) {
      // 使用中のカテゴリはサーバーが理由付きで断る。その文言をそのまま出す。
      setMessage(data.message || "カテゴリを削除できませんでした。");
      return;
    }
    setCategories((current) => current.filter((item) => item.id !== category.id));
    setMessage("カテゴリを削除しました。");
  }

  return (
    <main className="min-h-screen bg-[rgb(247,247,247)] px-4 pb-24 pt-6">
      <div className="mx-auto max-w-[960px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold tracking-[0.28em] text-foreground/50">
              CATEGORY ADMIN
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-tight">カテゴリ管理</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href={ADMIN_PATHS.posts}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background"
            >
              <ArrowLeft size={18} />
              <span className="sr-only">記事一覧へ戻る</span>
            </Link>
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

        {canEdit ? (
          <section className="mt-6 rounded-lg border border-border bg-background p-4">
            <h2 className="text-[15px] font-bold">新しいカテゴリを追加</h2>
            <p className="mt-1 text-[12px] text-foreground/55">
              スラッグは URL とファイルの中で使う英字の名前です。あとから変えられません。
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
                placeholder="表示名（例: 住まいのコラム）"
              />
              <input
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                className="h-11 rounded-md border border-border bg-background px-3 font-mono text-[15px]"
                placeholder="スラッグ（例: column）"
              />
              <button
                type="button"
                onClick={() => void createCategory()}
                disabled={isCreating || !newLabel.trim() || !newSlug.trim()}
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-bold text-background disabled:opacity-40"
              >
                {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                追加
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <Tags size={16} />
              登録済みカテゴリ
            </h2>
          </div>
          {isLoading ? (
            <p className="p-4 text-[13px] text-foreground/60">読み込み中...</p>
          ) : categories.length === 0 ? (
            <p className="p-4 text-[13px] text-foreground/60">カテゴリはまだありません。</p>
          ) : (
            <div className="divide-y divide-border">
              {categories.map((category) => {
                const busy = busyId === category.id;
                const editing = editingId === category.id;
                return (
                  <div key={category.id} className="px-4 py-4">
                    {editing ? (
                      <div className="grid gap-3">
                        <input
                          value={editingLabel}
                          onChange={(event) => setEditingLabel(event.target.value)}
                          className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
                          aria-label="表示名"
                          placeholder="表示名"
                        />
                        <input
                          value={editingDescription}
                          onChange={(event) => setEditingDescription(event.target.value)}
                          className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
                          aria-label="説明（任意）"
                          placeholder="説明（任意）"
                        />
                        <p className="font-mono text-[12px] text-foreground/55">
                          {category.slug}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEditing(category)}
                            disabled={busy}
                            className="flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-bold text-background disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="animate-spin" size={14} />
                            ) : (
                              <Check size={14} />
                            )}
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={busy}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50"
                          >
                            <X size={14} />
                            やめる
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-bold">{category.label}</p>
                          <p className="mt-1 truncate font-mono text-[12px] text-foreground/55">
                            {category.slug}
                          </p>
                          {category.description ? (
                            <p className="mt-1 text-[13px] text-foreground/60">
                              {category.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => startEditing(category)}
                              disabled={busy}
                              className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50"
                            >
                              <Pencil size={14} />
                              名前を変更
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void removeCategory(category)}
                              disabled={busy}
                              className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold text-foreground/60 hover:text-foreground disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="animate-spin" size={14} />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              削除
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {mustChangePassword ? (
        <AdminPasswordPanel
          required
          onDone={() => {
            setMustChangePassword(false);
            location.reload();
          }}
        />
      ) : null}
    </main>
  );
}
