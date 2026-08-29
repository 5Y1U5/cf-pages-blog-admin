import { badRequest, json, normalizeString, nowIso, readJson, requireDb, requireUser, } from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";
import { upsertGitHubFile } from "../../_shared/github.js";
import { CATEGORY_SELECT, categoryRowsToJson } from "../../_shared/posts.js";
function idParam(value) {
    if (Array.isArray(value))
        return value[0] || "";
    return value || "";
}
export function createCategoryDetailHandlers(config) {
    /** 有効なカテゴリを1件読む。無ければ 404 を返す。 */
    async function loadCategory(db, id, clientId) {
        const category = await db
            .prepare("SELECT * FROM categories WHERE id = ? AND client_id = ? AND is_active = 1 LIMIT 1")
            .bind(id, clientId)
            .first();
        if (!category)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        return category;
    }
    /** 有効なカテゴリ一覧を書き出し先の JSON へ反映する。 */
    async function commitCategoriesJson(ctx, db, clientId, message) {
        const rows = await db.prepare(CATEGORY_SELECT).bind(clientId).all();
        const commit = await upsertGitHubFile(ctx.env, config, config.content.categoriesJsonPath, categoryRowsToJson(rows.results || []), message);
        return commit instanceof Response ? commit : null;
    }
    /**
     * 表示名・説明の変更。
     *
     * `slug` と `code` は変えられない。記事側は `category_slug` で紐づき、書き出した
     * Markdown の frontmatter も `code` を持っているため、変えると既存記事との対応が切れる。
     * 名前を変えたいだけの用途はこの経路で足り、URL を変えたい場合は作り直して記事を移す。
     *
     * 権限は追加（POST /api/admin/categories）と同じにしてある。追加は upsert なので
     * すでに編集・公開の権限で表示名を上書きできる状態にあり、変更だけ管理者に絞っても
     * 実質的な制限にならない。
     */
    const onRequestPatch = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config, [
            "admin",
            "client_publisher",
        ]);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const category = await loadCategory(db, idParam(ctx.params.id), user.client_id);
        if (category instanceof Response)
            return category;
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        const requestedSlug = normalizeString(payload.slug);
        const requestedCode = normalizeString(payload.code);
        if ((requestedSlug && requestedSlug !== category.slug) ||
            (requestedCode && requestedCode !== (category.code || category.slug))) {
            return badRequest("スラッグとコードは変更できません。表示名だけを変更するか、新しいカテゴリを作ってください。");
        }
        const hasLabel = typeof payload.label === "string";
        const hasDescription = payload.description !== undefined;
        const label = hasLabel ? normalizeString(payload.label) : category.label;
        if (hasLabel && !label)
            return badRequest("表示名を入力してください。");
        const description = hasDescription
            ? normalizeString(payload.description) || null
            : category.description;
        const labelChanged = label !== category.label;
        const descriptionChanged = description !== category.description;
        // 何も変わらないなら DB も GitHub も触らない（意味の無いコミットを残さないため）。
        if (!labelChanged && !descriptionChanged) {
            return json({
                ok: true,
                category: {
                    id: category.id,
                    code: category.code,
                    slug: category.slug,
                    label: category.label,
                    description: category.description,
                },
                updatedPosts: 0,
            });
        }
        const now = nowIso();
        await db
            .prepare("UPDATE categories SET label = ?, description = ?, updated_at = ? WHERE id = ? AND client_id = ?")
            .bind(label, description, now, category.id, user.client_id)
            .run();
        // 記事側が持つ表示名も同じ名前へ揃える。ここを置いていくと、一覧は新しい名前・
        // 記事ページは古い名前という食い違いが残る。
        // post_drafts.updated_at は触らない（一覧の並びが「全部いま編集した」状態になるため）。
        let updatedPosts = 0;
        if (labelChanged) {
            const result = await db
                .prepare("UPDATE post_drafts SET category_label = ? WHERE client_id = ? AND category_slug = ?")
                .bind(label, user.client_id, category.slug)
                .run();
            updatedPosts = result.meta?.changes ?? 0;
        }
        const failed = await commitCategoriesJson(ctx, db, user.client_id, `chore: rename blog category ${category.slug} from admin`);
        if (failed) {
            // 書き出しに失敗したら D1 も元へ戻す。JSON と D1 がずれたまま残ると、
            // 次に誰かが記事を公開した時点で古い名前へ黙って戻る。
            await db
                .prepare("UPDATE categories SET label = ?, description = ?, updated_at = ? WHERE id = ? AND client_id = ?")
                .bind(category.label, category.description, nowIso(), category.id, user.client_id)
                .run();
            if (labelChanged) {
                await db
                    .prepare("UPDATE post_drafts SET category_label = ? WHERE client_id = ? AND category_slug = ?")
                    .bind(category.label, user.client_id, category.slug)
                    .run();
            }
            return failed;
        }
        await recordAudit(db, ctx.request, user, {
            action: "category.update",
            targetType: "category",
            targetId: category.id,
            summary: labelChanged ? `${category.label} → ${label}` : label,
        });
        return json({
            ok: true,
            category: {
                id: category.id,
                code: category.code,
                slug: category.slug,
                label,
                description,
            },
            updatedPosts,
        });
    };
    const onRequestDelete = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config, ["admin"]);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const category = await loadCategory(db, idParam(ctx.params.id), user.client_id);
        if (category instanceof Response)
            return category;
        const usage = await db
            .prepare("SELECT COUNT(*) AS count FROM post_drafts WHERE client_id = ? AND category_slug = ?")
            .bind(user.client_id, category.slug)
            .first();
        if ((usage?.count || 0) > 0) {
            return badRequest("このカテゴリを使っている記事があるため、削除できません。");
        }
        const now = nowIso();
        await db
            .prepare("UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ? AND client_id = ?")
            .bind(now, category.id, user.client_id)
            .run();
        const failed = await commitCategoriesJson(ctx, db, user.client_id, `chore: remove blog category ${category.slug} from admin`);
        if (failed) {
            await db
                .prepare("UPDATE categories SET is_active = 1, updated_at = ? WHERE id = ? AND client_id = ?")
                .bind(nowIso(), category.id, user.client_id)
                .run();
            return failed;
        }
        await recordAudit(db, ctx.request, user, {
            action: "category.delete",
            targetType: "category",
            targetId: category.id,
            summary: category.label,
        });
        return json({ ok: true, category: { id: category.id, slug: category.slug } });
    };
    return { onRequestPatch, onRequestDelete };
}
