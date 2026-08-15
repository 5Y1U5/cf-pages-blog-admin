import { badRequest, isValidSlug, json, normalizeString, nowIso, randomId, readJson, requireDb, requireUser, serverError, } from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";
export function createCategoriesHandlers(config) {
    const onRequestGet = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const { results } = await db
            .prepare(`SELECT id, code, slug, label, description, is_active, created_at, updated_at
         FROM categories
         WHERE client_id = ? AND is_active = 1
         ORDER BY created_at ASC`)
            .bind(user.client_id)
            .all();
        return json({ ok: true, categories: results });
    };
    const onRequestPost = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config, [
            "admin",
            "client_publisher",
        ]);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        const slug = normalizeString(payload.slug).toLowerCase();
        const label = normalizeString(payload.label);
        const description = normalizeString(payload.description);
        if (!slug || !isValidSlug(slug))
            return badRequest("valid slug is required.");
        if (!label)
            return badRequest("label is required.");
        // code は slug と同値で作成する。別の slug が同じ code を既に使っている場合、
        // UNIQUE(client_id, code) 違反で INSERT が 500 になる（ON CONFLICT は slug しか拾えない）。
        // 事前に検出して分かりやすいエラーを返す。
        const codeClash = await db
            .prepare("SELECT 1 FROM categories WHERE client_id = ? AND code = ? AND slug <> ? LIMIT 1")
            .bind(user.client_id, slug, slug)
            .first();
        if (codeClash) {
            return badRequest(`コード「${slug}」は別のカテゴリで使用済みです。別のスラッグにしてください。`);
        }
        const now = nowIso();
        const id = randomId("cat");
        // ON CONFLICT で既存行を更新したときに DB に残るのは既存行の id で、いま採番した id ではない。
        // 採番した方を返すと、画面のカテゴリ一覧に実在しない id が積まれ、
        // 追加直後にその項目を削除しようとしても効かなくなる。RETURNING で実際の行を返す。
        const row = await db
            .prepare(`INSERT INTO categories
         (id, client_id, code, slug, label, description, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(client_id, slug) DO UPDATE SET
           label = excluded.label,
           description = excluded.description,
           is_active = 1,
           updated_at = excluded.updated_at
         RETURNING id, code, slug, label, description`)
            .bind(id, user.client_id, slug, slug, label, description || null, user.id, now, now)
            .first();
        if (!row)
            return serverError("カテゴリを保存できませんでした。");
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
