import type { BlogAdminConfig } from "../../config/index.js";
import { normalizeString } from "./admin.js";

export interface PostDraftRow {
  id: string;
  client_id: string;
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
  source_path: string | null;
  source_hash: string | null;
  published_url: string | null;
  published_commit_sha: string | null;
  last_published_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  client_id: string;
  code: string;
  slug: string;
  label: string;
  description: string | null;
  is_active: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** カテゴリ行を読み出す共通クエリ（列の並びを1か所に揃えるため）。 */
export const CATEGORY_SELECT = `SELECT id, client_id, code, slug, label, description, is_active,
        created_by, created_at, updated_at
 FROM categories
 WHERE client_id = ?
 ORDER BY created_at ASC`;

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function yamlArray(name: string, values: unknown[]): string[] {
  if (values.length === 0) return [];
  if (values.every((v) => typeof v === "string")) {
    return [`${name}: [${values.map((v) => yamlString(String(v))).join(", ")}]`];
  }

  const lines = [`${name}:`];
  for (const value of values) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const q = normalizeString(record.q);
    const a = normalizeString(record.a);
    if (!q || !a) continue;
    lines.push(`  - q: ${yamlString(q)}`);
    lines.push(`    a: ${yamlString(a)}`);
  }
  return lines.length > 1 ? lines : [];
}

// 本文（Markdown）から抜粋を自動生成する。抜粋が未入力でも公開できるようにするため、
// 記法を落としたプレーンテキストの先頭 max 文字を要約として使う。
export function deriveExcerpt(body: string, max = 120): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ") // コードブロック
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // リンク → テキストのみ
    .replace(/^#{1,6}\s+/gm, "") // 見出し記号
    .replace(/^[\s>*\-+]+/gm, "") // 引用・リスト記号
    .replace(/[*_`#]/g, "") // 強調・インライン記号
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function categoryCodeForDraft(draft: PostDraftRow, categories: CategoryRow[]): string {
  return (
    categories.find(
      (category) =>
        category.slug === draft.category_slug || category.code === draft.category_slug
    )?.code ||
    draft.category_slug
  );
}

export function draftToMarkdown(
  draft: PostDraftRow,
  config: BlogAdminConfig,
  categories: CategoryRow[] = []
): string {
  const tags = parseJsonArray(draft.tags_json);
  const faq = parseJsonArray(draft.faq_json);
  const categoryCode = categoryCodeForDraft(draft, categories);
  const heroImage =
    draft.hero_image_key && draft.hero_image_key.startsWith("/")
      ? draft.hero_image_key
      : draft.hero_image_key || "";

  const frontmatter = [
    "---",
    `slug: ${draft.slug}`,
    `title: ${yamlString(draft.title)}`,
    `date: ${yamlString(draft.date)}`,
    `category: ${yamlString(categoryCode)}`,
    `categoryLabel: ${yamlString(draft.category_label)}`,
    `excerpt: ${yamlString(draft.excerpt)}`,
    heroImage ? `${config.content.heroImageKey}: ${yamlString(heroImage)}` : null,
    draft.hero_image_alt
      ? `heroImageAlt: ${yamlString(draft.hero_image_alt)}`
      : null,
    `author: ${yamlString(draft.author || config.defaultAuthor)}`,
    draft.author_role ? `authorRole: ${yamlString(draft.author_role)}` : null,
    `draft: ${draft.status === "published" || draft.status === "publishing" ? "false" : "true"}`,
    draft.og_description
      ? `ogDescription: ${yamlString(draft.og_description)}`
      : null,
    ...yamlArray("tags", tags),
    ...yamlArray("faq", faq),
    "---",
  ].filter((line): line is string => typeof line === "string");

  return `${frontmatter.join("\n")}\n\n${draft.body_markdown.trim()}\n`;
}

export function categoryRowsToJson(rows: CategoryRow[]): string {
  const data = rows
    .filter((row) => row.is_active === 1)
    .map((row) => ({
      code: row.code || row.slug,
      slug: row.slug,
      label: row.label,
      ...(row.description ? { description: row.description } : {}),
    }));
  return `${JSON.stringify(data, null, 2)}\n`;
}
