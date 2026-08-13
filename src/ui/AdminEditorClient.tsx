"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";

import type { AdminRole, BlogAdminConfig } from "../config/index.js";
import {
  canEditContent,
  clientPublishRequirements,
  publicPostUrl,
  resolveDefaultCategory,
} from "../config/index.js";
import { AdminLogoutButton } from "./AdminLogoutButton.js";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor.js";
import {
  MAX_UPLOAD_BYTES,
  formatBytes,
  prepareImageForUpload,
  translateUploadError,
} from "./lib/admin-image.js";
import {
  ADMIN_API,
  ADMIN_PATHS,
  categoryApi,
  editorPath,
  postApi,
} from "./paths.js";
import type { AdminRouter } from "./router.js";

interface AdminCategory {
  id: string;
  code: string;
  slug: string;
  label: string;
}

interface AdminPost {
  id: string;
  slug: string;
  title: string;
  date: string;
  category_slug: string;
  category_label: string;
  excerpt: string;
  hero_image_key: string | null;
  hero_image_alt: string | null;
  author: string;
  author_role: string | null;
  body_markdown: string;
  og_description: string | null;
  tags_json: string;
  faq_json: string;
  status: string;
  published_url: string | null;
}

interface SavePayload {
  title: string;
  slug?: string;
  date: string;
  categorySlug: string;
  categoryLabel: string;
  excerpt: string;
  heroImageKey: string | null;
  heroImageAlt: string | null;
  author: string;
  authorRole: string | null;
  bodyMarkdown: string;
  ogDescription: string | null;
  tags: string[];
  faq: { q: string; a: string }[];
  status: "draft" | "review" | "approved" | "archived";
}

type EditorTab = "edit" | "preview";
// 既定はリッチエディタ。マークダウン表示は、原文を直接直したいときのための切り替え。
type EditorMode = "rich" | "markdown";

const EDITOR_MODE_STORAGE_KEY = "admin-editor-mode";

const emptyBody = `## 見出しを入力

本文を入力します。

## まとめ

読者に伝えたいポイントを整理します。`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFaq(value: string): { q: string; a: string }[] {
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

function stringifyJsonArray(value: string, fallback = ""): string {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(", ") : fallback;
  } catch {
    return fallback;
  }
}

function stringifyFaq(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return "";
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return "";
        const record = item as Record<string, unknown>;
        const q = typeof record.q === "string" ? record.q : "";
        const a = typeof record.a === "string" ? record.a : "";
        return q && a ? `${q} | ${a}` : "";
      })
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function markdownPreview(
  markdown: string
): { kind: string; text: string; src?: string; alt?: string }[] {
  return markdown
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      const image = line.match(/^!\[(.*)]\((.*)\)$/);
      if (image) {
        return { kind: "image", text: "", alt: image[1] || "", src: image[2] || "" };
      }
      if (line.startsWith("### ")) return { kind: "h3", text: line.replace(/^### /, "") };
      if (line.startsWith("## ")) return { kind: "h2", text: line.replace(/^## /, "") };
      if (line.startsWith("# ")) return { kind: "h1", text: line.replace(/^# /, "") };
      if (line.startsWith("- ")) return { kind: "li", text: line.replace(/^- /, "") };
      return { kind: "p", text: line };
    });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "下書き",
    review: "確認待ち",
    approved: "公開準備済み",
    publishing: "公開反映中",
    published: "公開中",
    archived: "非表示",
  };
  return labels[status] || status;
}

function readError(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null) return fallback;
  const record = data as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : fallback;
}

const FORBIDDEN_MESSAGE = "権限がありません。この操作は許可されていません。";
const VIEWER_NOTICE =
  "閲覧専用の権限でログインしています。記事の保存・公開・画像アップロードはできません。";
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
function readRequestError(res: Response, data: unknown, fallback: string): string {
  return readError(data, res.status === 403 ? FORBIDDEN_MESSAGE : fallback);
}

/** サーバーが返した公開 URL。返っていなければ null。 */
function readPublishedUrl(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const value = (data as Record<string, unknown>).publishedUrl;
  return typeof value === "string" && value ? value : null;
}

/**
 * 処理は成功したが、付随する作業だけ失敗したときの注意書き。
 * `github.mode: "backup"` のサイトで、控えのコミットに失敗した場合に返る。
 */
function readWarning(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const value = (data as Record<string, unknown>).warning;
  return typeof value === "string" && value ? value : null;
}

const REQUIREMENT_LABELS: Record<string, string> = {
  title: "タイトル",
  body: "本文",
  slug: "slug",
  date: "公開日",
  category: "カテゴリ",
};

// 詳細設定（折りたたみ）の中にある項目。未入力のときは折りたたみを開く必要がある。
const ADVANCED_REQUIREMENTS = new Set(["slug", "date", "category"]);

export interface AdminEditorClientProps {
  config: BlogAdminConfig;
  router: AdminRouter;
}

export function AdminEditorClient({ config, router }: AdminEditorClientProps) {
  const { Link } = router;
  const initialId = router.useSearchParam("id");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyImageInputRef = useRef<HTMLInputElement | null>(null);
  const heroImageInputRef = useRef<HTMLInputElement | null>(null);
  const richEditorRef = useRef<RichTextEditorHandle | null>(null);

  const [postId, setPostId] = useState(initialId || "");
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [tab, setTab] = useState<EditorTab>("edit");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState(initialId ? "読み込み中..." : "");
  const [isLoading, setIsLoading] = useState(Boolean(initialId));
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState("");
  const [role, setRole] = useState<AdminRole | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [date, setDate] = useState(today());
  const [categorySlug, setCategorySlug] = useState("");
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
  const previewBlocks = useMemo(() => markdownPreview(bodyMarkdown), [bodyMarkdown]);

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
      location: ADVANCED_REQUIREMENTS.has(field) ? ("advanced" as const) : ("main" as const),
    }));
  const missingFields = missingFieldEntries.map((entry) => entry.label);
  // 未保存でも publish() が先に保存してから公開する。
  const canPublish = missingFieldEntries.length === 0;
  const hasMissingInAdvanced = missingFieldEntries.some(
    (entry) => entry.location === "advanced"
  );
  const canUnpublish = status === "published" || Boolean(publishedUrl);

  // マークダウン表示に切り替えた人は次回もその状態で開く。
  useEffect(() => {
    const saved = window.localStorage.getItem(EDITOR_MODE_STORAGE_KEY);
    if (saved === "markdown" || saved === "rich") setEditorMode(saved);
  }, []);

  function switchEditorMode(next: EditorMode) {
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
    if (categoryPresetDoneRef.current || isLoading || categories.length === 0) return;
    categoryPresetDoneRef.current = true;
    if (categorySlug) return;
    const preset = resolveDefaultCategory(config, categories);
    if (!preset) return;
    setCategorySlug(preset.slug);
    setCategoryLabel(preset.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categorySlug, isLoading]);

  // 詳細設定の中に未入力があるまま閉じていると気づけないので、開いた状態にする。
  // 一度自分で閉じた場合まで強制しないよう、開く方向にだけ作用させる。
  useEffect(() => {
    if (canEdit && hasMissingInAdvanced) setShowAdvanced(true);
  }, [canEdit, hasMissingInAdvanced]);

  function applyPost(post: AdminPost) {
    setPostId(post.id);
    setTitle(post.title || "");
    setSlug(post.slug || "");
    setDate(post.date || today());
    setCategorySlug(post.category_slug || "");
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
    const data = (await res.json()) as { categories?: AdminCategory[] };
    setCategories(data.categories || []);
    // 初期選択はここでは行わない。記事の読み込みと並行して走るため、
    // 先に読み込んだ記事のカテゴリを上書きしてしまう。下の useEffect に任せる。
  }

  async function loadPost(id: string) {
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
    const data = (await res.json()) as { post?: AdminPost };
    if (data.post) applyPost(data.post);
    setMessage("");
    setIsLoading(false);
  }

  useEffect(() => {
    fetch(ADMIN_API.me, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { user?: { role?: AdminRole } };
        setRole(data.user?.role ?? null);
      })
      .catch(() => undefined);
    void loadCategories();
    if (initialId) {
      void loadPost(initialId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  function buildPayload(nextStatus: SavePayload["status"] = "draft"): SavePayload {
    const selectedCategory = categories.find((category) => category.slug === categorySlug);
    const resolvedCategoryLabel = selectedCategory?.label || categoryLabel;
    return {
      title: title.trim(),
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

  async function save(nextStatus: SavePayload["status"] = "draft"): Promise<string | null> {
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
    const data = (await res.json().catch(() => ({}))) as unknown;
    setIsSaving(false);

    if (res.status === 401) {
      location.href = ADMIN_PATHS.login;
      return null;
    }
    if (!res.ok) {
      setMessage(
        readRequestError(res, data, "保存できませんでした。必須項目を確認してください。")
      );
      return null;
    }
    if (!postId && typeof data === "object" && data !== null) {
      const record = data as { post?: { id?: string; slug?: string } };
      if (record.post?.id) {
        setPostId(record.post.id);
        history.replaceState(null, "", editorPath(record.post.id));
      }
      if (record.post?.slug) setSlug(record.post.slug);
    }
    setStatus(nextStatus);
    setMessage("下書きを保存しました。");
    return (
      postId ||
      (typeof data === "object" && data !== null
        ? ((data as { post?: { id?: string } }).post?.id ?? null)
        : null)
    );
  }

  async function publish() {
    if (!canEdit) {
      setMessage(VIEWER_BLOCKED.publish);
      return;
    }
    const savedId = await save("approved");
    if (!savedId) return;
    setIsPublishing(true);
    setMessage("公開処理を開始しています...");
    const res = await fetch(`${postApi(savedId)}/publish`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    setIsPublishing(false);

    if (res.status === 401) {
      location.href = ADMIN_PATHS.login;
      return;
    }
    if (!res.ok) {
      setMessage(
        readRequestError(res, data, "公開できませんでした。必須項目を確認してください。")
      );
      return;
    }
    setStatus("publishing");
    // 公開 URL はサーバーが返す publishedUrl を優先する。新規記事で slug がサーバー側で
    // 連番化された場合、setState は非同期なのでクライアントの slug は古く、
    // 組み立て直すと実際の公開先とずれる。
    setPublishedUrl(readPublishedUrl(data) ?? publicPostUrl(config, slug));
    const publishWarning = readWarning(data);
    setMessage(
      publishWarning
        ? `公開しました。ただし ${publishWarning}`
        : "公開を受け付けました。数分後にサイトへ反映されます。"
    );
  }

  async function unpublish() {
    if (!postId) return;
    if (!canEdit) {
      setMessage(VIEWER_BLOCKED.unpublish);
      return;
    }
    setIsUnpublishing(true);
    setMessage("公開取り下げを開始しています...");
    const res = await fetch(`${postApi(postId)}/unpublish`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    setIsUnpublishing(false);

    if (res.status === 401) {
      location.href = ADMIN_PATHS.login;
      return;
    }
    if (!res.ok) {
      setMessage(
        readRequestError(
          res,
          data,
          "公開を取り下げできませんでした。時間をおいて再度お試しください。"
        )
      );
      return;
    }
    setStatus("draft");
    setPublishedUrl("");
    const unpublishWarning = readWarning(data);
    setMessage(
      unpublishWarning
        ? `公開を取り下げました。ただし ${unpublishWarning}`
        : "公開取り下げを受け付けました。数分後にサイトから非表示になります。"
    );
  }

  function insertMarkdown(text: string) {
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

  async function uploadImage(file: File, target: "body" | "hero") {
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
      setMessage(
        `この写真は ${formatBytes(prepared.file.size)} あり、アップロードの上限（${formatBytes(
          MAX_UPLOAD_BYTES
        )}）を超えています。別の写真をお試しください。`
      );
      return;
    }
    const optimizedNote = prepared.changed
      ? `（${formatBytes(prepared.originalSize)} → ${formatBytes(prepared.file.size)} に自動縮小）`
      : "";

    const formData = new FormData();
    formData.append("file", prepared.file);
    if (postId) formData.append("postId", postId);
    if (heroImageAlt) formData.append("alt", heroImageAlt);

    const res = await fetch(ADMIN_API.assetUpload, { method: "POST", body: formData });
    const data = (await res.json().catch(() => ({}))) as {
      asset?: { publicPath?: string; alt?: string };
      message?: string;
    };
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
    } else {
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
    const data = (await res.json().catch(() => ({}))) as {
      category?: AdminCategory;
      message?: string;
    };
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
      return [...filtered, data.category as AdminCategory];
    });
    setCategorySlug(data.category.slug);
    setCategoryLabel(data.category.label);
    setNewCategorySlug("");
    setNewCategoryLabel("");
    setMessage("カテゴリを追加しました。");
  }

  async function deleteCategory(category: AdminCategory) {
    if (
      !window.confirm(
        `カテゴリ「${category.label}」を削除します。\n\nこのカテゴリを使っている記事は削除されませんが、次に公開したときのカテゴリ表示が変わることがあります。\n\n削除しますか？`
      )
    ) {
      return;
    }
    setDeletingCategoryId(category.id);
    setMessage("");
    const res = await fetch(categoryApi(category.id), { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
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

  return (
    <main className="min-h-screen bg-[rgb(247,247,247)] pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
          <Link
            href={ADMIN_PATHS.posts}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border"
          >
            <ArrowLeft size={18} />
            <span className="sr-only">記事一覧へ戻る</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold">{title || "新規記事"}</p>
            <p className="text-[11px] text-foreground/55">{headerStatus}</p>
          </div>
          <AdminLogoutButton className="h-10 w-10 shrink-0" />
          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              onClick={() => void save("draft")}
              disabled={!canEdit || isSaving || isLoading || isUnpublishing}
              title={canEdit ? "下書きを保存する" : VIEWER_NOTICE}
              className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存
            </button>
            {canUnpublish && (
              <button
                type="button"
                onClick={() => void unpublish()}
                disabled={!canEdit || isUnpublishing || isPublishing || isSaving}
                title={canEdit ? "公開を取り下げる" : VIEWER_NOTICE}
                className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground/75 disabled:opacity-50"
              >
                {isUnpublishing ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <EyeOff size={16} />
                )}
                取り下げ
              </button>
            )}
            {canEdit && !canPublish && missingFields.length > 0 && (
              <span className="hidden max-w-[260px] text-[11px] leading-tight text-amber-600 md:inline">
                公開には未入力あり：{missingFields.join("・")}
              </span>
            )}
            <button
              type="button"
              onClick={() => void publish()}
              disabled={!canEdit || !canPublish || isPublishing || isSaving || isUnpublishing}
              title={publishButtonTitle(canEdit, canPublish, missingFields)}
              className="flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-bold text-background disabled:opacity-40"
            >
              {isPublishing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              公開
            </button>
          </div>
        </div>
      </header>

      {!canEdit && (
        <div className="border-b border-border bg-muted px-4 py-2 text-center text-[13px] font-bold text-foreground/75">
          {VIEWER_NOTICE}
        </div>
      )}

      <div className="mx-auto grid max-w-[1180px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="mb-4 grid grid-cols-2 rounded-lg border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setTab("edit")}
              className={`flex h-10 items-center justify-center gap-2 rounded-md text-[13px] font-bold ${
                tab === "edit" ? "bg-foreground text-background" : "text-foreground/70"
              }`}
            >
              <Check size={16} />
              編集
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={`flex h-10 items-center justify-center gap-2 rounded-md text-[13px] font-bold ${
                tab === "preview" ? "bg-foreground text-background" : "text-foreground/70"
              }`}
            >
              <Eye size={16} />
              プレビュー
            </button>
          </div>

          {message ? (
            <p className="mb-4 rounded-lg border border-border bg-background p-3 text-[13px]">
              {message}
            </p>
          ) : null}

          {tab === "edit" ? (
            <div className="grid gap-4">
              <p className="rounded-lg border border-dashed border-border bg-background p-3 text-[12px] leading-5 text-foreground/65">
                公開に必要なのは「{missingRequirementNames(config)}」だけです。それ以外は未入力でも、公開時に自動で設定されます（右側の「詳細設定」で個別に指定することもできます）。
              </p>
              {canEdit && !canPublish && missingFields.length > 0 && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] font-bold leading-5 text-amber-700 md:hidden">
                  公開するには「{missingFields.join("」「")}」の入力が必要です。
                </p>
              )}
              <label className="block text-[13px] font-bold">
                タイトル
                <input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (!postId) setSlug(slugify(event.target.value));
                  }}
                  readOnly={!canEdit}
                  className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-3 text-[16px] outline-none focus:border-foreground"
                  placeholder="記事タイトル"
                />
              </label>

              <div className="text-[13px] font-bold">
                <div className="flex items-center justify-between gap-3">
                  <span>本文</span>
                  <button
                    type="button"
                    onClick={() => switchEditorMode(editorMode === "rich" ? "markdown" : "rich")}
                    // 閲覧専用でも、マークダウン原文を見たい人はいるので切り替えは残す
                    className="text-[12px] font-bold text-foreground/55 underline underline-offset-2"
                  >
                    {editorMode === "rich" ? "マークダウンで編集" : "通常の編集に戻す"}
                  </button>
                </div>
                {editorMode === "rich" ? (
                  <RichTextEditor
                    ref={richEditorRef}
                    markdown={bodyMarkdown}
                    onChange={setBodyMarkdown}
                    onRequestImage={() => bodyImageInputRef.current?.click()}
                    editable={canEdit}
                  />
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={bodyMarkdown}
                    onChange={(event) => setBodyMarkdown(event.target.value)}
                    readOnly={!canEdit}
                    className="mt-2 min-h-[460px] w-full rounded-lg border border-border bg-background px-3 py-3 font-mono text-[15px] leading-7 outline-none focus:border-foreground"
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
          ) : (
            <article className="rounded-lg border border-border bg-background px-4 py-5 sm:px-6">
              <p className="text-[12px] font-bold text-foreground/55">
                {categoryLabel || "カテゴリ未設定"}
              </p>
              <h1 className="mt-2 text-[26px] font-bold leading-tight">
                {title || "記事タイトル"}
              </h1>
              <p className="mt-2 text-[13px] text-foreground/55">{date}</p>
              {heroImageKey ? (
                <img
                  src={heroImageKey}
                  alt={heroImageAlt || ""}
                  className="mt-5 aspect-[16/9] w-full rounded-lg object-cover"
                />
              ) : null}
              {excerpt ? (
                <p className="mt-5 text-[15px] font-bold leading-7">{excerpt}</p>
              ) : null}
              <div className="mt-7 grid gap-4 text-[15px] leading-8">
                {previewBlocks.map((block, index) => {
                  if (block.kind === "h1") {
                    return (
                      <h2
                        key={`${block.kind}-${index}`}
                        className="text-[24px] font-bold leading-tight"
                      >
                        {block.text}
                      </h2>
                    );
                  }
                  if (block.kind === "h2") {
                    return (
                      <h2
                        key={`${block.kind}-${index}`}
                        className="border-l-4 border-foreground pl-3 text-[22px] font-bold leading-tight"
                      >
                        {block.text}
                      </h2>
                    );
                  }
                  if (block.kind === "h3") {
                    return (
                      <h3 key={`${block.kind}-${index}`} className="text-[18px] font-bold">
                        {block.text}
                      </h3>
                    );
                  }
                  if (block.kind === "li") {
                    return <p key={`${block.kind}-${index}`}>・{block.text}</p>;
                  }
                  if (block.kind === "image" && block.src) {
                    return (
                      <img
                        key={`${block.kind}-${index}`}
                        src={block.src}
                        alt={block.alt || ""}
                        className="aspect-[16/9] w-full rounded-lg object-cover"
                      />
                    );
                  }
                  return <p key={`${block.kind}-${index}`}>{block.text}</p>;
                })}
              </div>
            </article>
          )}
        </section>

        <aside className="grid gap-4 self-start lg:sticky lg:top-[76px]">
          <section className="rounded-lg border border-border bg-background p-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="flex w-full items-center justify-between gap-2 text-left text-[14px] font-bold"
              aria-expanded={showAdvanced}
            >
              <span className="flex items-center gap-2">
                詳細設定（任意）
                {canEdit && hasMissingInAdvanced && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    未入力あり
                  </span>
                )}
              </span>
              <ChevronDown
                size={18}
                className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              />
            </button>
            <p className="mt-2 text-[12px] leading-5 text-foreground/55">
              slug・カテゴリ・要約・著者・SEO などは未入力でも、公開時に自動で設定されます。指定したい場合だけ開いてください。
            </p>
          </section>

          {showAdvanced ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-[14px] font-bold">公開設定</h2>
              <div className="mt-4 grid gap-4">
                <label className="block text-[12px] font-bold">
                  slug
                  <input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    disabled={Boolean(postId) || !canEdit}
                    className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px] disabled:bg-muted disabled:text-foreground/55"
                  />
                </label>
                <label className="block text-[12px] font-bold">
                  公開日
                  <input
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    type="date"
                    disabled={!canEdit}
                    className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                  />
                </label>
                <label className="block text-[12px] font-bold">
                  カテゴリ
                  <select
                    value={categorySlug}
                    onChange={(event) => {
                      const next = categories.find(
                        (category) => category.slug === event.target.value
                      );
                      setCategorySlug(event.target.value);
                      setCategoryLabel(next?.label || "");
                    }}
                    disabled={!canEdit}
                    className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                  >
                    <option value="">選択してください</option>
                    {categories.map((category) => (
                      <option key={category.id || category.slug} value={category.slug}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12px] font-bold">
                  要約（任意・未入力なら本文から自動作成）
                  <textarea
                    value={excerpt}
                    onChange={(event) => setExcerpt(event.target.value)}
                    readOnly={!canEdit}
                    className="mt-2 min-h-[96px] w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] leading-6"
                  />
                </label>
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-[14px] font-bold">写真</h2>
            <input
              ref={heroImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file, "hero");
                event.target.value = "";
              }}
            />
            <input
              ref={bodyImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file, "body");
                event.target.value = "";
              }}
            />
            {heroImageKey ? (
              <img
                src={heroImageKey}
                alt={heroImageAlt || ""}
                className="mt-4 aspect-[16/9] w-full rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="mt-4 flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-[12px] font-bold text-foreground/45">
                アイキャッチ未設定
              </div>
            )}
            <button
              type="button"
              onClick={() => heroImageInputRef.current?.click()}
              disabled={!canEdit || isUploading}
              title={canEdit ? undefined : VIEWER_NOTICE}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-bold text-background disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <ImagePlus size={16} />
              )}
              アイキャッチ画像をアップロード
            </button>
            <button
              type="button"
              onClick={() => bodyImageInputRef.current?.click()}
              disabled={!canEdit || isUploading}
              title={canEdit ? undefined : VIEWER_NOTICE}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-bold disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <ImagePlus size={16} />
              )}
              本文に画像を挿入
            </button>
            <label className="mt-4 block text-[12px] font-bold">
              画像パス
              <input
                value={heroImageKey}
                onChange={(event) => setHeroImageKey(event.target.value)}
                readOnly={!canEdit}
                className="mt-2 h-11 w-full rounded-md border border-border bg-muted px-3 text-[13px] text-foreground/65"
                placeholder="アップロードすると自動で入ります"
              />
            </label>
            <label className="mt-4 block text-[12px] font-bold">
              画像説明
              <input
                value={heroImageAlt}
                onChange={(event) => setHeroImageAlt(event.target.value)}
                readOnly={!canEdit}
                className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
              />
            </label>
          </section>

          {showAdvanced ? (
            <>
              <section className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-[14px] font-bold">新規カテゴリ</h2>
                <div className="mt-4 grid gap-3">
                  <input
                    value={newCategoryLabel}
                    onChange={(event) => {
                      setNewCategoryLabel(event.target.value);
                      if (!newCategorySlug) setNewCategorySlug(slugify(event.target.value));
                    }}
                    readOnly={!canEdit}
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                    placeholder="表示名"
                  />
                  <input
                    value={newCategorySlug}
                    onChange={(event) => setNewCategorySlug(event.target.value)}
                    readOnly={!canEdit}
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                    placeholder="slug"
                  />
                  <button
                    type="button"
                    onClick={() => void addCategory()}
                    disabled={!canEdit}
                    title={canEdit ? undefined : VIEWER_NOTICE}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-bold disabled:opacity-50"
                  >
                    <Plus size={16} />
                    追加
                  </button>
                </div>
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-[12px] font-bold text-foreground/55">現在のカテゴリ</p>
                  <div className="mt-3 grid gap-2">
                    {categories.map((category) => (
                      <div
                        key={category.id || category.slug}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold">{category.label}</p>
                          <p className="truncate text-[11px] text-foreground/45">
                            {category.slug}
                          </p>
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => void deleteCategory(category)}
                            disabled={deletingCategoryId === category.id}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground/65 disabled:opacity-40"
                            aria-label={`${category.label}を削除`}
                          >
                            {deletingCategoryId === category.id ? (
                              <Loader2 className="animate-spin" size={15} />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-[14px] font-bold">SEO / 補足</h2>
                <div className="mt-4 grid gap-4">
                  <label className="block text-[12px] font-bold">
                    著者
                    <input
                      value={author}
                      onChange={(event) => setAuthor(event.target.value)}
                      readOnly={!canEdit}
                      className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                    />
                  </label>
                  <label className="block text-[12px] font-bold">
                    著者肩書き
                    <input
                      value={authorRole}
                      onChange={(event) => setAuthorRole(event.target.value)}
                      readOnly={!canEdit}
                      className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                    />
                  </label>
                  <label className="block text-[12px] font-bold">
                    OG説明
                    <textarea
                      value={ogDescription}
                      onChange={(event) => setOgDescription(event.target.value)}
                      readOnly={!canEdit}
                      className="mt-2 min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] leading-6"
                    />
                  </label>
                  <label className="block text-[12px] font-bold">
                    タグ（カンマ区切り）
                    <input
                      value={tagsText}
                      onChange={(event) => setTagsText(event.target.value)}
                      readOnly={!canEdit}
                      className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
                    />
                  </label>
                  <label className="block text-[12px] font-bold">
                    FAQ（1行に「質問 | 回答」）
                    <textarea
                      value={faqText}
                      onChange={(event) => setFaqText(event.target.value)}
                      readOnly={!canEdit}
                      className="mt-2 min-h-[112px] w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] leading-6"
                    />
                  </label>
                </div>
              </section>
            </>
          ) : null}
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 py-3 md:hidden">
        <div
          className={`mx-auto grid max-w-[520px] gap-3 ${
            canUnpublish ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          <button
            type="button"
            onClick={() => void save("draft")}
            disabled={!canEdit || isSaving || isLoading || isUnpublishing}
            title={canEdit ? undefined : VIEWER_NOTICE}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-bold disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
            保存
          </button>
          {canUnpublish && (
            <button
              type="button"
              onClick={() => void unpublish()}
              disabled={!canEdit || isUnpublishing || isPublishing || isSaving}
              title={canEdit ? undefined : VIEWER_NOTICE}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-bold disabled:opacity-50"
            >
              {isUnpublishing ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <EyeOff size={17} />
              )}
              取り下げ
            </button>
          )}
          <button
            type="button"
            onClick={() => void publish()}
            disabled={!canEdit || !canPublish || isPublishing || isSaving || isUnpublishing}
            title={publishButtonTitle(canEdit, canPublish, missingFields)}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground text-[14px] font-bold text-background disabled:opacity-40"
          >
            {isPublishing ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
            公開
          </button>
        </div>
      </nav>
    </main>
  );
}

/** 公開ボタンの title。押せないときは、その理由（権限か未入力か）を出す。 */
function publishButtonTitle(
  canEdit: boolean,
  canPublish: boolean,
  missingFields: string[]
): string {
  if (!canEdit) return VIEWER_NOTICE;
  if (canPublish) return "公開する";
  return `公開には次の入力が必要です：${missingFields.join("・")}`;
}

/**
 * 案内文に出す「公開に必要な項目」の並び。
 * 利用者が自分で入力する項目だけを出す（サーバーが自動採番する slug は出さない）。
 */
function missingRequirementNames(config: BlogAdminConfig): string {
  return clientPublishRequirements(config)
    .map((field) => REQUIREMENT_LABELS[field] || field)
    .join("」「");
}
