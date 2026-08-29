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
  serverError,
} from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";
import { upsertGitHubFile } from "../../_shared/github.js";
import { CATEGORY_SELECT, categoryRowsToJson, type CategoryRow } from "../../_shared/posts.js";

interface CategoryPayload {
  slug?: string;
  label?: string;
  description?: string;
}

export function createCategoriesHandlers(config: BlogAdminConfig) {
  const onRequestGet: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const { results } = await db
      .prepare(
        `SELECT id, code, slug, label, description, is_active, created_at, updated_at
         FROM categories
         WHERE client_id = ? AND is_active = 1
         ORDER BY created_at ASC`
      )
      .bind(user.client_id)
      .all();

    return json({ ok: true, categories: results });
  };

  const onRequestPost: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config, [
      "admin",
      "client_publisher",
    ]);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const payload = await readJson<CategoryPayload>(ctx.request);
    if (payload instanceof Response) return payload;

    const slug = normalizeString(payload.slug).toLowerCase();
    const label = normalizeString(payload.label);
    const description = normalizeString(payload.description);
    if (!slug || !isValidSlug(slug)) return badRequest("valid slug is required.");
    if (!label) return badRequest("label is required.");

    // code は slug と同値で作成する。別の slug が同じ code を既に使っている場合、
    // UNIQUE(client_id, code) 違反で INSERT が 500 になる（ON CONFLICT は slug しか拾えない）。
    // 事前に検出して分かりやすいエラーを返す。
    const codeClash = await db
      .prepare(
        "SELECT 1 FROM categories WHERE client_id = ? AND code = ? AND slug <> ? LIMIT 1"
      )
      .bind(user.client_id, slug, slug)
      .first();
    if (codeClash) {
      return badRequest(
        `コード「${slug}」は別のカテゴリで使用済みです。別のスラッグにしてください。`
      );
    }

    // 書き出しに失敗したときに戻せるよう、上書き前の状態を控えておく。
    // 同じスラッグを送ると既存行の更新になる（削除済みの復活も含む）ため、
    // 「新規に入れた」のか「既にあった」のかで戻し方が変わる。
    const previous = await db
      .prepare("SELECT * FROM categories WHERE client_id = ? AND slug = ? LIMIT 1")
      .bind(user.client_id, slug)
      .first<CategoryRow>();

    const now = nowIso();
    const id = randomId("cat");
    // ON CONFLICT で既存行を更新したときに DB に残るのは既存行の id で、いま採番した id ではない。
    // 採番した方を返すと、画面のカテゴリ一覧に実在しない id が積まれ、
    // 追加直後にその項目を削除しようとしても効かなくなる。RETURNING で実際の行を返す。
    const row = await db
      .prepare(
        `INSERT INTO categories
         (id, client_id, code, slug, label, description, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(client_id, slug) DO UPDATE SET
           label = excluded.label,
           description = excluded.description,
           is_active = 1,
           updated_at = excluded.updated_at
         RETURNING id, code, slug, label, description`
      )
      .bind(id, user.client_id, slug, slug, label, description || null, user.id, now, now)
      .first<{
        id: string;
        code: string;
        slug: string;
        label: string;
        description: string | null;
      }>();

    if (!row) return serverError("カテゴリを保存できませんでした。");

    // 公開側がカテゴリ一覧として読むのは書き出した JSON なので、ここで反映しておく。
    // 記事を公開するまで書かれないままだと、追加したカテゴリが画面にはあるのに
    // サイトには無い状態が続く。
    const categories = await db
      .prepare(CATEGORY_SELECT)
      .bind(user.client_id)
      .all<CategoryRow>();
    const commit = await upsertGitHubFile(
      ctx.env,
      config,
      config.content.categoriesJsonPath,
      categoryRowsToJson(categories.results || []),
      `chore: add blog category ${slug} from admin`
    );
    if (commit instanceof Response) {
      if (previous) {
        await db
          .prepare(
            `UPDATE categories SET label = ?, description = ?, is_active = ?, updated_at = ?
             WHERE id = ? AND client_id = ?`
          )
          .bind(
            previous.label,
            previous.description,
            previous.is_active,
            nowIso(),
            row.id,
            user.client_id
          )
          .run();
      } else {
        await db
          .prepare("DELETE FROM categories WHERE id = ? AND client_id = ?")
          .bind(row.id, user.client_id)
          .run();
      }
      return commit;
    }

    await recordAudit(db, ctx.request, user, {
      action: "category.create",
      targetType: "category",
      targetId: row.id,
      summary: row.label,
    });

    return json({ ok: true, category: row });
  };

  return { onRequestGet, onRequestPost };
}
