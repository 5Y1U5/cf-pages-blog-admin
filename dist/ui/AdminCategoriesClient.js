"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { canEditContent } from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { AdminPasswordPanel } from "./AdminPasswordPanel.js";
import { ADMIN_API, ADMIN_PATHS, categoryApi } from "./paths.js";
const LOAD_ERROR_MESSAGE = "カテゴリ一覧を取得できませんでした。時間をおいて再度お試しください。";
const VIEWER_NOTICE = "閲覧専用の権限でログインしています。カテゴリの追加・変更はできません。";
// 表示名を変えても、すでに公開した Markdown の frontmatter は書き換わらない。
// 記事一覧とカテゴリ一覧はその場で新しい名前になるので、差が出るのは記事ページだけ。
const RENAME_NOTICE = "公開済み記事のファイルに書かれた名前は、その記事を次に公開したときに新しい名前へ変わります。";
export function AdminCategoriesClient({ router }) {
    const { Link } = router;
    const [categories, setCategories] = useState([]);
    const [message, setMessage] = useState("読み込み中...");
    const [isLoading, setIsLoading] = useState(true);
    const [role, setRole] = useState(null);
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
            if (!res.ok || cancelled)
                return;
            const data = (await res.json());
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
            const data = (await res.json());
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
        const data = (await res.json().catch(() => ({})));
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
        setCategories((current) => current.some((item) => item.id === added.id)
            ? current.map((item) => (item.id === added.id ? added : item))
            : [...current, added]);
        setNewSlug("");
        setNewLabel("");
        setMessage("カテゴリを追加しました。");
    }
    function startEditing(category) {
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
    async function saveEditing(category) {
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
        const data = (await res.json().catch(() => ({})));
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
        setCategories((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        cancelEditing();
        const followed = data.updatedPosts || 0;
        setMessage(followed > 0
            ? `名前を変更しました。このカテゴリの記事 ${followed} 件にも反映しています。${RENAME_NOTICE}`
            : "名前を変更しました。");
    }
    async function removeCategory(category) {
        if (!window.confirm(`「${category.label}」を削除します。よろしいですか？`))
            return;
        setBusyId(category.id);
        setMessage("");
        const res = await fetch(categoryApi(category.id), { method: "DELETE" });
        const data = (await res.json().catch(() => ({})));
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
    return (_jsxs("main", { className: "min-h-screen bg-[rgb(247,247,247)] px-4 pb-24 pt-6", children: [_jsxs("div", { className: "mx-auto max-w-[960px]", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[12px] font-bold tracking-[0.28em] text-foreground/50", children: "CATEGORY ADMIN" }), _jsx("h1", { className: "mt-2 text-[26px] font-bold leading-tight", children: "\u30AB\u30C6\u30B4\u30EA\u7BA1\u7406" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Link, { href: ADMIN_PATHS.posts, className: "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background", children: [_jsx(ArrowLeft, { size: 18 }), _jsx("span", { className: "sr-only", children: "\u8A18\u4E8B\u4E00\u89A7\u3078\u623B\u308B" })] }), _jsx(AdminLogoutButton, {})] })] }), !canEdit ? (_jsx("p", { className: "mt-6 rounded-lg border border-border bg-muted p-4 text-center text-[13px] font-bold text-foreground/75", children: VIEWER_NOTICE })) : null, message ? (_jsx("p", { className: "mt-6 rounded-lg border border-border bg-background p-4 text-[13px]", children: message })) : null, canEdit ? (_jsxs("section", { className: "mt-6 rounded-lg border border-border bg-background p-4", children: [_jsx("h2", { className: "text-[15px] font-bold", children: "\u65B0\u3057\u3044\u30AB\u30C6\u30B4\u30EA\u3092\u8FFD\u52A0" }), _jsx("p", { className: "mt-1 text-[12px] text-foreground/55", children: "\u30B9\u30E9\u30C3\u30B0\u306F URL \u3068\u30D5\u30A1\u30A4\u30EB\u306E\u4E2D\u3067\u4F7F\u3046\u82F1\u5B57\u306E\u540D\u524D\u3067\u3059\u3002\u3042\u3068\u304B\u3089\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002" }), _jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]", children: [_jsx("input", { value: newLabel, onChange: (event) => setNewLabel(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 text-[15px]", placeholder: "\u8868\u793A\u540D\uFF08\u4F8B: \u4F4F\u307E\u3044\u306E\u30B3\u30E9\u30E0\uFF09" }), _jsx("input", { value: newSlug, onChange: (event) => setNewSlug(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 font-mono text-[15px]", placeholder: "\u30B9\u30E9\u30C3\u30B0\uFF08\u4F8B: column\uFF09" }), _jsxs("button", { type: "button", onClick: () => void createCategory(), disabled: isCreating || !newLabel.trim() || !newSlug.trim(), className: "flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-bold text-background disabled:opacity-40", children: [isCreating ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Plus, { size: 16 }), "\u8FFD\u52A0"] })] })] })) : null, _jsxs("section", { className: "mt-6 rounded-lg border border-border bg-background", children: [_jsx("div", { className: "border-b border-border px-4 py-3", children: _jsxs("h2", { className: "flex items-center gap-2 text-[15px] font-bold", children: [_jsx(Tags, { size: 16 }), "\u767B\u9332\u6E08\u307F\u30AB\u30C6\u30B4\u30EA"] }) }), isLoading ? (_jsx("p", { className: "p-4 text-[13px] text-foreground/60", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D..." })) : categories.length === 0 ? (_jsx("p", { className: "p-4 text-[13px] text-foreground/60", children: "\u30AB\u30C6\u30B4\u30EA\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002" })) : (_jsx("div", { className: "divide-y divide-border", children: categories.map((category) => {
                                    const busy = busyId === category.id;
                                    const editing = editingId === category.id;
                                    return (_jsx("div", { className: "px-4 py-4", children: editing ? (_jsxs("div", { className: "grid gap-3", children: [_jsx("input", { value: editingLabel, onChange: (event) => setEditingLabel(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 text-[15px]", "aria-label": "\u8868\u793A\u540D", placeholder: "\u8868\u793A\u540D" }), _jsx("input", { value: editingDescription, onChange: (event) => setEditingDescription(event.target.value), className: "h-11 rounded-md border border-border bg-background px-3 text-[15px]", "aria-label": "\u8AAC\u660E\uFF08\u4EFB\u610F\uFF09", placeholder: "\u8AAC\u660E\uFF08\u4EFB\u610F\uFF09" }), _jsx("p", { className: "font-mono text-[12px] text-foreground/55", children: category.slug }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", onClick: () => void saveEditing(category), disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-bold text-background disabled:opacity-50", children: [busy ? (_jsx(Loader2, { className: "animate-spin", size: 14 })) : (_jsx(Check, { size: 14 })), "\u4FDD\u5B58"] }), _jsxs("button", { type: "button", onClick: cancelEditing, disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50", children: [_jsx(X, { size: 14 }), "\u3084\u3081\u308B"] })] })] })) : (_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-[15px] font-bold", children: category.label }), _jsx("p", { className: "mt-1 truncate font-mono text-[12px] text-foreground/55", children: category.slug }), category.description ? (_jsx("p", { className: "mt-1 text-[13px] text-foreground/60", children: category.description })) : null] }), _jsxs("div", { className: "flex shrink-0 flex-wrap gap-2", children: [canEdit ? (_jsxs("button", { type: "button", onClick: () => startEditing(category), disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold disabled:opacity-50", children: [_jsx(Pencil, { size: 14 }), "\u540D\u524D\u3092\u5909\u66F4"] })) : null, canDelete ? (_jsxs("button", { type: "button", onClick: () => void removeCategory(category), disabled: busy, className: "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-bold text-foreground/60 hover:text-foreground disabled:opacity-50", children: [busy ? (_jsx(Loader2, { className: "animate-spin", size: 14 })) : (_jsx(Trash2, { size: 14 })), "\u524A\u9664"] })) : null] })] })) }, category.id));
                                }) }))] })] }), mustChangePassword ? (_jsx(AdminPasswordPanel, { required: true, onDone: () => {
                    setMustChangePassword(false);
                    location.reload();
                } })) : null] }));
}
