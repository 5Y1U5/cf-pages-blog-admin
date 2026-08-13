import { postFilePath, publicPostUrl, resolveDefaultCategory, } from "../../../config/index.js";
import { badRequest, json, nowIso, requireDb, requireUser } from "../../_shared/admin.js";
import { describeCommitFailure, upsertGitHubFile } from "../../_shared/github.js";
import { CATEGORY_SELECT, categoryRowsToJson, deriveExcerpt, draftToMarkdown, } from "../../_shared/posts.js";
const REQUIREMENT_LABELS = {
    title: "タイトル",
    body: "本文",
    slug: "slug",
    date: "公開日",
    category: "カテゴリ",
};
// 本文から最初の画像URL（![alt](src) の src）を取り出す。
function firstImageFromBody(markdown) {
    const match = markdown.match(/!\[[^\]]*\]\(([^)]+)\)/);
    return match ? match[1].trim() : null;
}
function hasRequirement(post, field) {
    switch (field) {
        case "title":
            return Boolean(post.title);
        case "body":
            return Boolean(post.body_markdown);
        case "slug":
            return Boolean(post.slug);
        case "date":
            return Boolean(post.date);
        case "category":
            return Boolean(post.category_slug && post.category_label);
        default:
            return true;
    }
}
function missingRequirements(post, required) {
    return required.filter((field) => !hasRequirement(post, field));
}
/** 設定のタイムゾーンで見た「今日」（YYYY-MM-DD）。 */
function todayInConfiguredZone(config) {
    const offsetMs = config.publish.timezoneOffsetMinutes * 60 * 1000;
    return new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
}
async function resetPublishingStatus(db, post, userId) {
    const rollbackStatus = ["draft", "review", "approved", "archived"].includes(post.status)
        ? post.status
        : "approved";
    await db
        .prepare(`UPDATE post_drafts
       SET status = ?, updated_by = ?, updated_at = ?
       WHERE id = ? AND client_id = ?`)
        .bind(rollbackStatus, userId, nowIso(), post.id, post.client_id)
        .run();
}
export function createPublishHandlers(config) {
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
        const post = await db
            .prepare("SELECT * FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (!post)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        const missing = missingRequirements(post, config.publish.requiredFields);
        if (missing.length > 0) {
            const labels = missing.map((field) => REQUIREMENT_LABELS[field]).join("と");
            return badRequest(`公開するには${labels}を入力してください。`);
        }
        const categories = await db
            .prepare(CATEGORY_SELECT)
            .bind(user.client_id)
            .all();
        const categoryRows = categories.results || [];
        // --- 未入力項目の自動補完 ---
        // 既定カテゴリの選び方は画面側の初期選択と共通（preferredSlugs → defaultSlug → 先頭）。
        // 削除済み（is_active = 0）は候補から外す。画面のカテゴリ一覧も有効なものしか返さないため、
        // ここで拾うと「画面に出ていないカテゴリで公開される」ことになる。
        const preferredCategory = resolveDefaultCategory(config, categoryRows.filter((category) => category.is_active === 1));
        const categorySlug = post.category_slug || preferredCategory?.slug || config.category.defaultSlug;
        const categoryLabel = post.category_label || preferredCategory?.label || config.category.defaultLabel;
        const today = todayInConfiguredZone(config);
        const date = post.date || today;
        // 予約公開（指定日に自動公開）は未対応：静的サイトを定期再ビルドする仕組みが無い構成では、
        // 未来日付で公開すると公開側の date<=today フィルタで除外され、再ビルドされるまで
        // 「公開成功なのに表示されない」状態になる。サイレント失敗を防ぐためブロックする。
        if (config.publish.blockFutureDate && date > today) {
            return badRequest(`公開日「${date}」が未来の日付です。予約公開（指定日に自動で公開）は未対応のため、` +
                `本日（${today}）以前の日付にするか、下書きのままにしてください。`);
        }
        const excerpt = post.excerpt || deriveExcerpt(post.body_markdown);
        const heroImageKey = post.hero_image_key ||
            firstImageFromBody(post.body_markdown) ||
            config.content.defaultHeroImage;
        const heroImageAlt = post.hero_image_alt || post.title;
        const author = post.author || config.defaultAuthor;
        const ogDescription = post.og_description || excerpt || null;
        const now = nowIso();
        // 補完値を DB へ反映しつつ publishing に切り替える（管理画面側にも反映される）。
        await db
            .prepare(`UPDATE post_drafts
         SET status = 'publishing',
             date = ?,
             category_slug = ?,
             category_label = ?,
             excerpt = ?,
             hero_image_key = ?,
             hero_image_alt = ?,
             author = ?,
             og_description = ?,
             updated_by = ?,
             updated_at = ?
         WHERE id = ? AND client_id = ?`)
            .bind(date, categorySlug, categoryLabel, excerpt, heroImageKey, heroImageAlt, author, ogDescription, user.id, now, post.id, user.client_id)
            .run();
        const effectivePost = {
            ...post,
            date,
            category_slug: categorySlug,
            category_label: categoryLabel,
            excerpt,
            hero_image_key: heroImageKey,
            hero_image_alt: heroImageAlt,
            author,
            og_description: ogDescription,
            status: "published",
        };
        // github.mode が "backup" のサイトは公開ページが D1 を直接読むので、
        // コミットに失敗しても公開そのものは成立させる（警告だけ返す）。
        // "source" のサイトはコミットした Markdown が記事の実体なので、失敗したら状態を戻す。
        const commitIsOptional = config.github.mode === "backup";
        let warning = null;
        const failedCommit = async (response) => {
            if (!commitIsOptional) {
                await resetPublishingStatus(db, post, user.id);
                return response;
            }
            warning = await describeCommitFailure(response);
            return null;
        };
        const categoryJson = categoryRowsToJson(categoryRows);
        const categoryCommit = await upsertGitHubFile(ctx.env, config, config.content.categoriesJsonPath, categoryJson, "chore: update blog categories from admin");
        if (categoryCommit instanceof Response) {
            const aborted = await failedCommit(categoryCommit);
            if (aborted)
                return aborted;
        }
        const markdown = draftToMarkdown(effectivePost, config, categoryRows);
        const postCommit = await upsertGitHubFile(ctx.env, config, postFilePath(config, effectivePost.slug), markdown, `post: publish ${effectivePost.slug} from admin`);
        if (postCommit instanceof Response) {
            const aborted = await failedCommit(postCommit);
            if (aborted)
                return aborted;
        }
        const commitSha = postCommit instanceof Response ? null : postCommit.commitSha;
        const publishedUrl = publicPostUrl(config, effectivePost.slug);
        await db
            .prepare(`UPDATE post_drafts
         SET status = 'published',
             published_url = ?,
             published_commit_sha = ?,
             last_published_at = ?,
             updated_by = ?,
             updated_at = ?
         WHERE id = ? AND client_id = ?`)
            .bind(publishedUrl, commitSha, nowIso(), user.id, nowIso(), post.id, user.client_id)
            .run();
        return json({
            ok: true,
            status: "publishing",
            publishedUrl,
            commitSha,
            ...(warning ? { warning } : {}),
        });
    };
    return { onRequestPost };
}
