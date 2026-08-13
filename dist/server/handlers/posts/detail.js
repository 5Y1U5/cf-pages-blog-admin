import { postFilePath } from "../../../config/index.js";
import { badRequest, json, normalizeString, nowIso, randomId, readJson, requireDb, requireUser, } from "../../_shared/admin.js";
import { deleteGitHubFile } from "../../_shared/github.js";
import { deriveExcerpt } from "../../_shared/posts.js";
const EDITABLE_STATUSES = ["draft", "review", "approved", "archived"];
export function createPostDetailHandlers(config) {
    const onRequestGet = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const post = await db
            .prepare("SELECT * FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (!post)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        return json({ ok: true, post });
    };
    const onRequestPut = async (ctx) => {
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
        // 下書き保存はタイトルだけ必須。カテゴリ・要約・本文は未入力でも保存できる（公開時に補完）。
        const title = normalizeString(payload.title);
        if (!title)
            return badRequest("タイトルを入力してください。");
        const categorySlug = normalizeString(payload.categorySlug);
        const categoryLabel = normalizeString(payload.categoryLabel);
        const bodyMarkdown = normalizeString(payload.bodyMarkdown);
        // 抜粋未入力なら本文から自動生成する。本文も空のまま保存できる仕様のため、
        // その場合は deriveExcerpt("") が空文字を返し既存の挙動を維持する。
        const excerpt = normalizeString(payload.excerpt) || deriveExcerpt(bodyMarkdown);
        const status = payload.status || "draft";
        if (!EDITABLE_STATUSES.includes(status)) {
            return badRequest("invalid status.");
        }
        const now = nowIso();
        // 更新前の状態を改訂履歴として保存する（誰がいつ何を変えたかの監査証跡）。
        const prior = await db
            .prepare("SELECT * FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (prior) {
            await db
                .prepare("INSERT INTO revisions (id, post_id, snapshot_json, changed_by, change_note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(randomId("rev"), String(ctx.params.id), JSON.stringify(prior), user.id, "update", now)
                .run();
        }
        const result = await db
            .prepare(`UPDATE post_drafts SET
           title = ?,
           date = ?,
           category_slug = ?,
           category_label = ?,
           excerpt = ?,
           hero_image_key = ?,
           hero_image_alt = ?,
           author = ?,
           author_role = ?,
           body_markdown = ?,
           og_description = ?,
           tags_json = ?,
           faq_json = ?,
           status = ?,
           updated_by = ?,
           updated_at = ?
         WHERE id = ? AND client_id = ?`)
            .bind(title, normalizeString(payload.date) || new Date().toISOString().slice(0, 10), categorySlug, categoryLabel, excerpt, payload.heroImageKey || null, payload.heroImageAlt || null, normalizeString(payload.author) || config.defaultAuthor, payload.authorRole || null, bodyMarkdown, payload.ogDescription || null, JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []), JSON.stringify(Array.isArray(payload.faq) ? payload.faq : []), status, user.id, now, ctx.params.id, user.client_id)
            .run();
        if (result.meta.changes === 0) {
            return json({ ok: false, error: "not_found" }, { status: 404 });
        }
        return json({ ok: true });
    };
    const onRequestDelete = async (ctx) => {
        // 物理削除で復元手段が無いため、許可するロールを設定で絞る（既定は管理者のみ）。
        const user = await requireUser(ctx.request, ctx.env, config, config.permissions.deletePost);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const post = await db
            .prepare("SELECT id, slug, status, published_url, source_path FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (!post)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        // GitHub 上に Markdown がある（公開済み/反映中、または取り込み元あり）場合は、
        // サイトからも消えるよう先にファイルを削除する。未公開の下書きはファイルが無いのでスキップ。
        const hasFile = post.status === "published" ||
            post.status === "publishing" ||
            Boolean(post.published_url) ||
            Boolean(post.source_path);
        if (hasFile) {
            const removed = await deleteGitHubFile(ctx.env, config, post.source_path || postFilePath(config, post.slug), `post: delete ${post.slug} from admin`);
            // github.mode: "backup" のサイトは公開ページが D1 を直接読むため、
            // 控えのファイルを消せなくても記事の削除自体は進める（消し残しは次の公開で上書きされる）。
            if (removed instanceof Response && config.github.mode !== "backup")
                return removed;
        }
        // 子レコードを後始末してから本体を削除する（revisions は FK 制約あり）。
        // 注: R2 上のアセット実体は残る（DB の asset 行のみ削除）。R2 の掃除は別途。
        await db.prepare("DELETE FROM revisions WHERE post_id = ?").bind(post.id).run();
        await db
            .prepare("DELETE FROM assets WHERE post_id = ? AND client_id = ?")
            .bind(post.id, user.client_id)
            .run();
        const result = await db
            .prepare("DELETE FROM post_drafts WHERE id = ? AND client_id = ?")
            .bind(post.id, user.client_id)
            .run();
        if (result.meta.changes === 0) {
            return json({ ok: false, error: "not_found" }, { status: 404 });
        }
        return json({ ok: true });
    };
    return { onRequestGet, onRequestPut, onRequestDelete };
}
