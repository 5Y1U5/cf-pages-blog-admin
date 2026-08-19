"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Eye, EyeOff, ImagePlus, Loader2, Plus, Save, Send, Trash2, } from "lucide-react";
import { renderArticleBlock, splitArticleContent } from "../content/article-blocks.js";
import { canEditContent, clientPublishRequirements, publicPostUrl, resolveDefaultCategory, } from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { AdminPasswordPanel } from "./AdminPasswordPanel.js";
import { RichTextEditor } from "./RichTextEditor.js";
import { MAX_UPLOAD_BYTES, formatBytes, prepareImageForUpload, translateUploadError, } from "./lib/admin-image.js";
import { markdownToHtml } from "./lib/admin-markdown.js";
import { ADMIN_API, ADMIN_PATHS, categoryApi, editorPath, postApi, } from "./paths.js";
const EDITOR_MODE_STORAGE_KEY = "admin-editor-mode";
const emptyBody = `## 見出しを入力

本文を入力します。

## まとめ

読者に伝えたいポイントを整理します。`;
function today() {
    return new Date().toISOString().slice(0, 10);
}
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}
function parseList(value) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function parseFaq(value) {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
        const [q, ...answerParts] = line.split("|");
        return { q: q.trim(), a: answerParts.join("|").trim() };
    })
        .filter((item) => item.q && item.a);
}
function stringifyJsonArray(value, fallback = "") {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.join(", ") : fallback;
    }
    catch {
        return fallback;
    }
}
function stringifyFaq(value) {
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
            return "";
        return parsed
            .map((item) => {
            if (typeof item !== "object" || item === null)
                return "";
            const record = item;
            const q = typeof record.q === "string" ? record.q : "";
            const a = typeof record.a === "string" ? record.a : "";
            return q && a ? `${q} | ${a}` : "";
        })
            .filter(Boolean)
            .join("\n");
    }
    catch {
        return "";
    }
}
const PREVIEW_ARTICLE_CSS = `
.admin-article-preview .admin-markdown-preview > *:first-child { margin-top: 0; }
.admin-article-preview .admin-markdown-preview > *:last-child { margin-bottom: 0; }
.admin-article-preview h1 { margin: 0 0 18px; font-size: 24px; line-height: 1.35; font-weight: 800; }
.admin-article-preview h2 { margin: 30px 0 14px; padding-left: 12px; border-left: 4px solid #0f172a; font-size: 22px; line-height: 1.45; font-weight: 800; }
.admin-article-preview h3 { margin: 24px 0 10px; font-size: 18px; line-height: 1.55; font-weight: 800; }
.admin-article-preview p { margin: 0 0 16px; line-height: 2; }
.admin-article-preview ul, .admin-article-preview ol { margin: 0 0 18px; padding-left: 1.5em; line-height: 1.9; }
.admin-article-preview li + li { margin-top: 6px; }
.admin-article-preview img { width: 100%; border-radius: 12px; object-fit: cover; }
.admin-article-preview table { width: 100%; margin: 20px 0 24px; border-collapse: collapse; font-size: 14px; }
.admin-article-preview th, .admin-article-preview td { padding: 12px 14px; text-align: left; border: 1px solid #dde3ec; vertical-align: top; }
.admin-article-preview th { background: #f2f6fb; color: #082f60; font-weight: 800; }
.admin-article-preview blockquote { margin: 22px 0; padding: 16px 18px; border-left: 4px solid #38bdf8; border-radius: 10px; background: #f4f8fb; color: #334155; }
.admin-article-preview .blog-callout { display: flex; align-items: flex-start; gap: 14px; margin: 26px 0; padding: 18px 20px; background: #f4f8fb; border-left: 4px solid #38bdf8; border-radius: 12px; }
.admin-article-preview .blog-callout-icon { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: rgba(56, 189, 248, .16); color: #075985; }
.admin-article-preview .blog-callout-icon svg { width: 18px; height: 18px; }
.admin-article-preview .blog-callout-text { flex: 1; font-size: 14px; line-height: 1.9; }
.admin-article-preview .blog-callout-text strong { display: block; margin-bottom: 4px; color: #0f172a; }
.admin-article-preview .blog-points, .admin-article-preview .blog-compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 26px 0; }
.admin-article-preview .blog-point { padding: 16px 18px; border: 1px solid #dfe6ee; border-radius: 12px; background: #fff; }
.admin-article-preview .blog-point-label { display: block; margin-bottom: 6px; color: #0369a1; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.admin-article-preview .blog-point-text { margin: 0; font-size: 14px; line-height: 1.8; }
.admin-article-preview .blog-compare-card { padding: 16px 18px; border-radius: 12px; background: #f5f6f8; }
.admin-article-preview .blog-compare-card.is-after { background: rgba(56, 189, 248, .1); border: 1px solid rgba(56, 189, 248, .35); }
.admin-article-preview .blog-compare-label { margin-bottom: 6px; font-size: 11px; font-weight: 800; letter-spacing: .12em; color: #64748b; }
.admin-article-preview .blog-compare-card.is-after .blog-compare-label { color: #0369a1; }
.admin-article-preview .blog-compare-text { font-size: 14px; line-height: 1.8; }
.admin-article-preview .blog-stat { margin: 26px 0; padding: 26px 16px; border-radius: 16px; background: #f4f8fb; text-align: center; }
.admin-article-preview .blog-stat-number { display: block; margin-bottom: 6px; color: #0f172a; font-size: 38px; font-weight: 800; line-height: 1.1; }
.admin-article-preview .blog-stat-text { font-size: 13px; color: #64748b; }
.admin-article-preview .blog-faq { margin-top: 38px; padding-top: 28px; border-top: 1px solid #dfe6ee; }
.admin-article-preview .blog-faq h2 { margin: 0 0 18px; }
.admin-article-preview .blog-faq details { margin-bottom: 12px; padding: 16px 20px; border: 1px solid #dfe6ee; border-radius: 12px; }
.admin-article-preview .blog-faq details[open] { border-color: #38bdf8; }
.admin-article-preview .blog-faq summary { cursor: pointer; font-size: 14px; font-weight: 800; }
.admin-article-preview .blog-faq details div { margin-top: 10px; font-size: 14px; line-height: 1.9; color: #475569; }
@media (max-width: 640px) { .admin-article-preview .blog-points, .admin-article-preview .blog-compare { grid-template-columns: 1fr; } }
`;
function statusLabel(status) {
    const labels = {
        draft: "下書き",
        review: "確認待ち",
        approved: "公開準備済み",
        publishing: "公開反映中",
        published: "公開中",
        archived: "非表示",
    };
    return labels[status] || status;
}
function readError(data, fallback) {
    if (typeof data !== "object" || data === null)
        return fallback;
    const record = data;
    return typeof record.message === "string" ? record.message : fallback;
}
const FORBIDDEN_MESSAGE = "権限がありません。この操作は許可されていません。";
const VIEWER_NOTICE = "閲覧専用の権限でログインしています。記事の保存・公開・画像アップロードはできません。";
const VIEWER_BLOCKED = {
    save: "閲覧専用の権限のため保存できません。",
    publish: "閲覧専用の権限のため公開できません。",
    unpublish: "閲覧専用の権限のため公開を取り下げできません。",
    upload: "閲覧専用の権限のため画像をアップロードできません。",
    category: "閲覧専用の権限のためカテゴリを追加できません。",
};
/**
 * 失敗したリクエストの文言を決める。
 * 403 は権限の問題であって入力内容の問題ではないので、必須項目の話にすり替えない
 * （サーバーの forbidden() は message を持たないため、ここで補う）。
 */
function readRequestError(res, data, fallback) {
    return readError(data, res.status === 403 ? FORBIDDEN_MESSAGE : fallback);
}
/** サーバーが返した公開 URL。返っていなければ null。 */
function readPublishedUrl(data) {
    if (typeof data !== "object" || data === null)
        return null;
    const value = data.publishedUrl;
    return typeof value === "string" && value ? value : null;
}
/**
 * 処理は成功したが、付随する作業だけ失敗したときの注意書き。
 * `github.mode: "backup"` のサイトで、控えのコミットに失敗した場合に返る。
 */
function readWarning(data) {
    if (typeof data !== "object" || data === null)
        return null;
    const value = data.warning;
    return typeof value === "string" && value ? value : null;
}
const REQUIREMENT_LABELS = {
    title: "タイトル",
    body: "本文",
    slug: "slug",
    date: "公開日",
    category: "カテゴリ",
};
// 詳細設定（折りたたみ）の中にある項目。未入力のときは折りたたみを開く必要がある。
const ADVANCED_REQUIREMENTS = new Set(["slug", "date", "category"]);
export function AdminEditorClient({ config, router }) {
    const { Link } = router;
    const initialId = router.useSearchParam("id");
    const textareaRef = useRef(null);
    const bodyImageInputRef = useRef(null);
    const heroImageInputRef = useRef(null);
    const richEditorRef = useRef(null);
    const [postId, setPostId] = useState(initialId || "");
    const [categories, setCategories] = useState([]);
    const [tab, setTab] = useState("edit");
    const [editorMode, setEditorMode] = useState("rich");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [message, setMessage] = useState(initialId ? "読み込み中..." : "");
    const [isLoading, setIsLoading] = useState(Boolean(initialId));
    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isUnpublishing, setIsUnpublishing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [deletingCategoryId, setDeletingCategoryId] = useState("");
    const [role, setRole] = useState(null);
    // 発行されたままのパスワードだと、サーバーが保存も公開も 403 で止める。
    // ここでも変更フォームを出して、記事一覧まで戻らずに直せるようにする。
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [date, setDate] = useState(today());
    const [categorySlug, setCategorySlug] = useState("");
    // 記事の区分（お知らせ／ブログ等）。設定していないサイトでは使わない。
    const postTypes = config.content.postTypes;
    const [postType, setPostType] = useState(postTypes[0]?.value ?? "");
    const [categoryLabel, setCategoryLabel] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [heroImageKey, setHeroImageKey] = useState("");
    const [heroImageAlt, setHeroImageAlt] = useState("");
    const [author, setAuthor] = useState(config.defaultAuthor);
    const [authorRole, setAuthorRole] = useState("");
    const [bodyMarkdown, setBodyMarkdown] = useState(emptyBody);
    const [ogDescription, setOgDescription] = useState("");
    const [tagsText, setTagsText] = useState("");
    const [faqText, setFaqText] = useState("");
    const [status, setStatus] = useState("draft");
    const [publishedUrl, setPublishedUrl] = useState("");
    const [newCategorySlug, setNewCategorySlug] = useState("");
    const [newCategoryLabel, setNewCategoryLabel] = useState("");
    const isAdmin = role === "admin";
    // 編集・公開できるのは admin / client_publisher のみ（client_viewer は閲覧専用）。
    // サーバー側 RBAC と一致させ、403 になる操作を押せないようにする。
    const canEdit = canEditContent(role);
    const previewSegments = useMemo(() => splitArticleContent(bodyMarkdown), [bodyMarkdown]);
    // 公開ボタンが押せない理由。location は「その項目が詳細設定の中にあるか」を表す。
    // 詳細設定は折りたたまれているため、中の項目が不足しているときは自動で開く必要がある。
    // slug のようにサーバーが保存時に採番する項目は判定に含めない（clientPublishRequirements）。
    // 含めると、日本語タイトルの新規記事で公開ボタンが永久に押せなくなる。
    const missingFieldEntries = clientPublishRequirements(config)
        .filter((field) => {
        switch (field) {
            case "title":
                return !title.trim();
            case "body":
                return !bodyMarkdown.trim();
            case "slug":
                return !slug.trim();
            case "date":
                return !date.trim();
            case "category":
                return !categorySlug.trim();
            default:
                return false;
        }
    })
        .map((field) => ({
        label: REQUIREMENT_LABELS[field] || field,
        location: ADVANCED_REQUIREMENTS.has(field) ? "advanced" : "main",
    }));
    const missingFields = missingFieldEntries.map((entry) => entry.label);
    // 未保存でも publish() が先に保存してから公開する。
    const canPublish = missingFieldEntries.length === 0;
    const hasMissingInAdvanced = missingFieldEntries.some((entry) => entry.location === "advanced");
    const canUnpublish = status === "published" || Boolean(publishedUrl);
    // マークダウン表示に切り替えた人は次回もその状態で開く。
    useEffect(() => {
        const saved = window.localStorage.getItem(EDITOR_MODE_STORAGE_KEY);
        if (saved === "markdown" || saved === "rich")
            setEditorMode(saved);
    }, []);
    function switchEditorMode(next) {
        setEditorMode(next);
        window.localStorage.setItem(EDITOR_MODE_STORAGE_KEY, next);
    }
    // カテゴリの初期選択。設定の既定カテゴリ（preferredSlugs → defaultSlug → 登録順の先頭）を選ぶ。
    // 公開時にサーバーが自動補完するのと同じ順序なので、初期選択と公開結果が食い違わない。
    //
    // 記事の読み込み後（新規記事は最初から isLoading=false）に一度だけ走らせる。
    // 一度きりにするのは、利用者がカテゴリを未選択に戻したときに勝手に選び直さないため。
    const categoryPresetDoneRef = useRef(false);
    useEffect(() => {
        if (categoryPresetDoneRef.current || isLoading || categories.length === 0)
            return;
        categoryPresetDoneRef.current = true;
        if (categorySlug)
            return;
        const preset = resolveDefaultCategory(config, categories);
        if (!preset)
            return;
        setCategorySlug(preset.slug);
        setCategoryLabel(preset.label);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories, categorySlug, isLoading]);
    // 詳細設定の中に未入力があるまま閉じていると気づけないので、開いた状態にする。
    // 一度自分で閉じた場合まで強制しないよう、開く方向にだけ作用させる。
    useEffect(() => {
        if (canEdit && hasMissingInAdvanced)
            setShowAdvanced(true);
    }, [canEdit, hasMissingInAdvanced]);
    function applyPost(post) {
        setPostId(post.id);
        setTitle(post.title || "");
        setSlug(post.slug || "");
        setDate(post.date || today());
        setCategorySlug(post.category_slug || "");
        if (postTypes.length)
            setPostType(post.post_type || postTypes[0]?.value || "");
        setCategoryLabel(post.category_label || "");
        setExcerpt(post.excerpt || "");
        setHeroImageKey(post.hero_image_key || "");
        setHeroImageAlt(post.hero_image_alt || "");
        setAuthor(post.author || config.defaultAuthor);
        setAuthorRole(post.author_role || "");
        setBodyMarkdown(post.body_markdown || emptyBody);
        setOgDescription(post.og_description || "");
        setTagsText(stringifyJsonArray(post.tags_json));
        setFaqText(stringifyFaq(post.faq_json));
        setStatus(post.status || "draft");
        setPublishedUrl(post.published_url || "");
    }
    async function loadCategories() {
        const res = await fetch(ADMIN_API.categories, { cache: "no-store" });
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (!res.ok) {
            setMessage("カテゴリを取得できませんでした。");
            return;
        }
        const data = (await res.json());
        setCategories(data.categories || []);
        // 初期選択はここでは行わない。記事の読み込みと並行して走るため、
        // 先に読み込んだ記事のカテゴリを上書きしてしまう。下の useEffect に任せる。
    }
    async function loadPost(id) {
        const res = await fetch(postApi(id), { cache: "no-store" });
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (!res.ok) {
            setMessage("記事を取得できませんでした。");
            setIsLoading(false);
            return;
        }
        const data = (await res.json());
        if (data.post)
            applyPost(data.post);
        setMessage("");
        setIsLoading(false);
    }
    useEffect(() => {
        fetch(ADMIN_API.me, { cache: "no-store" })
            .then(async (res) => {
            if (!res.ok)
                return;
            const data = (await res.json());
            setRole(data.user?.role ?? null);
            setMustChangePassword(Boolean(data.mustChangePassword));
        })
            .catch(() => undefined);
        void loadCategories();
        if (initialId) {
            void loadPost(initialId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialId]);
    function buildPayload(nextStatus = "draft") {
        const selectedCategory = categories.find((category) => category.slug === categorySlug);
        const resolvedCategoryLabel = selectedCategory?.label || categoryLabel;
        return {
            title: title.trim(),
            ...(postTypes.length ? { postType } : {}),
            slug: slug.trim() || slugify(title),
            date,
            categorySlug,
            categoryLabel: resolvedCategoryLabel,
            excerpt: excerpt.trim(),
            heroImageKey: heroImageKey.trim() || null,
            heroImageAlt: heroImageAlt.trim() || null,
            author: author.trim() || config.defaultAuthor,
            authorRole: authorRole.trim() || null,
            bodyMarkdown: bodyMarkdown.trim(),
            ogDescription: ogDescription.trim() || null,
            tags: parseList(tagsText),
            faq: parseFaq(faqText),
            status: nextStatus,
        };
    }
    async function save(nextStatus = "draft") {
        if (!canEdit) {
            setMessage(VIEWER_BLOCKED.save);
            return null;
        }
        setIsSaving(true);
        setMessage("");
        const payload = buildPayload(nextStatus);
        const res = await fetch(postId ? postApi(postId) : ADMIN_API.posts, {
            method: postId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({})));
        setIsSaving(false);
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return null;
        }
        if (!res.ok) {
            setMessage(readRequestError(res, data, "保存できませんでした。必須項目を確認してください。"));
            return null;
        }
        if (!postId && typeof data === "object" && data !== null) {
            const record = data;
            if (record.post?.id) {
                setPostId(record.post.id);
                history.replaceState(null, "", editorPath(record.post.id));
            }
            if (record.post?.slug)
                setSlug(record.post.slug);
        }
        setStatus(nextStatus);
        setMessage("下書きを保存しました。");
        return (postId ||
            (typeof data === "object" && data !== null
                ? (data.post?.id ?? null)
                : null));
    }
    async function publish() {
        if (!canEdit) {
            setMessage(VIEWER_BLOCKED.publish);
            return;
        }
        const savedId = await save("approved");
        if (!savedId)
            return;
        setIsPublishing(true);
        setMessage("公開処理を開始しています...");
        const res = await fetch(`${postApi(savedId)}/publish`, { method: "POST" });
        const data = (await res.json().catch(() => ({})));
        setIsPublishing(false);
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (!res.ok) {
            setMessage(readRequestError(res, data, "公開できませんでした。必須項目を確認してください。"));
            return;
        }
        setStatus("publishing");
        // 公開 URL はサーバーが返す publishedUrl を優先する。新規記事で slug がサーバー側で
        // 連番化された場合、setState は非同期なのでクライアントの slug は古く、
        // 組み立て直すと実際の公開先とずれる。
        setPublishedUrl(readPublishedUrl(data) ?? publicPostUrl(config, slug));
        const publishWarning = readWarning(data);
        setMessage(publishWarning
            ? `公開しました。ただし ${publishWarning}`
            : "公開を受け付けました。数分後にサイトへ反映されます。");
    }
    async function unpublish() {
        if (!postId)
            return;
        if (!canEdit) {
            setMessage(VIEWER_BLOCKED.unpublish);
            return;
        }
        setIsUnpublishing(true);
        setMessage("公開取り下げを開始しています...");
        const res = await fetch(`${postApi(postId)}/unpublish`, { method: "POST" });
        const data = (await res.json().catch(() => ({})));
        setIsUnpublishing(false);
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (!res.ok) {
            setMessage(readRequestError(res, data, "公開を取り下げできませんでした。時間をおいて再度お試しください。"));
            return;
        }
        setStatus("draft");
        setPublishedUrl("");
        const unpublishWarning = readWarning(data);
        setMessage(unpublishWarning
            ? `公開を取り下げました。ただし ${unpublishWarning}`
            : "公開取り下げを受け付けました。数分後にサイトから非表示になります。");
    }
    function insertMarkdown(text) {
        const textarea = textareaRef.current;
        if (!textarea) {
            setBodyMarkdown((current) => `${current}\n\n${text}`);
            return;
        }
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        setBodyMarkdown((current) => `${current.slice(0, start)}${text}${current.slice(end)}`);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    }
    async function uploadImage(file, target) {
        if (!canEdit) {
            setMessage(VIEWER_BLOCKED.upload);
            return;
        }
        setIsUploading(true);
        setMessage("写真を最適化しています…");
        // そのまま送らず、長辺1600px・WebP へ縮小してから送る
        const prepared = await prepareImageForUpload(file);
        // HEIC など、この端末で JPEG/WebP に変換できなかった形式はサーバーに送っても
        // 拒否されるだけなので、送る前に理由を日本語で伝える
        if (prepared.blockedReason) {
            setIsUploading(false);
            setMessage(prepared.blockedReason);
            return;
        }
        if (prepared.file.size > MAX_UPLOAD_BYTES) {
            setIsUploading(false);
            setMessage(`この写真は ${formatBytes(prepared.file.size)} あり、アップロードの上限（${formatBytes(MAX_UPLOAD_BYTES)}）を超えています。別の写真をお試しください。`);
            return;
        }
        const optimizedNote = prepared.changed
            ? `（${formatBytes(prepared.originalSize)} → ${formatBytes(prepared.file.size)} に自動縮小）`
            : "";
        const formData = new FormData();
        formData.append("file", prepared.file);
        if (postId)
            formData.append("postId", postId);
        if (heroImageAlt)
            formData.append("alt", heroImageAlt);
        const res = await fetch(ADMIN_API.assetUpload, { method: "POST", body: formData });
        const data = (await res.json().catch(() => ({})));
        setIsUploading(false);
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (res.status === 403) {
            setMessage(FORBIDDEN_MESSAGE);
            return;
        }
        if (!res.ok || !data.asset?.publicPath) {
            setMessage(translateUploadError(data.message));
            return;
        }
        const alt = heroImageAlt || data.asset.alt || title || "記事画像";
        if (target === "hero") {
            setHeroImageKey(data.asset.publicPath);
            setHeroImageAlt(alt);
            setMessage(`アイキャッチ画像を設定しました。${optimizedNote}`);
            return;
        }
        if (editorMode === "rich") {
            richEditorRef.current?.insertImage(data.asset.publicPath, alt);
        }
        else {
            insertMarkdown(`\n\n![${alt}](${data.asset.publicPath})\n\n`);
        }
        if (!heroImageKey) {
            setHeroImageKey(data.asset.publicPath);
            setHeroImageAlt(alt);
        }
        setMessage(`画像を本文へ挿入しました。${optimizedNote}`);
    }
    async function addCategory() {
        if (!canEdit) {
            setMessage(VIEWER_BLOCKED.category);
            return;
        }
        const slugValue = newCategorySlug.trim() || slugify(newCategoryLabel);
        if (!slugValue || !newCategoryLabel.trim()) {
            setMessage("新規カテゴリの slug と表示名を入力してください。");
            return;
        }
        setMessage("");
        const res = await fetch(ADMIN_API.categories, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: slugValue, label: newCategoryLabel.trim() }),
        });
        const data = (await res.json().catch(() => ({})));
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (res.status === 403) {
            setMessage(FORBIDDEN_MESSAGE);
            return;
        }
        if (!res.ok || !data.category) {
            setMessage(data.message || "カテゴリを追加できませんでした。");
            return;
        }
        setCategories((current) => {
            const filtered = current.filter((category) => category.slug !== data.category?.slug);
            return [...filtered, data.category];
        });
        setCategorySlug(data.category.slug);
        setCategoryLabel(data.category.label);
        setNewCategorySlug("");
        setNewCategoryLabel("");
        setMessage("カテゴリを追加しました。");
    }
    async function deleteCategory(category) {
        if (!window.confirm(`カテゴリ「${category.label}」を削除します。\n\nこのカテゴリを使っている記事は削除されませんが、次に公開したときのカテゴリ表示が変わることがあります。\n\n削除しますか？`)) {
            return;
        }
        setDeletingCategoryId(category.id);
        setMessage("");
        const res = await fetch(categoryApi(category.id), { method: "DELETE" });
        const data = (await res.json().catch(() => ({})));
        setDeletingCategoryId("");
        if (res.status === 401) {
            location.href = ADMIN_PATHS.login;
            return;
        }
        if (res.status === 403) {
            setMessage(FORBIDDEN_MESSAGE);
            return;
        }
        if (!res.ok) {
            setMessage(data.message || "カテゴリを削除できませんでした。");
            return;
        }
        setCategories((current) => current.filter((item) => item.id !== category.id));
        if (categorySlug === category.slug) {
            setCategorySlug("");
            setCategoryLabel("");
        }
        setMessage("カテゴリを削除しました。");
    }
    const headerStatus = isLoading ? "読み込み中" : statusLabel(status);
    return (_jsxs("main", { className: "min-h-screen bg-[rgb(247,247,247)] pb-28", children: [_jsx("header", { className: "sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur", children: _jsxs("div", { className: "mx-auto flex max-w-[1180px] items-center justify-between gap-3", children: [_jsxs(Link, { href: ADMIN_PATHS.posts, className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border", children: [_jsx(ArrowLeft, { size: 18 }), _jsx("span", { className: "sr-only", children: "\u8A18\u4E8B\u4E00\u89A7\u3078\u623B\u308B" })] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-[13px] font-bold", children: title || "新規記事" }), _jsx("p", { className: "text-[11px] text-foreground/55", children: headerStatus })] }), _jsx(AdminLogoutButton, { className: "h-10 w-10 shrink-0" }), _jsxs("div", { className: "hidden gap-2 md:flex", children: [_jsxs("button", { type: "button", onClick: () => void save("draft"), disabled: !canEdit || isSaving || isLoading || isUnpublishing, title: canEdit ? "下書きを保存する" : VIEWER_NOTICE, className: "flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold disabled:opacity-50", children: [isSaving ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Save, { size: 16 }), "\u4FDD\u5B58"] }), canUnpublish && (_jsxs("button", { type: "button", onClick: () => void unpublish(), disabled: !canEdit || isUnpublishing || isPublishing || isSaving, title: canEdit ? "公開を取り下げる" : VIEWER_NOTICE, className: "flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground/75 disabled:opacity-50", children: [isUnpublishing ? (_jsx(Loader2, { className: "animate-spin", size: 16 })) : (_jsx(EyeOff, { size: 16 })), "\u53D6\u308A\u4E0B\u3052"] })), canEdit && !canPublish && missingFields.length > 0 && (_jsxs("span", { className: "hidden max-w-[260px] text-[11px] leading-tight text-amber-600 md:inline", children: ["\u516C\u958B\u306B\u306F\u672A\u5165\u529B\u3042\u308A\uFF1A", missingFields.join("・")] })), _jsxs("button", { type: "button", onClick: () => void publish(), disabled: !canEdit || !canPublish || isPublishing || isSaving || isUnpublishing, title: publishButtonTitle(canEdit, canPublish, missingFields), className: "flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-bold text-background disabled:opacity-40", children: [isPublishing ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Send, { size: 16 }), "\u516C\u958B"] })] })] }) }), !canEdit && (_jsx("div", { className: "border-b border-border bg-muted px-4 py-2 text-center text-[13px] font-bold text-foreground/75", children: VIEWER_NOTICE })), _jsxs("div", { className: "mx-auto grid max-w-[1180px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px]", children: [_jsxs("section", { className: "min-w-0", children: [_jsxs("div", { className: "mb-4 grid grid-cols-2 rounded-lg border border-border bg-background p-1", children: [_jsxs("button", { type: "button", onClick: () => setTab("edit"), className: `flex h-10 items-center justify-center gap-2 rounded-md text-[13px] font-bold ${tab === "edit" ? "bg-foreground text-background" : "text-foreground/70"}`, children: [_jsx(Check, { size: 16 }), "\u7DE8\u96C6"] }), _jsxs("button", { type: "button", onClick: () => setTab("preview"), className: `flex h-10 items-center justify-center gap-2 rounded-md text-[13px] font-bold ${tab === "preview" ? "bg-foreground text-background" : "text-foreground/70"}`, children: [_jsx(Eye, { size: 16 }), "\u30D7\u30EC\u30D3\u30E5\u30FC"] })] }), message ? (_jsx("p", { className: "mb-4 rounded-lg border border-border bg-background p-3 text-[13px]", children: message })) : null, tab === "edit" ? (_jsxs("div", { className: "grid gap-4", children: [_jsxs("p", { className: "rounded-lg border border-dashed border-border bg-background p-3 text-[12px] leading-5 text-foreground/65", children: ["\u516C\u958B\u306B\u5FC5\u8981\u306A\u306E\u306F\u300C", missingRequirementNames(config), "\u300D\u3060\u3051\u3067\u3059\u3002\u305D\u308C\u4EE5\u5916\u306F\u672A\u5165\u529B\u3067\u3082\u3001\u516C\u958B\u6642\u306B\u81EA\u52D5\u3067\u8A2D\u5B9A\u3055\u308C\u307E\u3059\uFF08\u53F3\u5074\u306E\u300C\u8A73\u7D30\u8A2D\u5B9A\u300D\u3067\u500B\u5225\u306B\u6307\u5B9A\u3059\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059\uFF09\u3002"] }), canEdit && !canPublish && missingFields.length > 0 && (_jsxs("p", { className: "rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] font-bold leading-5 text-amber-700 md:hidden", children: ["\u516C\u958B\u3059\u308B\u306B\u306F\u300C", missingFields.join("」「"), "\u300D\u306E\u5165\u529B\u304C\u5FC5\u8981\u3067\u3059\u3002"] })), _jsxs("label", { className: "block text-[13px] font-bold", children: ["\u30BF\u30A4\u30C8\u30EB", _jsx("input", { value: title, onChange: (event) => {
                                                    setTitle(event.target.value);
                                                    if (!postId)
                                                        setSlug(slugify(event.target.value));
                                                }, readOnly: !canEdit, className: "mt-2 h-12 w-full rounded-lg border border-border bg-background px-3 text-[16px] outline-none focus:border-foreground", placeholder: "\u8A18\u4E8B\u30BF\u30A4\u30C8\u30EB" })] }), _jsxs("div", { className: "text-[13px] font-bold", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("span", { children: "\u672C\u6587" }), _jsx("button", { type: "button", onClick: () => switchEditorMode(editorMode === "rich" ? "markdown" : "rich"), 
                                                        // 閲覧専用でも、マークダウン原文を見たい人はいるので切り替えは残す
                                                        className: "text-[12px] font-bold text-foreground/55 underline underline-offset-2", children: editorMode === "rich" ? "マークダウンで編集" : "通常の編集に戻す" })] }), editorMode === "rich" ? (_jsx(RichTextEditor, { ref: richEditorRef, markdown: bodyMarkdown, onChange: setBodyMarkdown, onRequestImage: () => bodyImageInputRef.current?.click(), editable: canEdit })) : (_jsx("textarea", { ref: textareaRef, value: bodyMarkdown, onChange: (event) => setBodyMarkdown(event.target.value), readOnly: !canEdit, className: "mt-2 min-h-[460px] w-full rounded-lg border border-border bg-background px-3 py-3 font-mono text-[15px] leading-7 outline-none focus:border-foreground", spellCheck: false }))] })] })) : (_jsxs("article", { className: "rounded-lg border border-border bg-background px-4 py-5 sm:px-6", children: [_jsx("p", { className: "text-[12px] font-bold text-foreground/55", children: categoryLabel || "カテゴリ未設定" }), _jsx("h1", { className: "mt-2 text-[26px] font-bold leading-tight", children: title || "記事タイトル" }), _jsx("p", { className: "mt-2 text-[13px] text-foreground/55", children: date }), heroImageKey ? (_jsx("img", { src: heroImageKey, alt: heroImageAlt || "", className: "mt-5 aspect-[16/9] w-full rounded-lg object-cover" })) : null, excerpt ? (_jsx("p", { className: "mt-5 text-[15px] font-bold leading-7", children: excerpt })) : null, _jsx("style", { children: PREVIEW_ARTICLE_CSS }), _jsx("div", { className: "admin-article-preview mt-7 text-[15px] leading-8", children: previewSegments.map((segment, index) => segment.kind === "block" ? (_jsx("div", { dangerouslySetInnerHTML: { __html: renderArticleBlock(segment) } }, `block-${index}`)) : (_jsx("div", { className: "admin-markdown-preview", dangerouslySetInnerHTML: { __html: markdownToHtml(segment.text) } }, `markdown-${index}`))) })] }))] }), _jsxs("aside", { className: "grid gap-4 self-start lg:sticky lg:top-[76px]", children: [postTypes.length > 1 && (_jsxs("section", { className: "rounded-lg border border-border bg-background p-4", children: [_jsx("p", { className: "text-[12px] font-bold tracking-wide text-foreground/55", children: "\u3053\u306E\u8A18\u4E8B\u306E\u533A\u5206" }), _jsx("p", { className: "mt-1 text-[12px] leading-5 text-foreground/55", children: "\u9078\u3093\u3060\u533A\u5206\u306B\u3088\u3063\u3066\u3001\u516C\u958B\u5148\u306E\u30DA\u30FC\u30B8\u3068 URL \u304C\u5909\u308F\u308A\u307E\u3059\u3002" }), _jsx("div", { className: "mt-3 grid gap-2", children: postTypes.map((type) => (_jsxs("label", { className: `flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px] ${postType === type.value
                                                ? "border-foreground bg-muted font-bold"
                                                : "border-border"}`, children: [_jsx("input", { type: "radio", name: "post-type", value: type.value, checked: postType === type.value, onChange: () => setPostType(type.value), disabled: !canEdit }), _jsx("span", { children: type.label }), _jsx("span", { className: "ml-auto text-[11px] text-foreground/45", children: type.publicPathPrefix })] }, type.value))) })] })), _jsxs("section", { className: "rounded-lg border border-border bg-background p-4", children: [_jsxs("button", { type: "button", onClick: () => setShowAdvanced((value) => !value), className: "flex w-full items-center justify-between gap-2 text-left text-[14px] font-bold", "aria-expanded": showAdvanced, children: [_jsxs("span", { className: "flex items-center gap-2", children: ["\u8A73\u7D30\u8A2D\u5B9A\uFF08\u4EFB\u610F\uFF09", canEdit && hasMissingInAdvanced && (_jsx("span", { className: "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700", children: "\u672A\u5165\u529B\u3042\u308A" }))] }), _jsx(ChevronDown, { size: 18, className: `transition-transform ${showAdvanced ? "rotate-180" : ""}` })] }), _jsx("p", { className: "mt-2 text-[12px] leading-5 text-foreground/55", children: "slug\u30FB\u30AB\u30C6\u30B4\u30EA\u30FB\u8981\u7D04\u30FB\u8457\u8005\u30FBSEO \u306A\u3069\u306F\u672A\u5165\u529B\u3067\u3082\u3001\u516C\u958B\u6642\u306B\u81EA\u52D5\u3067\u8A2D\u5B9A\u3055\u308C\u307E\u3059\u3002\u6307\u5B9A\u3057\u305F\u3044\u5834\u5408\u3060\u3051\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002" })] }), showAdvanced ? (_jsxs("section", { className: "rounded-lg border border-border bg-background p-4", children: [_jsx("h2", { className: "text-[14px] font-bold", children: "\u516C\u958B\u8A2D\u5B9A" }), _jsxs("div", { className: "mt-4 grid gap-4", children: [_jsxs("label", { className: "block text-[12px] font-bold", children: ["slug", _jsx("input", { value: slug, onChange: (event) => setSlug(event.target.value), disabled: Boolean(postId) || !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px] disabled:bg-muted disabled:text-foreground/55" })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["\u516C\u958B\u65E5", _jsx("input", { value: date, onChange: (event) => setDate(event.target.value), type: "date", disabled: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]" })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["\u30AB\u30C6\u30B4\u30EA", _jsxs("select", { value: categorySlug, onChange: (event) => {
                                                            const next = categories.find((category) => category.slug === event.target.value);
                                                            setCategorySlug(event.target.value);
                                                            setCategoryLabel(next?.label || "");
                                                        }, disabled: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]", children: [_jsx("option", { value: "", children: "\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" }), categories.map((category) => (_jsx("option", { value: category.slug, children: category.label }, category.id || category.slug)))] })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["\u8981\u7D04\uFF08\u4EFB\u610F\u30FB\u672A\u5165\u529B\u306A\u3089\u672C\u6587\u304B\u3089\u81EA\u52D5\u4F5C\u6210\uFF09", _jsx("textarea", { value: excerpt, onChange: (event) => setExcerpt(event.target.value), readOnly: !canEdit, className: "mt-2 min-h-[96px] w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] leading-6" })] })] })] })) : null, _jsxs("section", { className: "rounded-lg border border-border bg-background p-4", children: [_jsx("h2", { className: "text-[14px] font-bold", children: "\u5199\u771F" }), _jsx("input", { ref: heroImageInputRef, type: "file", accept: "image/*", className: "hidden", onChange: (event) => {
                                            const file = event.target.files?.[0];
                                            if (file)
                                                void uploadImage(file, "hero");
                                            event.target.value = "";
                                        } }), _jsx("input", { ref: bodyImageInputRef, type: "file", accept: "image/*", className: "hidden", onChange: (event) => {
                                            const file = event.target.files?.[0];
                                            if (file)
                                                void uploadImage(file, "body");
                                            event.target.value = "";
                                        } }), heroImageKey ? (_jsx("img", { src: heroImageKey, alt: heroImageAlt || "", className: "mt-4 aspect-[16/9] w-full rounded-lg border border-border object-cover" })) : (_jsx("div", { className: "mt-4 flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-[12px] font-bold text-foreground/45", children: "\u30A2\u30A4\u30AD\u30E3\u30C3\u30C1\u672A\u8A2D\u5B9A" })), _jsxs("button", { type: "button", onClick: () => heroImageInputRef.current?.click(), disabled: !canEdit || isUploading, title: canEdit ? undefined : VIEWER_NOTICE, className: "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-bold text-background disabled:opacity-50", children: [isUploading ? (_jsx(Loader2, { className: "animate-spin", size: 16 })) : (_jsx(ImagePlus, { size: 16 })), "\u30A2\u30A4\u30AD\u30E3\u30C3\u30C1\u753B\u50CF\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9"] }), _jsxs("button", { type: "button", onClick: () => bodyImageInputRef.current?.click(), disabled: !canEdit || isUploading, title: canEdit ? undefined : VIEWER_NOTICE, className: "mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-bold disabled:opacity-50", children: [isUploading ? (_jsx(Loader2, { className: "animate-spin", size: 16 })) : (_jsx(ImagePlus, { size: 16 })), "\u672C\u6587\u306B\u753B\u50CF\u3092\u633F\u5165"] }), _jsxs("label", { className: "mt-4 block text-[12px] font-bold", children: ["\u753B\u50CF\u30D1\u30B9", _jsx("input", { value: heroImageKey, onChange: (event) => setHeroImageKey(event.target.value), readOnly: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-muted px-3 text-[13px] text-foreground/65", placeholder: "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3059\u308B\u3068\u81EA\u52D5\u3067\u5165\u308A\u307E\u3059" })] }), _jsxs("label", { className: "mt-4 block text-[12px] font-bold", children: ["\u753B\u50CF\u8AAC\u660E", _jsx("input", { value: heroImageAlt, onChange: (event) => setHeroImageAlt(event.target.value), readOnly: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]" })] })] }), showAdvanced ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "rounded-lg border border-border bg-background p-4", children: [_jsx("h2", { className: "text-[14px] font-bold", children: "\u65B0\u898F\u30AB\u30C6\u30B4\u30EA" }), _jsxs("div", { className: "mt-4 grid gap-3", children: [_jsx("input", { value: newCategoryLabel, onChange: (event) => {
                                                            setNewCategoryLabel(event.target.value);
                                                            if (!newCategorySlug)
                                                                setNewCategorySlug(slugify(event.target.value));
                                                        }, readOnly: !canEdit, className: "h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]", placeholder: "\u8868\u793A\u540D" }), _jsx("input", { value: newCategorySlug, onChange: (event) => setNewCategorySlug(event.target.value), readOnly: !canEdit, className: "h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]", placeholder: "slug" }), _jsxs("button", { type: "button", onClick: () => void addCategory(), disabled: !canEdit, title: canEdit ? undefined : VIEWER_NOTICE, className: "flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-bold disabled:opacity-50", children: [_jsx(Plus, { size: 16 }), "\u8FFD\u52A0"] })] }), _jsxs("div", { className: "mt-5 border-t border-border pt-4", children: [_jsx("p", { className: "text-[12px] font-bold text-foreground/55", children: "\u73FE\u5728\u306E\u30AB\u30C6\u30B4\u30EA" }), _jsx("div", { className: "mt-3 grid gap-2", children: categories.map((category) => (_jsxs("div", { className: "flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-[13px] font-bold", children: category.label }), _jsx("p", { className: "truncate text-[11px] text-foreground/45", children: category.slug })] }), isAdmin ? (_jsx("button", { type: "button", onClick: () => void deleteCategory(category), disabled: deletingCategoryId === category.id, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground/65 disabled:opacity-40", "aria-label": `${category.label}を削除`, children: deletingCategoryId === category.id ? (_jsx(Loader2, { className: "animate-spin", size: 15 })) : (_jsx(Trash2, { size: 15 })) })) : null] }, category.id || category.slug))) })] })] }), _jsxs("section", { className: "rounded-lg border border-border bg-background p-4", children: [_jsx("h2", { className: "text-[14px] font-bold", children: "SEO / \u88DC\u8DB3" }), _jsxs("div", { className: "mt-4 grid gap-4", children: [_jsxs("label", { className: "block text-[12px] font-bold", children: ["\u8457\u8005", _jsx("input", { value: author, onChange: (event) => setAuthor(event.target.value), readOnly: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]" })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["\u8457\u8005\u80A9\u66F8\u304D", _jsx("input", { value: authorRole, onChange: (event) => setAuthorRole(event.target.value), readOnly: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]" })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["OG\u8AAC\u660E", _jsx("textarea", { value: ogDescription, onChange: (event) => setOgDescription(event.target.value), readOnly: !canEdit, className: "mt-2 min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] leading-6" })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["\u30BF\u30B0\uFF08\u30AB\u30F3\u30DE\u533A\u5207\u308A\uFF09", _jsx("input", { value: tagsText, onChange: (event) => setTagsText(event.target.value), readOnly: !canEdit, className: "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]" })] }), _jsxs("label", { className: "block text-[12px] font-bold", children: ["FAQ\uFF081\u884C\u306B\u300C\u8CEA\u554F | \u56DE\u7B54\u300D\uFF09", _jsx("textarea", { value: faqText, onChange: (event) => setFaqText(event.target.value), readOnly: !canEdit, className: "mt-2 min-h-[112px] w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] leading-6" })] })] })] })] })) : null] })] }), _jsx("nav", { className: "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 py-3 md:hidden", children: _jsxs("div", { className: `mx-auto grid max-w-[520px] gap-3 ${canUnpublish ? "grid-cols-3" : "grid-cols-2"}`, children: [_jsxs("button", { type: "button", onClick: () => void save("draft"), disabled: !canEdit || isSaving || isLoading || isUnpublishing, title: canEdit ? undefined : VIEWER_NOTICE, className: "flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-bold disabled:opacity-50", children: [isSaving ? _jsx(Loader2, { className: "animate-spin", size: 17 }) : _jsx(Save, { size: 17 }), "\u4FDD\u5B58"] }), canUnpublish && (_jsxs("button", { type: "button", onClick: () => void unpublish(), disabled: !canEdit || isUnpublishing || isPublishing || isSaving, title: canEdit ? undefined : VIEWER_NOTICE, className: "flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-bold disabled:opacity-50", children: [isUnpublishing ? (_jsx(Loader2, { className: "animate-spin", size: 17 })) : (_jsx(EyeOff, { size: 17 })), "\u53D6\u308A\u4E0B\u3052"] })), _jsxs("button", { type: "button", onClick: () => void publish(), disabled: !canEdit || !canPublish || isPublishing || isSaving || isUnpublishing, title: publishButtonTitle(canEdit, canPublish, missingFields), className: "flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground text-[14px] font-bold text-background disabled:opacity-40", children: [isPublishing ? _jsx(Loader2, { className: "animate-spin", size: 17 }) : _jsx(Send, { size: 17 }), "\u516C\u958B"] })] }) }), mustChangePassword ? (_jsx(AdminPasswordPanel, { required: true, onDone: () => {
                    setMustChangePassword(false);
                    location.reload();
                } })) : null] }));
}
/** 公開ボタンの title。押せないときは、その理由（権限か未入力か）を出す。 */
function publishButtonTitle(canEdit, canPublish, missingFields) {
    if (!canEdit)
        return VIEWER_NOTICE;
    if (canPublish)
        return "公開する";
    return `公開には次の入力が必要です：${missingFields.join("・")}`;
}
/**
 * 案内文に出す「公開に必要な項目」の並び。
 * 利用者が自分で入力する項目だけを出す（サーバーが自動採番する slug は出さない）。
 */
function missingRequirementNames(config) {
    return clientPublishRequirements(config)
        .map((field) => REQUIREMENT_LABELS[field] || field)
        .join("」「");
}
