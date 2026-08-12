"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { publicPostUrl } from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { ADMIN_API, ADMIN_PATHS, editorPath, postApi } from "./paths.js";
const PUBLIC_STATUSES = new Set(["published", "publishing"]);
const LOAD_ERROR_MESSAGE = "記事一覧を取得できませんでした。時間をおいて再度お試しください。";
function statusLabel(status) {
    const labels = {
        draft: "下書き",
        review: "確認待ち",
        approved: "公開準備済み",
        publishing: "公開反映中",
        published: "公開中",
        archived: "非表示",
    };
    return labels[status] || "編集中";
}
function tabForPost(post) {
    return PUBLIC_STATUSES.has(post.status) || Boolean(post.published_url)
        ? "published"
        : "draft";
}
export function AdminPostsClient({ config, router, headerActions }) {
    const { Link } = router;
    const [posts, setPosts] = useState([]);
    const [message, setMessage] = useState("読み込み中...");
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("published");
    const [role, setRole] = useState(null);
    const isAdmin = role === "admin";
    const canDelete = role !== null && config.permissions.deletePost.includes(role);
    const counts = useMemo(() => ({
        published: posts.filter((post) => tabForPost(post) === "published").length,
        draft: posts.filter((post) => tabForPost(post) === "draft").length,
    }), [posts]);
    const visiblePosts = useMemo(() => posts.filter((post) => tabForPost(post) === activeTab), [activeTab, posts]);
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
        const data = (await res.json());
        setPosts(data.posts || []);
        setMessage("");
        setIsLoading(false);
    }
    function refresh() {
        setIsLoading(true);
        setMessage("読み込み中...");
        void load();
    }
    async function deletePost(post) {
        const isPublic = tabForPost(post) === "published";
        const lines = [
            "記事を削除します。",
            "",
            `　タイトル：${post.title || "（無題）"}`,
            `　状態：${isPublic ? "公開中" : "下書き（未公開）"}`,
            "",
            isPublic
                ? `この記事はいま公開されています。削除すると、サイトから記事ページごと消えます。\n記事の URL（${post.published_url || publicPostUrl(config, post.slug)}）は「ページが見つかりません（404）」になります。`
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
            if (!res.ok || cancelled)
                return;
            const data = (await res.json());
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
            const data = (await res.json());
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
    return (_jsxs("main", { className: "min-h-screen bg-[rgb(247,247,247)] px-4 pb-24 pt-6", children: [_jsxs("div", { className: "mx-auto max-w-[960px]", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[12px] font-bold tracking-[0.28em] text-foreground/50", children: "BLOG ADMIN" }), _jsx("h1", { className: "mt-2 text-[26px] font-bold leading-tight", children: "\u8A18\u4E8B\u4E00\u89A7" })] }), _jsxs("div", { className: "flex gap-2", children: [isAdmin ? (_jsxs(_Fragment, { children: [headerActions, _jsxs(Link, { href: ADMIN_PATHS.users, className: "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background", children: [_jsx(UsersRound, { size: 18 }), _jsx("span", { className: "sr-only", children: "\u30E6\u30FC\u30B6\u30FC\u7BA1\u7406" })] })] })) : null, _jsx("button", { onClick: refresh, className: "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background", "aria-label": "\u518D\u8AAD\u307F\u8FBC\u307F", children: _jsx(RefreshCw, { size: 18 }) }), _jsx(AdminLogoutButton, {})] })] }), message ? (_jsx("p", { className: "mt-6 rounded-lg border border-border bg-background p-4 text-[13px]", children: message })) : null, _jsx("div", { className: "mt-6 grid grid-cols-2 rounded-lg border border-border bg-background p-1", children: [
                            { value: "published", label: "公開中", count: counts.published },
                            { value: "draft", label: "下書き", count: counts.draft },
                        ].map((tab) => {
                            const isActive = activeTab === tab.value;
                            return (_jsxs("button", { type: "button", onClick: () => setActiveTab(tab.value), className: `flex h-11 items-center justify-center gap-2 rounded-md text-[13px] font-bold ${isActive ? "bg-foreground text-background" : "text-foreground/70"}`, children: [tab.label, _jsx("span", { className: isActive ? "text-background/70" : "text-foreground/45", children: tab.count })] }, tab.value));
                        }) }), _jsxs("div", { className: "mt-4 grid gap-3", children: [!isLoading && visiblePosts.length === 0 ? (_jsx("p", { className: "rounded-lg border border-border bg-background p-4 text-[13px] text-foreground/60", children: activeTab === "published"
                                    ? "公開中の記事はありません。"
                                    : "下書きの記事はありません。" })) : null, visiblePosts.map((post) => (_jsx(Link, { href: editorPath(post.id), className: "rounded-lg border border-border bg-background p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", children: _jsx(FileText, { size: 18 }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-[15px] font-bold", children: post.title }), _jsxs("p", { className: "mt-1 text-[12px] text-foreground/55", children: [post.category_label, " / ", post.date] }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [_jsx("span", { className: "rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold", children: statusLabel(post.status) }), _jsxs("span", { className: "rounded-full bg-muted px-2.5 py-1 text-[11px]", children: ["\u6700\u7D42\u66F4\u65B0: ", new Date(post.updated_at).toLocaleString("ja-JP")] })] })] }), canDelete && (_jsx("button", { type: "button", onClick: (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void deletePost(post);
                                            }, className: "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground/40 hover:text-foreground", "aria-label": "\u8A18\u4E8B\u3092\u524A\u9664", children: _jsx(Trash2, { size: 16 }) }))] }) }, post.id)))] })] }), _jsxs(Link, { href: editorPath(), className: "fixed inset-x-4 bottom-4 mx-auto flex h-12 max-w-[480px] items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background shadow-lg", children: [_jsx(Plus, { size: 18 }), "\u65B0\u898F\u8A18\u4E8B"] }), isLoading ? null : _jsx("div", { className: "h-1" })] }));
}
