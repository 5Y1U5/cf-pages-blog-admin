import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import {
  badRequest,
  isValidSlug,
  json,
  normalizeString,
  nowIso,
  randomId,
  readJson,
  requireDb,
  requireUser,
} from "../../_shared/admin.js";
import { deriveExcerpt } from "../../_shared/posts.js";

interface CreatePostPayload {
  title?: string;
  slug?: string;
  date?: string;
  categorySlug?: string;
  categoryLabel?: string;
  excerpt?: string;
  heroImageKey?: string | null;
  heroImageAlt?: string | null;
  author?: string;
  authorRole?: string | null;
  bodyMarkdown?: string;
  ogDescription?: string | null;
  tags?: string[];
  faq?: { q: string; a: string }[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * タイトルから作った slug を URL として使ってよいか。
 *
 * 日本語のタイトルでも数字や英字が混ざっていれば slug は空にならないが、
 * 「3つのコツ」からは "3" しか残らず、記事を表さない URL になってしまう。
 * 英字を含み、ある程度の長さがあるものだけ採用し、残りは自動採番へ回す。
 */
function isUsableSlug(slug: string): boolean {
  return slug.length >= 3 && /[a-z]/.test(slug);
}

// 日本語のみのタイトルなどで slug が空になる場合の自動採番フォールバック。
// 例: post-20260615-a1b2c3
function fallbackSlug(): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
  return `post-${ymd}-${rand}`;
}

// 既存 slug と衝突する場合は -2, -3, … と連番を付けてユニークな slug を返す。
// UNIQUE(client_id, slug) 制約違反で INSERT が 500 になるのを防ぐ。
async function ensureUniqueSlug(
  db: D1Database,
  clientId: string,
  base: string
): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await db
      .prepare("SELECT 1 FROM post_drafts WHERE client_id = ? AND slug = ? LIMIT 1")
      .bind(clientId, candidate)
      .first();
    if (!existing) return candidate;
  }
  return `${base}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`;
}

export function createPostsHandlers(config: BlogAdminConfig) {
  const onRequestGet: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const { results } = await db
      .prepare(
        `SELECT id, slug, title, date, category_slug, category_label, status,
                hero_image_key, hero_image_alt, published_url, updated_at
         FROM post_drafts
         WHERE client_id = ?
         ORDER BY date DESC, updated_at DESC`
      )
      .bind(user.client_id)
      .all();

    return json({ ok: true, posts: results });
  };

  const onRequestPost: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config, [
      "admin",
      "client_publisher",
    ]);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const payload = await readJson<CreatePostPayload>(ctx.request);
    if (payload instanceof Response) return payload;

    const title = normalizeString(payload.title);
    if (!title) return badRequest("タイトルを入力してください。");

    // slug はタイトルから自動生成し、有効化できなければ自動採番する（利用者は触らなくてよい）。
    // 明示指定された slug は形式さえ正しければ尊重する。タイトルから作った slug は、
    // 記事を表さない短いもの（日本語タイトルの数字だけ等）なら自動採番に回す。
    const givenSlug = normalizeString(payload.slug);
    const derivedSlug = slugify(title);
    const requestedSlug = givenSlug || (isUsableSlug(derivedSlug) ? derivedSlug : "");
    const baseSlug =
      requestedSlug && isValidSlug(requestedSlug) ? requestedSlug : fallbackSlug();
    // 同名タイトル等で slug が衝突する場合は連番を付けてユニーク化する。
    const slug = await ensureUniqueSlug(db, user.client_id, baseSlug);

    // カテゴリ・要約・本文は下書き時点では任意（公開時に自動補完する）。
    const date = normalizeString(payload.date) || new Date().toISOString().slice(0, 10);
    const categorySlug = normalizeString(payload.categorySlug);
    const categoryLabel = normalizeString(payload.categoryLabel);

    const bodyMarkdown = normalizeString(payload.bodyMarkdown);
    // 抜粋未入力なら本文から自動生成する。
    const excerpt = normalizeString(payload.excerpt) || deriveExcerpt(bodyMarkdown);

    const now = nowIso();
    const id = randomId("post");
    // 初回保存（新規作成）でも hero 画像・著者・著者肩書・OG 説明・タグ・FAQ を取りこぼさない
    // ように、更新（PUT）と同じフィールドを保存する。
    await db
      .prepare(
        `INSERT INTO post_drafts
         (id, client_id, slug, title, date, category_slug, category_label, excerpt,
          hero_image_key, hero_image_alt, author, author_role, body_markdown,
          og_description, status, tags_json, faq_json, created_by, updated_by,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        user.client_id,
        slug,
        title,
        date,
        categorySlug,
        categoryLabel,
        excerpt,
        payload.heroImageKey || null,
        payload.heroImageAlt || null,
        normalizeString(payload.author) || config.defaultAuthor,
        payload.authorRole || null,
        bodyMarkdown,
        payload.ogDescription || null,
        JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
        JSON.stringify(Array.isArray(payload.faq) ? payload.faq : []),
        user.id,
        user.id,
        now,
        now
      )
      .run();

    return json({ ok: true, post: { id, slug } }, { status: 201 });
  };

  return { onRequestGet, onRequestPost };
}
