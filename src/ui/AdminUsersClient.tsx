"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  Plus,
  Power,
  ScrollText,
  Trash2,
  UserRound,
} from "lucide-react";

import type { AdminRole, BlogAdminConfig } from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { AdminPasswordPanel } from "./AdminPasswordPanel.js";
import { ADMIN_API, ADMIN_PATHS, userApi } from "./paths.js";
import type { AdminRouter } from "./router.js";

interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// 権限の表示名。識別子は D1 の CHECK 制約に合わせて固定で、ラベルだけを日本語で見せる。
const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "client_publisher", label: "編集・公開" },
  { value: "admin", label: "管理者" },
  { value: "client_viewer", label: "閲覧のみ" },
];

interface PasswordNotice {
  title: string;
  password: string;
}

interface AuditLogItem {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  ip: string | null;
  created_at: string;
}

// 操作の表示名。サーバー側の AuditAction と対応させる。
// 対応が無い操作は識別子のまま出す（記録が消えるより、読みにくくても残るほうがよい）。
const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "ログイン",
  "auth.logout": "ログアウト",
  "auth.password_change": "パスワード変更（本人）",
  "post.create": "記事を作成",
  "post.publish": "記事を公開",
  "post.unpublish": "記事を取り下げ",
  "post.delete": "記事を削除",
  "user.create": "ユーザーを追加",
  "user.update": "ユーザーを変更",
  "user.delete": "ユーザーを削除",
  "user.password_reset": "パスワードを再発行",
  "category.create": "カテゴリを追加",
  "category.delete": "カテゴリを削除",
  "asset.upload": "画像をアップロード",
};

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action;
}

export interface AdminUsersClientProps {
  config: BlogAdminConfig;
  router: AdminRouter;
}

export function AdminUsersClient({ router }: AdminUsersClientProps) {
  const { Link } = router;
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [message, setMessage] = useState("読み込み中...");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRole>("client_publisher");
  const [passwordNotice, setPasswordNotice] = useState<PasswordNotice | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(ADMIN_API.users, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.navigate(ADMIN_PATHS.login);
          return;
        }
        if (res.status === 403) {
          // 403 は「管理者ではない」場合と「パスワードの変更が必要」な場合がある。
          const reason = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) {
            if (reason.error === "password_change_required") {
              setMustChangePassword(true);
              setMessage("");
            } else {
              setMessage("ユーザー管理は管理者のみ利用できます。");
            }
            setIsLoading(false);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setMessage("ユーザー一覧を取得できませんでした。時間をおいて再度お試しください。");
            setIsLoading(false);
          }
          return;
        }
        const data = (await res.json()) as {
          users?: AdminUserItem[];
          auditLogs?: AuditLogItem[];
        };
        if (!cancelled) {
          setUsers(data.users || []);
          setAuditLogs(data.auditLogs || []);
          setMessage("");
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("ユーザー一覧を取得できませんでした。時間をおいて再度お試しください。");
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser() {
    setIsCreating(true);
    setPasswordNotice(null);
    setMessage("");
    const res = await fetch(ADMIN_API.users, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: AdminUserItem;
      initialPassword?: string;
      message?: string;
    };
    setIsCreating(false);

    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return;
    }
    if (!res.ok || !data.user || !data.initialPassword) {
      setMessage(data.message || "ユーザーを追加できませんでした。");
      return;
    }
    setUsers((current) => [...current, { ...(data.user as AdminUserItem), is_active: 1 }]);
    setPasswordNotice({ title: "初期パスワード", password: data.initialPassword });
    setEmail("");
    setName("");
    setRole("client_publisher");
    setMessage("ユーザーを追加しました。初期パスワードはこの画面でのみ確認できます。");
  }

  async function patchUser(
    id: string,
    patch: { role?: AdminRole; isActive?: boolean; resetPassword?: boolean }
  ): Promise<{ user?: AdminUserItem; newPassword?: string } | null> {
    setBusyId(id);
    setMessage("");
    const res = await fetch(userApi(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: AdminUserItem;
      newPassword?: string;
      message?: string;
    };
    setBusyId("");
    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return null;
    }
    if (!res.ok) {
      setMessage(data.message || "更新できませんでした。");
      return null;
    }
    if (data.user) {
      setUsers((current) =>
        current.map((u) => (u.id === id ? { ...u, ...(data.user as AdminUserItem) } : u))
      );
    }
    return data;
  }

  async function changeRole(user: AdminUserItem, nextRole: AdminRole) {
    if (nextRole === user.role) return;
    const data = await patchUser(user.id, { role: nextRole });
    if (data) setMessage("権限を変更しました。");
  }

  async function toggleActive(user: AdminUserItem) {
    const data = await patchUser(user.id, { isActive: user.is_active === 0 });
    if (data) {
      setMessage(
        user.is_active === 1 ? "ユーザーを無効化しました。" : "ユーザーを有効化しました。"
      );
    }
  }

  async function resetPassword(user: AdminUserItem) {
    if (
      !window.confirm(`${user.name || user.email} のパスワードを再発行します。よろしいですか？`)
    ) {
      return;
    }
    const data = await patchUser(user.id, { resetPassword: true });
    if (data?.newPassword) {
      setPasswordNotice({
        title: `再発行したパスワード（${user.name || user.email}）`,
        password: data.newPassword,
      });
      setMessage("パスワードを再発行しました。この画面でのみ確認できます。");
    }
  }

  async function removeUser(user: AdminUserItem) {
    if (
      !window.confirm(`${user.name || user.email} を削除します。元に戻せません。よろしいですか？`)
    ) {
      return;
    }
    setBusyId(user.id);
    setMessage("");
    const res = await fetch(userApi(user.id), { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setBusyId("");
    if (res.status === 401) {
      router.navigate(ADMIN_PATHS.login);
      return;
    }
    if (!res.ok) {
      setMessage(data.message || "削除できませんでした。");
      return;
    }
    setUsers((current) => current.filter((u) => u.id !== user.id));
    setMessage("ユーザーを削除しました。");
  }

  return (
    <main className="min-h-screen bg-[rgb(247,247,247)] px-4 pb-24 pt-6">
      <div className="mx-auto max-w-[960px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold tracking-[0.28em] text-foreground/50">
              USER ADMIN
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-tight">ユーザー管理</h1>
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

        {message ? (
          <p className="mt-6 rounded-lg border border-border bg-background p-4 text-[13px]">
            {message}
          </p>
        ) : null}

        {passwordNotice ? (
          <section className="mt-4 rounded-lg border border-foreground bg-background p-4">
            <p className="text-[13px] font-bold">{passwordNotice.title}</p>
            <p className="mt-2 rounded-md bg-muted px-3 py-2 font-mono text-[16px]">
              {passwordNotice.password}
            </p>
            <p className="mt-2 text-[12px] text-foreground/55">
              この画面を離れると再表示できません。本人に安全な方法で伝えてください。
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-lg border border-border bg-background p-4">
          <h2 className="text-[15px] font-bold">新しいユーザーを追加</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_220px_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
              placeholder="メールアドレス"
              type="email"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
              placeholder="表示名（任意）"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
              className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createUser()}
              disabled={isCreating || !email.trim()}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-bold text-background disabled:opacity-40"
            >
              {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              追加
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-bold">登録済みユーザー</h2>
          </div>
          {isLoading ? (
            <p className="p-4 text-[13px] text-foreground/60">読み込み中...</p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => {
                const inactive = user.is_active === 0;
                const busy = busyId === user.id;
                return (
                  <div key={user.id} className="flex items-start gap-3 px-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <UserRound size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-[15px] font-bold">
                        {user.name}
                        {inactive ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground/55">
                            無効
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 truncate text-[13px] text-foreground/60">{user.email}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          value={user.role}
                          disabled={busy}
                          onChange={(event) =>
                            void changeRole(user, event.target.value as AdminRole)
                          }
                          className="h-9 rounded-md border border-border bg-background px-2 text-[12px] disabled:opacity-50"
                          aria-label="権限を変更"
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void toggleActive(user)}
                          disabled={busy}
                          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50"
                        >
                          <Power size={14} />
                          {inactive ? "有効化" : "無効化"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetPassword(user)}
                          disabled={busy}
                          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50"
                        >
                          <KeyRound size={14} />
                          パスワード再発行
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeUser(user)}
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <ScrollText size={16} />
              操作ログ
            </h2>
            <p className="mt-1 text-[12px] text-foreground/55">
              直近の記録を新しい順に表示します。記録が始まる前の操作は残っていません。
            </p>
          </div>
          {auditLogs.length === 0 ? (
            <p className="p-4 text-[13px] text-foreground/60">
              {isLoading ? "読み込み中..." : "記録はまだありません。"}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {auditLogs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
                    {auditActionLabel(log.action)}
                    <span className="font-normal text-foreground/55">
                      {new Date(log.created_at).toLocaleString("ja-JP")}
                    </span>
                  </p>
                  <p className="mt-1 break-all text-[12px] text-foreground/60">
                    {log.actor_email || log.actor_id}
                    {log.summary ? ` / ${log.summary}` : ""}
                    {log.ip ? ` / ${log.ip}` : ""}
                  </p>
                </div>
              ))}
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
