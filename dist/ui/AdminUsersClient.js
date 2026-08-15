"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Plus, Power, ScrollText, Trash2, UserRound, } from "lucide-react";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { AdminPasswordPanel } from "./AdminPasswordPanel.js";
import { ADMIN_API, ADMIN_PATHS, userApi } from "./paths.js";
// 権限の表示名。識別子は D1 の CHECK 制約に合わせて固定で、ラベルだけを日本語で見せる。
const ROLE_OPTIONS = [
    { value: "client_publisher", label: "編集・公開" },
    { value: "admin", label: "管理者" },
    { value: "client_viewer", label: "閲覧のみ" },
];
// 操作の表示名。サーバー側の AuditAction と対応させる。
// 対応が無い操作は識別子のまま出す（記録が消えるより、読みにくくても残るほうがよい）。
const AUDIT_ACTION_LABELS = {
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
function auditActionLabel(action) {
    return AUDIT_ACTION_LABELS[action] || action;
}
export function AdminUsersClient({ router }) {
    const { Link } = router;
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState("読み込み中...");
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [role, setRole] = useState("client_publisher");
    const [passwordNotice, setPasswordNotice] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
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
                const reason = (await res.json().catch(() => ({})));
                if (!cancelled) {
                    if (reason.error === "password_change_required") {
                        setMustChangePassword(true);
                        setMessage("");
                    }
                    else {
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
            const data = (await res.json());
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
        const data = (await res.json().catch(() => ({})));
        setIsCreating(false);
        if (res.status === 401) {
            router.navigate(ADMIN_PATHS.login);
            return;
        }
        if (!res.ok || !data.user || !data.initialPassword) {
            setMessage(data.message || "ユーザーを追加できませんでした。");
            return;
        }
        setUsers((current) => [...current, { ...data.user, is_active: 1 }]);
        setPasswordNotice({ title: "初期パスワード", password: data.initialPassword });
        setEmail("");
        setName("");
        setRole("client_publisher");
        setMessage("ユーザーを追加しました。初期パスワードはこの画面でのみ確認できます。");
    }
    async function patchUser(id, patch) {
        setBusyId(id);
        setMessage("");
        const res = await fetch(userApi(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({})));
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
            setUsers((current) => current.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
        }
        return data;
    }
    async function changeRole(user, nextRole) {
        if (nextRole === user.role)
            return;
        const data = await patchUser(user.id, { role: nextRole });
        if (data)
            setMessage("権限を変更しました。");
    }
    async function toggleActive(user) {
        const data = await patchUser(user.id, { isActive: user.is_active === 0 });
        if (data) {
            setMessage(user.is_active === 1 ? "ユーザーを無効化しました。" : "ユーザーを有効化しました。");
        }
    }
    async function resetPassword(user) {
        if (!window.confirm(`${user.name || user.email} のパスワードを再発行します。よろしいですか？`)) {
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
    async function removeUser(user) {
        if (!window.confirm(`${user.name || user.email} を削除します。元に戻せません。よろしいですか？`)) {
            return;
        }
        setBusyId(user.id);
        setMessage("");
        const res = await fetch(userApi(user.id), { method: "DELETE" });
        const data = (await res.json().catch(() => ({})));
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
    return (_jsxs("main", { className: "min-h-screen bg-[rgb(247,247,247)] px-4 pb-24 pt-6", children: [_jsxs("div", { className: "mx-auto max-w-[960px]", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[12px] font-bold tracking-[0.28em] text-foreground/50", children: "USER ADMIN" }), _jsx("h1", { className: "mt-2 text-[26px] font-bold leading-tight", children: "\u30E6\u30FC\u30B6\u30FC\u7BA1\u7406" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Link, { href: ADMIN_PATHS.posts, className: "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background", children: [_jsx(ArrowLeft, { size: 18 }), _jsx("span", { className: "sr-only", children: "\u8A18\u4E8B\u4E00\u89A7\u3078\u623B\u308B" })] }), _jsx(AdminLogoutButton, {})] })] }), message ? (_jsx("p", { className: "mt-6 rounded-lg border border-border bg-background p-4 text-[13px]", children: message })) : null, passwordNotice ? (_jsxs("section", { className: "mt-4 rounded-lg border border-foreground bg-background p-4", children: [_jsx("p", { className: "text-[13px] font-bold", children: passwordNotice.title }), _jsx("p", { className: "mt-2 rounded-md bg-muted px-3 py-2 font-mono text-[16px]", children: passwordNotice.password }), _jsx("p", { className: "mt-2 text-[12px] text-foreground/55", children: "\u3053\u306E\u753B\u9762\u3092\u96E2\u308C\u308B\u3068\u518D\u8868\u793A\u3067\u304D\u307E\u305B\u3093\u3002\u672C\u4EBA\u306B\u5B89\u5168\u306A\u65B9\u6CD5\u3067\u4F1D\u3048\u3066\u304F\u3060\u3055\u3044\u3002" })] })) : null, _jsxs("section", { className: "mt-6 rounded-lg border border-border bg-background p-4", children: [_jsx("h2", { className: "text-[15px] font-bold", children: "\u65B0\u3057\u3044\u30E6\u30FC\u30B6\u30FC\u3092\u8FFD\u52A0" }), _jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_220px_auto]", children: [_jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 text-[15px]", placeholder: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9", type: "email" }), _jsx("input", { value: name, onChange: (event) => setName(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 text-[15px]", placeholder: "\u8868\u793A\u540D\uFF08\u4EFB\u610F\uFF09" }), _jsx("select", { value: role, onChange: (event) => setRole(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 text-[15px]", children: ROLE_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }), _jsxs("button", { type: "button", onClick: () => void createUser(), disabled: isCreating || !email.trim(), className: "flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-bold text-background disabled:opacity-40", children: [isCreating ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Plus, { size: 16 }), "\u8FFD\u52A0"] })] })] }), _jsxs("section", { className: "mt-6 rounded-lg border border-border bg-background", children: [_jsx("div", { className: "border-b border-border px-4 py-3", children: _jsx("h2", { className: "text-[15px] font-bold", children: "\u767B\u9332\u6E08\u307F\u30E6\u30FC\u30B6\u30FC" }) }), isLoading ? (_jsx("p", { className: "p-4 text-[13px] text-foreground/60", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D..." })) : (_jsx("div", { className: "divide-y divide-border", children: users.map((user) => {
                                    const inactive = user.is_active === 0;
                                    const busy = busyId === user.id;
                                    return (_jsxs("div", { className: "flex items-start gap-3 px-4 py-4", children: [_jsx("div", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", children: _jsx(UserRound, { size: 18 }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "flex items-center gap-2 truncate text-[15px] font-bold", children: [user.name, inactive ? (_jsx("span", { className: "rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground/55", children: "\u7121\u52B9" })) : null] }), _jsx("p", { className: "mt-1 truncate text-[13px] text-foreground/60", children: user.email }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [_jsx("select", { value: user.role, disabled: busy, onChange: (event) => void changeRole(user, event.target.value), className: "h-9 rounded-md border border-border bg-background px-2 text-[12px] disabled:opacity-50", "aria-label": "\u6A29\u9650\u3092\u5909\u66F4", children: ROLE_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }), _jsxs("button", { type: "button", onClick: () => void toggleActive(user), disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50", children: [_jsx(Power, { size: 14 }), inactive ? "有効化" : "無効化"] }), _jsxs("button", { type: "button", onClick: () => void resetPassword(user), disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50", children: [_jsx(KeyRound, { size: 14 }), "\u30D1\u30B9\u30EF\u30FC\u30C9\u518D\u767A\u884C"] }), _jsxs("button", { type: "button", onClick: () => void removeUser(user), disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold text-foreground/60 hover:text-foreground disabled:opacity-50", children: [busy ? (_jsx(Loader2, { className: "animate-spin", size: 14 })) : (_jsx(Trash2, { size: 14 })), "\u524A\u9664"] })] })] })] }, user.id));
                                }) }))] }), _jsxs("section", { className: "mt-6 rounded-lg border border-border bg-background", children: [_jsxs("div", { className: "border-b border-border px-4 py-3", children: [_jsxs("h2", { className: "flex items-center gap-2 text-[15px] font-bold", children: [_jsx(ScrollText, { size: 16 }), "\u64CD\u4F5C\u30ED\u30B0"] }), _jsx("p", { className: "mt-1 text-[12px] text-foreground/55", children: "\u76F4\u8FD1\u306E\u8A18\u9332\u3092\u65B0\u3057\u3044\u9806\u306B\u8868\u793A\u3057\u307E\u3059\u3002\u8A18\u9332\u304C\u59CB\u307E\u308B\u524D\u306E\u64CD\u4F5C\u306F\u6B8B\u3063\u3066\u3044\u307E\u305B\u3093\u3002" })] }), auditLogs.length === 0 ? (_jsx("p", { className: "p-4 text-[13px] text-foreground/60", children: isLoading ? "読み込み中..." : "記録はまだありません。" })) : (_jsx("div", { className: "divide-y divide-border", children: auditLogs.map((log) => (_jsxs("div", { className: "px-4 py-3", children: [_jsxs("p", { className: "flex flex-wrap items-center gap-2 text-[13px] font-bold", children: [auditActionLabel(log.action), _jsx("span", { className: "font-normal text-foreground/55", children: new Date(log.created_at).toLocaleString("ja-JP") })] }), _jsxs("p", { className: "mt-1 break-all text-[12px] text-foreground/60", children: [log.actor_email || log.actor_id, log.summary ? ` / ${log.summary}` : "", log.ip ? ` / ${log.ip}` : ""] })] }, log.id))) }))] })] }), mustChangePassword ? (_jsx(AdminPasswordPanel, { required: true, onDone: () => {
                    setMustChangePassword(false);
                    location.reload();
                } })) : null] }));
}
