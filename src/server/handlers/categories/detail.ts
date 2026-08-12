import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import { badRequest, json, nowIso, requireDb, requireUser } from "../../_shared/admin.js";
import { upsertGitHubFile } from "../../_shared/github.js";
import { CATEGORY_SELECT, categoryRowsToJson, type CategoryRow } from "../../_shared/posts.js";

function idParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export function createCategoryDetailHandlers(config: BlogAdminConfig) {
  const onRequestDelete: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config, ["admin"]);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const id = idParam(ctx.params.id);
    const category = await db
      .prepare(
        "SELECT * FROM categories WHERE id = ? AND client_id = ? AND is_active = 1 LIMIT 1"
      )
      .bind(id, user.client_id)
      .first<CategoryRow>();

    if (!category) return json({ ok: false, error: "not_found" }, { status: 404 });

    const usage = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM post_drafts WHERE client_id = ? AND category_slug = ?"
      )
      .bind(user.client_id, category.slug)
      .first<{ count: number }>();

    if ((usage?.count || 0) > 0) {
      return badRequest("このカテゴリを使っている記事があるため、削除できません。");
    }

    const now = nowIso();
    await db
      .prepare("UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ? AND client_id = ?")
      .bind(now, category.id, user.client_id)
      .run();

    const activeCategories = await db
      .prepare(CATEGORY_SELECT)
      .bind(user.client_id)
      .all<CategoryRow>();

    const categoryCommit = await upsertGitHubFile(
      ctx.env,
      config,
      config.content.categoriesJsonPath,
      categoryRowsToJson(activeCategories.results || []),
      `chore: remove blog category ${category.slug} from admin`
    );

    if (categoryCommit instanceof Response) {
      await db
        .prepare(
          "UPDATE categories SET is_active = 1, updated_at = ? WHERE id = ? AND client_id = ?"
        )
        .bind(nowIso(), category.id, user.client_id)
        .run();
      return categoryCommit;
    }

    return json({ ok: true, category: { id: category.id, slug: category.slug } });
  };

  return { onRequestDelete };
}
